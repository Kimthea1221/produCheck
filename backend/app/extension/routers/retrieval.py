import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.sessions import get_db
from app.desktop.services.Product_database.registered_product_service import (
    increment_registered_detection_by_name,
)
from app.desktop.services.Product_database.unregistered_advisory_service import (
    increment_unregistered_detection_by_title,
)
from nlp.retrieval.retrieval import evaluate_match, get_top_5_registered

logger = logging.getLogger(__name__)


class RetrievalRequest(BaseModel):
    title: str
    top_k: int = 5


router = APIRouter()


@router.post("/verify")
async def verify(request: RetrievalRequest, db: Session = Depends(get_db)):
    if not request.title or not request.title.strip():
        raise HTTPException(status_code=400, detail="title is required")

    try:
        evaluation_result = evaluate_match(request.title)
        verdict = evaluation_result.get("verdict", "no_match")
        raw_top5 = evaluation_result.get("top5_registered") or get_top_5_registered(request.title, request.top_k)

        top5_registered = [
            {
                "title": candidate.get("title") or candidate.get("full_product_info") or candidate.get("product_name", ""),
                "score": candidate.get("cosine_score", candidate.get("score", candidate.get("faiss_score", 0.0))),
                "cosine_score": candidate.get("cosine_score", candidate.get("score", 0.0)),
                "faiss_score": candidate.get("faiss_score", candidate.get("cosine_score", 0.0)),
                "brand_name": candidate.get("brand_name", ""),
                "product_name": candidate.get("product_name", ""),
                "full_product_info": candidate.get("full_product_info", ""),
                "rank": candidate.get("rank", idx),
            }
            for idx, candidate in enumerate(raw_top5, start=1)
        ]

        matched_unregistered = evaluation_result.get("matched_unregistered")

        # Automatically record marketplace detection count in the database
        if db is not None:
            try:
                if verdict == "unregistered" and matched_unregistered:
                    unreg_title = matched_unregistered.get("title") or matched_unregistered.get("product_name", "")
                    if unreg_title:
                        incremented = increment_unregistered_detection_by_title(db, unreg_title)
                        if incremented:
                            logger.info("Auto-incremented unregistered detection count for: %s", unreg_title)
                elif verdict == "registered" and top5_registered:
                    top_reg = top5_registered[0]
                    reg_product = top_reg.get("product_name") or top_reg.get("title", "")
                    reg_brand = top_reg.get("brand_name", "")
                    if reg_product:
                        incremented = increment_registered_detection_by_name(db, reg_product, reg_brand)
                        if incremented:
                            logger.info("Auto-incremented registered detection count for: %s", reg_product)
            except Exception as db_err:
                logger.warning("Could not auto-increment marketplace detection count: %s", db_err)

        return {
            "query": evaluation_result.get("query", request.title),
            "cleaned_query": evaluation_result.get("cleaned_query", ""),
            "verdict": verdict,
            "score": evaluation_result.get("score", 0.0),
            "reg_cos": evaluation_result.get("reg_cos", 0.0),
            "unreg_cos": evaluation_result.get("unreg_cos", 0.0),
            "top5_registered": top5_registered,
            "matched_unregistered": matched_unregistered,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/top5-registered")
async def top5_registered_endpoint(request: RetrievalRequest):
    if not request.title or not request.title.strip():
        raise HTTPException(status_code=400, detail="title is required")

    try:
        raw_top5 = get_top_5_registered(request.title, request.top_k)
        top5_registered = [
            {
                "title": candidate.get("title") or candidate.get("full_product_info") or candidate.get("product_name", ""),
                "score": candidate.get("cosine_score", candidate.get("score", 0.0)),
                "cosine_score": candidate.get("cosine_score", candidate.get("score", 0.0)),
                "brand_name": candidate.get("brand_name", ""),
                "product_name": candidate.get("product_name", ""),
                "full_product_info": candidate.get("full_product_info", ""),
                "rank": candidate.get("rank", idx),
            }
            for idx, candidate in enumerate(raw_top5, start=1)
        ]
        return {
            "query": request.title,
            "top5_registered": top5_registered,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/reload-assets")
async def reload_assets_endpoint():
    """Hot-reload all retrieval assets from disk into memory without restarting Uvicorn."""
    try:
        from nlp.retrieval.retrieval import reload_retrieval_assets
        res = reload_retrieval_assets()
        return res
    except Exception as exc:
        logger.error("Failed to reload retrieval assets: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/rebuild-assets")
async def rebuild_assets_endpoint():
    """Rebuild unregistered assets from CSV and hot-reload them into memory."""
    try:
        from nlp.retrieval.asset_sync import rebuild_unregistered_assets_and_reload
        res = rebuild_unregistered_assets_and_reload()
        return res
    except Exception as exc:
        logger.error("Failed to rebuild and reload assets: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
