# backend/app/desktop/routers/complaints/walkin_complaints.py
from uuid import UUID
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, Form, UploadFile, File, HTTPException, Request, Query
from app.core.audit import write_audit_log, get_user_region_code
from app.core.constants import AuditAction

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database.sessions import get_db
from app.core.dependencies import get_current_user
from app.desktop.schemas.complaints.complaints import ComplaintResponse
from app.desktop.services.drafts.draft_submit_service import (
    submit_walkin_draft,
    create_walkin_complaint_direct,
    update_walkin_complaint_direct,
)

# ADDED: shared LEA-only helper
from app.desktop.services.account_status.guards import assert_lea_user

from app.models.verification_requests import VerificationRequest
from app.models.walkin_complainants import WalkinComplainant
from app.desktop.schemas.complaints.complaints import WalkinComplaintListResponse
from app.models.complaints import Complaint

# Two separate routers in this one file, since these two endpoints
# need two different URL prefixes, even though they're closely
# related in purpose (both create real walk-in complaints).
draft_submit_router = APIRouter(prefix="/drafts/walkin", tags=["Walk-in Complaints"])
direct_complaint_router = APIRouter(prefix="/complaints/walkin", tags=["Walk-in Complaints"])


    #
    #
    #
    #
    #
    #
    # POST /drafts/walkin/{draft_id}/submit
