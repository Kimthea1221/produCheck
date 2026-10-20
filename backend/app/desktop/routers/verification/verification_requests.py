# backend/app/desktop/routers/verification/verification_requests.py
from uuid import UUID
from datetime import date
import io

from fastapi import APIRouter, Depends, Query, Request, File, UploadFile, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database.sessions import get_db
from app.core.dependencies import get_current_user

from app.desktop.schemas.verification.verification import (
    VerificationRequestCreate,
    VerificationRequestResponse,
    VerificationRequestAwaitingFDAResponse,
    FdaVerificationRequestDetailResponse,
    FdaVerificationCompletedListResponse,
    FdaVerificationCompletedDetailResponse,
    FdaVerificationRejectedListResponse,
    FdaVerificationRejectedDetailResponse,
    FdaVerificationQueueCounts,
    LeaVerificationQueueCounts,
    LeaFdaResponseListItem,
    LeaFdaResponseDetailResponse,
    LeaClosedCaseListResponse,
    LeaFdaResponseResultChoice,
    LeaFollowUpStage,
    LeaFollowUpListResponse,
    LeaClosedCaseDetailResponse
)

from app.desktop.services.verification.verification_submit_service import (
    submit_verification_draft,
    create_verification_request_direct,
    recall_verification_request,   # ADD BY MHAE
    resend_reminder,   # ADD BY MHAE
)

from app.models.complaints import Complaint
from app.models.walkin_complainants import WalkinComplainant
from app.models.verification_requests import VerificationRequest
from app.models.fda_verification_drafts import FdaVerificationDraft   # ADDED

from app.desktop.services.verification.fda_verification_response import get_fda_verification_request_detail

from app.desktop.services.verification.fda_verification_lists import (
    list_fda_verification_completed,
    get_fda_verification_completed_detail,
    list_fda_verification_rejected,
    get_fda_verification_rejected_detail,
    get_fda_verification_queue_counts,
    list_lea_follow_up,
)

from app.desktop.services.verification.fda_verification_export import (
    build_completed_pdf,
    build_rejected_pdf,
)

from app.desktop.services.verification.lea_verification_lists import (
    get_lea_verification_queue_counts,
    list_lea_fda_response,
    get_lea_fda_response_detail,
    list_lea_closed_cases,
    get_lea_closed_case_detail
)

from app.desktop.schemas.complaints.complaints import SharedFileResponse   # ADDED
from app.desktop.services.verification.fda_attachments_service import upload_fda_attachments, delete_fda_attachment   # ADD

# ADDED: shared LEA-only helpers
from app.desktop.services.account_status.guards import assert_lea_user, is_lea_user, assert_fda_user 


# Same two-router-in-one-file pattern as walkin_complaints.py
draft_submit_router = APIRouter(prefix="/drafts/verification", tags=["Verification Requests"])
direct_request_router = APIRouter(prefix="/verification-requests", tags=["Verification Requests"])


    #
    #
    #
    #
    #
    #
    # POST /drafts/verification/{draft_id}/submit
