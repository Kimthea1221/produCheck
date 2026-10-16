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


from app.desktop.services.verification.verification_helpers import get_walkin_effective_status   # ADDED

from app.models.verification_requests import VerificationRequest
from app.models.walkin_complainants import WalkinComplainant
from app.desktop.schemas.complaints.complaints import WalkinComplaintListResponse
from app.models.complaints import Complaint

# Two separate routers in this one file, since these two endpoints
# need two different URL prefixes, even though they're closely
# related in purpose (both create real walk-in complaints).
draft_submit_router = APIRouter(prefix="/drafts/walkin", tags=["Walk-in Complaints"])
direct_complaint_router = APIRouter(prefix="/complaints/walkin", tags=["Walk-in Complaints"])


def _blank_to_none(value: str | None) -> str | None:
    # The browser sends "" for an empty box: treat blank as "not provided"
    value = (value or "").strip()
    return value or None


# ADDED: complainant details are all optional, so blanks become NULL (also keeps "" out of the id_type constraint)
def _complainant_fields(full_name, contact_number, email, id_type, address) -> dict:
    return {
        "full_name": _blank_to_none(full_name),
        "contact_number": _blank_to_none(contact_number),
        "email": _blank_to_none(email),
        "id_type": _blank_to_none(id_type),
        "address": _blank_to_none(address),
    }


# ADDED: shared by create (POST) and edit (PUT). Only the product name is required.
# Minimum lengths apply only to values that were provided.
def _build_complaint_fields(
    product_name, manufacturer, product_category, place_of_purchase,
    date_of_purchase, amount_paid, nature_of_complaint,
) -> dict:
    product_name = (product_name or "").strip()
    if len(product_name) < 2:
        raise HTTPException(status_code=422, detail="Product name is required (at least 2 characters).")

    manufacturer = _blank_to_none(manufacturer)
    product_category = _blank_to_none(product_category)
    place_of_purchase = _blank_to_none(place_of_purchase)
    date_text = _blank_to_none(date_of_purchase)
    nature = _blank_to_none(nature_of_complaint)

    if manufacturer and len(manufacturer) < 2:
        raise HTTPException(status_code=422, detail="Manufacturer/Seller must be at least 2 characters.")
    if place_of_purchase and len(place_of_purchase) < 2:
        raise HTTPException(status_code=422, detail="Place of purchase must be at least 2 characters.")

    if nature:
        # CRLF -> LF so the count matches the browser's maxLength (same reason as before)
        nature = nature.replace("\r\n", "\n").replace("\r", "\n")
        if len(nature) < 10 or len(nature) > 2000:
            raise HTTPException(status_code=422, detail="Nature of complaint must be between 10 and 2000 characters.")

    purchase_date = None
    if date_text:
        try:
            purchase_date = date.fromisoformat(date_text)
        except ValueError:
            raise HTTPException(status_code=422, detail="Date of purchase must be a valid date (YYYY-MM-DD).")

    return {
        "product_title": product_name,
        "manufacturer": manufacturer,
        "product_category": product_category,
        "place_of_purchase": place_of_purchase,
        "date_of_purchase": purchase_date,
        "amount_paid": amount_paid,
        "nature_of_complaint": nature,
    }

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

    product_name: str | None = Form(None, max_length=150),   # CHANGED: was required in the signature; _build_complaint_fields now returns the plain-text 422
    manufacturer: str | None = Form(None, max_length=150),         # CHANGED: optional
    product_category: str | None = Form(None, max_length=150),     # CHANGED: optional
    place_of_purchase: str | None = Form(None, max_length=300),    # CHANGED: optional
    date_of_purchase: str | None = Form(None),                     # CHANGED: optional
    nature_of_complaint: str | None = Form(None),                  # CHANGED: optional

    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)
    complainant_fields = _complainant_fields(full_name, contact_number, email, id_type, address)   # CHANGED
    complaint_fields = _build_complaint_fields(                                                    # CHANGED
        product_name, manufacturer, product_category, place_of_purchase,
        date_of_purchase, amount_paid, nature_of_complaint,
    )

    # The attachment rule is unchanged: at least one file, max 10, 25 MB each (checked in the service)
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
        effective_status = get_walkin_effective_status(complaint, vr)   # CHANGED (A2.3): takedown stages included

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

    product_name: str | None = Form(None, max_length=150),   # CHANGED: was required in the signature; _build_complaint_fields now returns the plain-text 422
    manufacturer: str | None = Form(None, max_length=150),         # CHANGED: optional
    product_category: str | None = Form(None, max_length=150),     # CHANGED: optional
    place_of_purchase: str | None = Form(None, max_length=300),    # CHANGED: optional
    date_of_purchase: str | None = Form(None),                     # CHANGED: optional
    nature_of_complaint: str | None = Form(None),                  # CHANGED: optional

    remove_attachment_ids: list[UUID] = Form(default=[]),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)
    complainant_fields = _complainant_fields(full_name, contact_number, email, id_type, address)   # CHANGED
    complaint_fields = _build_complaint_fields(                                                    # CHANGED
        product_name, manufacturer, product_category, place_of_purchase,
        date_of_purchase, amount_paid, nature_of_complaint,
    )

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
