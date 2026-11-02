from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List

from nlp.retrieval.retrieval import evaluate_match, get_top_5_registered


class RetrievalRequest(BaseModel):
    title: str
    top_k: int = 5


router = APIRouter()


@router.post("/verify")
async def verify(request: RetrievalRequest):
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

        return {
            "query": evaluation_result.get("query", request.title),
            "cleaned_query": evaluation_result.get("cleaned_query", ""),
            "verdict": verdict,
            "score": evaluation_result.get("score", 0.0),
            "reg_cos": evaluation_result.get("reg_cos", 0.0),
            "unreg_cos": evaluation_result.get("unreg_cos", 0.0),
            "top5_registered": top5_registered,
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