@draft_submit_router.post("/{draft_id}/submit", response_model=ComplaintResponse)
def submit_draft(
    draft_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED: walk-in intake is LEA-only
    new_complaint = submit_walkin_draft(db, draft_id, current_user, request)
    return new_complaint


    #
    #
    #
    #
    #
    #
    # POST /complaints/walkin/
@direct_complaint_router.post("/", response_model=ComplaintResponse)
def create_complaint_direct(
    request: Request,
    full_name: str | None = Form(None, max_length=100),
    contact_number: str | None = Form(None, max_length=11),
    email: str | None = Form(None, max_length=254),
    id_type: str | None = Form(None),
    address: str | None = Form(None, max_length=300),
    amount_paid: float | None = Form(None),

    product_name: str = Form(..., max_length=150, min_length=2),
    manufacturer: str = Form(..., max_length=150, min_length=2),
    product_category: str = Form(..., max_length=150),
    place_of_purchase: str = Form(..., max_length=300, min_length=2),
    date_of_purchase: str = Form(...),
    nature_of_complaint: str = Form(...),

    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db), 
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    complainant_fields = {
        "full_name": full_name,
        "contact_number": contact_number,
        "email": email,
        "id_type": id_type,
        "address": address,
    }

    # Normalize CRLF (\r\n) → LF (\n) so the char count matches what the
    # browser's maxLength attribute reported to the officer. Without this,
    # a 2000-char textarea with 50 line breaks arrives as 2050 chars.
    if nature_of_complaint:
        nature_of_complaint = nature_of_complaint.replace('\r\n', '\n').replace('\r', '\n')

    if len(nature_of_complaint) < 10:
        raise HTTPException(status_code=422, detail="Nature of complaint must be at least 10 characters.")
    if len(nature_of_complaint) > 2000:
        raise HTTPException(status_code=422, detail="Nature of complaint must be at most 2000 characters.")

    complaint_fields = {
        "product_title": product_name,
        "manufacturer": manufacturer,
        "product_category": product_category,
        "place_of_purchase": place_of_purchase,
        "date_of_purchase": date.fromisoformat(date_of_purchase),
        "amount_paid": amount_paid,
        "nature_of_complaint": nature_of_complaint,
    }

    new_complaint = create_walkin_complaint_direct(
        db, current_user, complainant_fields, complaint_fields, files, request
    )
    return new_complaint


    #
    #
    #
    #
    #Ashanti code starts here
    #
    # GET /complaints/walkin/
@direct_complaint_router.get("/", response_model=list[WalkinComplaintListResponse])
def list_walkin_complaints(
    status: str | None = None,
    category: str | None = None,
    search: str | None = Query(None, max_length=150),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED: this list returns citizen names
    latest_request_subq = (
        db.query(
            VerificationRequest.complaint_id,
            func.max(VerificationRequest.requested_at).label("latest_requested_at"),
        )
        .group_by(VerificationRequest.complaint_id)
        .subquery()
    )

    rows = (
        db.query(Complaint, WalkinComplainant, VerificationRequest)
        .outerjoin(WalkinComplainant, Complaint.complainant_id == WalkinComplainant.complainant_id)
        .outerjoin(
            latest_request_subq,
            latest_request_subq.c.complaint_id == Complaint.complaint_id,
        )
        .outerjoin(
            VerificationRequest,
            (VerificationRequest.complaint_id == latest_request_subq.c.complaint_id)
            & (VerificationRequest.requested_at == latest_request_subq.c.latest_requested_at),
        )
        .filter(
            Complaint.source == "walk_in",
            Complaint.region_id == current_user.region_id,
            Complaint.deleted_at.is_(None),
        )
    )

    if category is not None:
        rows = rows.filter(Complaint.product_category == category)

    if search is not None:
        term = f"%{search}%"
        rows = rows.filter(
            (Complaint.case_reference.ilike(term))
            | (Complaint.product_title.ilike(term))
            | (WalkinComplainant.full_name.ilike(term))
        )

    results = []
    for complaint, complainant, vr in rows.order_by(Complaint.created_at.desc()).all():
        if complaint.status == "open":
            effective_status = "queued"
        elif vr:
            effective_status = vr.verification_request_status
        else:
            effective_status = "queued"

        if status is not None and effective_status != status:
            continue

        results.append(WalkinComplaintListResponse(
            complaint_id=complaint.complaint_id,
            case_reference=complaint.case_reference,
            product_title=complaint.product_title,
            manufacturer=complaint.manufacturer,
            product_category=complaint.product_category,
            complainant_name=complainant.full_name if complainant else None,
            status=effective_status,
            created_at=complaint.created_at,
        ))

    return results

    #
    #
    #
    #
    #
    # PUT /complaints/walkin/{complaint_id}
@direct_complaint_router.put("/{complaint_id}", response_model=ComplaintResponse)
def update_complaint_direct(
    complaint_id: UUID,
    request: Request,
    full_name: str | None = Form(None, max_length=100),
    contact_number: str | None = Form(None, max_length=11),
    email: str | None = Form(None, max_length=254),
    id_type: str | None = Form(None),
    address: str | None = Form(None, max_length=300),
    amount_paid: float | None = Form(None),

    product_name: str = Form(..., max_length=150, min_length=2),
    manufacturer: str = Form(..., max_length=150, min_length=2),
    product_category: str = Form(..., max_length=150),
    place_of_purchase: str = Form(..., max_length=300, min_length=2),
    date_of_purchase: str = Form(...),
    nature_of_complaint: str = Form(...),

    remove_attachment_ids: list[UUID] = Form(default=[]),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    complainant_fields = {
        "full_name": full_name,
        "contact_number": contact_number,
        "email": email,
        "id_type": id_type,
        "address": address,
    }

    # Same CRLF normalization as the POST path
    if nature_of_complaint:
        nature_of_complaint = nature_of_complaint.replace('\r\n', '\n').replace('\r', '\n')
        if len(nature_of_complaint) < 10 or len(nature_of_complaint) > 2000:
            raise HTTPException(
                status_code=422,
                detail="nature_of_complaint must be between 10 and 2000 characters."
            )

    complaint_fields = {
        "product_title": product_name,
        "manufacturer": manufacturer,
        "product_category": product_category,
        "place_of_purchase": place_of_purchase,
        "date_of_purchase": date.fromisoformat(date_of_purchase),
        "amount_paid": amount_paid,
        "nature_of_complaint": nature_of_complaint,
    }

    updated_complaint = update_walkin_complaint_direct(
        db, current_user, complaint_id, complainant_fields, complaint_fields, files, remove_attachment_ids, request
    )
    return updated_complaint


    #
    #
    #
    #
    #
    #
    # DELETE /complaints/walkin/{complaint_id}
@direct_complaint_router.delete("/{complaint_id}")
def delete_walkin_complaint(
    complaint_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    complaint = db.query(Complaint).filter(
        Complaint.complaint_id == complaint_id,
        Complaint.region_id == current_user.region_id,
        Complaint.source == "walk_in",
        Complaint.deleted_at.is_(None),
    ).first()

    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    if complaint.status != "open":
        raise HTTPException(
            status_code=400,
            detail="Only complaints in Ready to Send can be deleted.",
        )

    complaint.deleted_at = datetime.now(timezone.utc)
    complaint.deleted_by = current_user.user_id

    audit_region_code = get_user_region_code(db, current_user)
    audit_user_id = current_user.user_id
    audit_user_role = current_user.role
    db.commit()

    write_audit_log(
        db,
        user=None,
        user_id_override=audit_user_id,
        user_role_override=audit_user_role,
        action=AuditAction.DELETE_COMPLAINT_LOG,
        target_table="complaints",
        target_id=complaint.complaint_id,
        target_reference=complaint.case_reference,
        old_value={"status": complaint.status},
        new_value={"status": "deleted"},
        request=request,
        region_code=audit_region_code,
    )

    return {"message": "Complaint deleted successfully."}

#Ashanti code ends here
