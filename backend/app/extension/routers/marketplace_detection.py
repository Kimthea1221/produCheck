from typing import Literal
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.sessions import get_db
from app.desktop.services.Product_database.registered_product_service import (
    increment_marketplace_detection_count as increment_registered_detection,
    increment_registered_detection_by_name,
)
from app.desktop.services.Product_database.unregistered_advisory_service import (
    increment_marketplace_detection_count as increment_unregistered_detection,
    increment_unregistered_detection_by_title,
)
from app.models.registered_products import RegisteredProduct
from app.models.unregistered_advisories import UnregisteredAdvisory


logger = logging.getLogger(__name__)


class DisplayedDetection(BaseModel):
    record_type: Literal["registered", "unregistered"]
    displayed_title: str


router = APIRouter()


def _normalize_title(value: str) -> str:
    return " ".join(value.split()).casefold()


@router.post("/marketplace-detections")
def increment_displayed_detection(
    detection: DisplayedDetection,
    db: Session = Depends(get_db),
):
    db.execute(text("SET app.bypass_rls = 'true'"))
    title = detection.displayed_title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="displayed_title is required")
    normalized_title = _normalize_title(title)
    logger.info("Displayed detection received: type=%s title=%r", detection.record_type, title)

    if detection.record_type == "registered":
        records = db.query(RegisteredProduct).filter(
            RegisteredProduct.deleted_at.is_(None),
        ).all()
        exact_matches = [
            item for item in records
            if item.product_name and _normalize_title(item.product_name) == normalized_title
        ]
        record = exact_matches[0] if exact_matches else None
        if record is None:
            matches = [
                item for item in records
                if item.product_name and _normalize_title(item.product_name) in normalized_title
            ]
            record = max(matches, key=lambda item: len(item.product_name), default=None)
        if record is None:
            incremented = increment_registered_detection_by_name(db, title)
            if not incremented:
                raise HTTPException(status_code=404, detail="Displayed registered record not found")
        else:
            incremented = increment_registered_detection(db, record.product_id)
    else:
        records = db.query(UnregisteredAdvisory).filter(
            UnregisteredAdvisory.deleted_at.is_(None),
        ).all()
        exact_matches = [
            item for item in records
            if item.product_name and _normalize_title(item.product_name) == normalized_title
        ]
        record = exact_matches[0] if exact_matches else None
        if record is None:
            matches = [
                item for item in records
                if item.product_name and _normalize_title(item.product_name) in normalized_title
            ]
            record = max(matches, key=lambda item: len(item.product_name), default=None)
        if record is None:
            incremented = increment_unregistered_detection_by_title(db, title)
            if not incremented:
                raise HTTPException(status_code=404, detail="Displayed unregistered record not found")
        else:
            incremented = increment_unregistered_detection(db, record.advisory_id)

    if not incremented:
        raise HTTPException(status_code=404, detail="Displayed record not found")
    logger.info("Displayed detection incremented: type=%s id=%s", detection.record_type, record.product_id if detection.record_type == "registered" else record.advisory_id)
    return {"success": True}
