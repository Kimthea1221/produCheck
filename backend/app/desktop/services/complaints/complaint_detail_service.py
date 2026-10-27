# backend/app/desktop/services/complaints/complaint_detail_service.py
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.complaints import Complaint
from app.models.walkin_complainants import WalkinComplainant
from app.models.shared_files import SharedFile
from app.desktop.schemas.complaints.complaints import (
    ComplaintVerificationDetailResponse,
    SharedFileResponse,
)


def get_complaint_verification_detail(db: Session, complaint_id: UUID, region_id: UUID) -> ComplaintVerificationDetailResponse:
    """
    Shared by two callers: the direct complaint-click flow (Case 1)
    and get_verification_draft (Case 2). Only exists here once, so
    both callers stay in sync automatically if this logic ever needs
    to change.
    """
    result = db.query(Complaint, WalkinComplainant).outerjoin(
        WalkinComplainant, Complaint.complainant_id == WalkinComplainant.complainant_id
    ).filter(
        Complaint.complaint_id == complaint_id,
        Complaint.region_id == region_id,
        Complaint.source == "walk_in",   # ADDED: LEA verification flow is walk-in only
        Complaint.deleted_at.is_(None),  #Add
    ).first()

    if not result:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    complaint, complainant = result

    files = db.query(SharedFile).filter(
            SharedFile.complaint_id == complaint_id,
            SharedFile.request_id.is_(None),   # ADDED: LEA's original evidence only
        ).all()
    
    return ComplaintVerificationDetailResponse(
        complaint_id=complaint.complaint_id,
        case_reference=complaint.case_reference,
        product_title=complaint.product_title,
        manufacturer=complaint.manufacturer,
        product_category=complaint.product_category,
        complainant_name=complainant.full_name if complainant else None,
        created_at=complaint.created_at,
        source=complaint.source,
        attached_files=[SharedFileResponse.model_validate(f) for f in files],
    )