@draft_submit_router.post("/{draft_id}/submit", response_model=VerificationRequestResponse)
def submit_draft(
    draft_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return submit_verification_draft(db, draft_id, current_user, request)


    #
    #
    #
    #
    #
    #
    # POST /verification-requests/
@direct_request_router.post("/", response_model=VerificationRequestResponse)
def create_request_direct(
    data: VerificationRequestCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return create_verification_request_direct(
        db, current_user,
        complaint_id=data.complaint_id,
        product_code=data.product_code,
        priority=data.priority,
        notes_to_fda=data.notes_to_fda,
        request=request,
    )


    #
    #
    #
    # Ashanti code starts here
    #
    #
    # POST /verification-requests/{request_id}/recall
@direct_request_router.post("/{request_id}/recall", response_model=VerificationRequestResponse)
def recall_request_endpoint(
    request_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return recall_verification_request(db, request_id, current_user, request)


    #
    #
    #
    #
    #
    #
    # POST /verification-requests/{request_id}/resend-reminder
@direct_request_router.post("/{request_id}/resend-reminder", response_model=VerificationRequestResponse)
def resend_reminder_endpoint(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return resend_reminder(db, request_id, current_user)
# Ashanti code ends here

    #
    #
    #
    #
    #
    # POST /verification-requests/{request_id}/fda-attachments
@direct_request_router.post("/{request_id}/fda-attachments", response_model=list[SharedFileResponse])
def upload_fda_attachments_endpoint(
    request_id: UUID,
    files: list[UploadFile] = File(...),   # multipart field name is "files", as the frontend expects
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return upload_fda_attachments(db, request_id, current_user, files)   # role check is its first line


    #
    #
    #
    #
    #
    #
    # DELETE /verification-requests/{request_id}/fda-attachments/{file_id}
@direct_request_router.delete("/{request_id}/fda-attachments/{file_id}", status_code=204)
def delete_fda_attachment_endpoint(
    request_id: UUID,
    file_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    delete_fda_attachment(db, request_id, file_id, current_user)
    return Response(status_code=204)   # no body on success


# Third router in this file — listing/browsing, separate from the
# two submit-action routers already here. Reuses the same
# /verification-requests prefix as direct_request_router.
list_router = APIRouter(prefix="/verification-requests", tags=["Verification Requests"])


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/awaiting-fda
@list_router.get("/awaiting-fda", response_model=list[VerificationRequestAwaitingFDAResponse])
def list_verification_requests_awaiting_fda(
    search: str | None = Query(None, max_length=150),
    priority: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(VerificationRequest, Complaint, WalkinComplainant, FdaVerificationDraft.draft_id).join(
        Complaint, VerificationRequest.complaint_id == Complaint.complaint_id
    ).outerjoin(
        WalkinComplainant, Complaint.complainant_id == WalkinComplainant.complainant_id
    ).outerjoin(   # ADDED: this officer's own draft for the request, if any
        FdaVerificationDraft,
        (FdaVerificationDraft.verification_request_id == VerificationRequest.request_id)
        & (FdaVerificationDraft.saved_by == current_user.user_id),
    ).filter(
        VerificationRequest.verification_request_status == "pending",
        Complaint.region_id == current_user.region_id,
        Complaint.source == "walk_in",
    )

    if search is not None:
        # Category folded into the same free-text search rather than
        # its own query param — the officer can type "Drugs", "Food",
        # etc. and it matches alongside case reference/product/manufacturer.
        query = query.filter(
            Complaint.case_reference.ilike(f"%{search}%")
            | VerificationRequest.product_name.ilike(f"%{search}%")
            | Complaint.manufacturer.ilike(f"%{search}%")
            | Complaint.product_category.ilike(f"%{search}%")
        )

    if priority is not None:
        # Exact match — "All Priorities" dropdown, not free text.
        query = query.filter(VerificationRequest.priority == priority)

    results = query.order_by(VerificationRequest.requested_at.desc()).all()

    is_lea = is_lea_user(current_user)  # ADDED

    return [
        VerificationRequestAwaitingFDAResponse(
            request_id=request.request_id,
            complaint_id=complaint.complaint_id,
            case_reference=complaint.case_reference,
            product_name=request.product_name,
            manufacturer=complaint.manufacturer,
            product_category=complaint.product_category,
            complainant_name=complainant.full_name if (complainant and is_lea) else None,  # CHANGED: citizen name is LEA-only
            source=complaint.source,
            priority=request.priority,
            requested_at=request.requested_at,
            has_draft=draft_id is not None,   # ADDED
            draft_id=draft_id,                # ADDED
        )
        for request, complaint, complainant, draft_id in results   # CHANGED: draft_id added to the tuple
    ]


# ============================================================
# FDA COMPLETED AND REJECTED LISTS
# ============================================================


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/completed
@list_router.get("/completed", response_model=FdaVerificationCompletedListResponse)
def list_completed_verification_requests(
    search: str | None = Query(None, max_length=150),
    category: str | None = Query(None, max_length=150),
    verification_result: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(5, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_fda_user(current_user)   # ADDED: FDA queue only
    return list_fda_verification_completed(
        db, current_user, search, category, verification_result, date_from, date_to, page, page_size
    )


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/completed/{request_id}
@list_router.get("/completed/{request_id}", response_model=FdaVerificationCompletedDetailResponse)
def get_completed_verification_request_detail(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_fda_user(current_user)   # ADDED: FDA queue only
    return get_fda_verification_completed_detail(db, request_id, current_user)


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/completed/{request_id}/export-pdf
@list_router.get("/completed/{request_id}/export-pdf")
def export_completed_verification_pdf(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_fda_user(current_user)   # ADDED: FDA queue only
    detail = get_fda_verification_completed_detail(db, request_id, current_user)
    pdf_bytes = build_completed_pdf(detail)
    filename = f"{detail.case_reference}-verification-record.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/rejected
@list_router.get("/rejected", response_model=FdaVerificationRejectedListResponse)
def list_rejected_verification_requests(
    search: str | None = Query(None, max_length=150),
    category: str | None = Query(None, max_length=150),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_fda_user(current_user)   # ADDED: FDA queue only
    return list_fda_verification_rejected(
        db, current_user, search, category, date_from, date_to, page, page_size
    )


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/rejected/{request_id}
@list_router.get("/rejected/{request_id}", response_model=FdaVerificationRejectedDetailResponse)
def get_rejected_verification_request_detail(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_fda_user(current_user)   # ADDED: FDA queue only
    return get_fda_verification_rejected_detail(db, request_id, current_user)


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/rejected/{request_id}/export-pdf
@list_router.get("/rejected/{request_id}/export-pdf")
def export_rejected_verification_pdf(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_fda_user(current_user)   # ADDED: FDA queue only
    detail = get_fda_verification_rejected_detail(db, request_id, current_user)
    pdf_bytes = build_rejected_pdf(detail)
    filename = f"{detail.case_reference}-rejected-record.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/counts
@list_router.get("/counts", response_model=FdaVerificationQueueCounts)
def get_verification_queue_counts(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_fda_verification_queue_counts(db, current_user)


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/lea-counts
@list_router.get("/lea-counts", response_model=LeaVerificationQueueCounts)
def get_lea_verification_queue_counts_endpoint(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return get_lea_verification_queue_counts(db, current_user)


    # added by Darlene --start
    #
    #
    #
    #
    #
    # GET /verification-requests/fda-response
@list_router.get("/fda-response", response_model=list[LeaFdaResponseListItem])
def list_lea_fda_response_endpoint(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return list_lea_fda_response(db, current_user)


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/fda-response/{request_id}
@list_router.get("/fda-response/{request_id}", response_model=LeaFdaResponseDetailResponse)
def get_lea_fda_response_detail_endpoint(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return get_lea_fda_response_detail(db, request_id, current_user)


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/closed-cases
@list_router.get("/closed-cases", response_model=LeaClosedCaseListResponse)
def list_lea_closed_cases_endpoint(
    search: str | None = Query(None, max_length=150),
    category: str | None = Query(None, max_length=150),
    reason_closed: str | None = Query(None, max_length=150),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return list_lea_closed_cases(
        db, current_user, search, category, reason_closed, date_from, date_to, page, page_size
    )


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/closed-cases/{complaint_id}
@list_router.get("/closed-cases/{complaint_id}", response_model=LeaClosedCaseDetailResponse)
def get_lea_closed_case_detail_endpoint(
    complaint_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)   # role check first
    return get_lea_closed_case_detail(db, complaint_id, current_user)
    # added by Darlene --end


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/lea-follow-up
@list_router.get("/lea-follow-up", response_model=LeaFollowUpListResponse)
def get_lea_follow_up(
    search: str | None = Query(None),
    stage: LeaFollowUpStage | None = Query(None),
    fda_result: LeaFdaResponseResultChoice | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),   
):
    assert_fda_user(current_user)   # role check first
    return list_lea_follow_up(db, current_user, search, stage, fda_result, page, page_size)


    #
    #
    #
    #
    #
    #
    # GET /verification-requests/{request_id}
@list_router.get("/{request_id}", response_model=FdaVerificationRequestDetailResponse)
def get_verification_request_detail(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_fda_verification_request_detail(db, request_id, current_user)