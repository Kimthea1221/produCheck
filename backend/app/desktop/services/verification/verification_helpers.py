# File: backend/app/desktop/services/verification/verification_helpers.py  (NEW FILE)
# Functions: get_latest_verification_request, get_response_files, get_fda_response_fields

from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.user_display import get_display_name_across_agencies
from app.models.shared_files import SharedFile
from app.models.verification_requests import VerificationRequest
from app.models.verification_requests import VerificationRequest
from app.models.complaints import Complaint

from app.desktop.schemas.complaints.complaints import SharedFileResponse, WalkinVerificationSummary, FdaReportVerification, FdaReportLeaFollowup   # CHANGED


# One complaint can have several requests (recall, resend): newest by requested_at wins
def get_latest_verification_request(
    db: Session, complaint_id: UUID, status: str | None = None
) -> VerificationRequest | None:
    query = db.query(VerificationRequest).filter(VerificationRequest.complaint_id == complaint_id)
    if status is not None:
        query = query.filter(VerificationRequest.verification_request_status == status)
    return query.order_by(VerificationRequest.requested_at.desc()).first()


# Files LEA sees next to the FDA result: only what the RESPONDING officer attached
def get_response_files(db: Session, verification_request) -> list[SharedFileResponse]:
    if verification_request is None or verification_request.responded_by is None:
        return []
    files = (
        db.query(SharedFile)
        .filter(
            SharedFile.request_id == verification_request.request_id,
            SharedFile.uploaded_by == verification_request.responded_by,
        )
        .order_by(SharedFile.uploaded_at.asc())
        .all()
    )
    return [SharedFileResponse.model_validate(f) for f in files]


# The FDA request + response block every LEA detail screen shows, built once.
# FDA names need the cross-agency lookup: an LEA session can't read FDA user rows.
def get_fda_response_fields(db: Session, verification_request) -> dict:
    if verification_request is None:
        return {}   # the schema defaults (None / []) apply
    vr = verification_request
    return {
        "product_code": vr.product_code,
        "priority": vr.priority,
        "notes_to_fda": vr.complaint_statement,
        "verified_by_name": get_display_name_across_agencies(db, vr.responded_by) if vr.responded_by else None,
        "responded_at": vr.responded_at,
        "unregistered_reason": vr.unregistered_reason,
        "response_notes": vr.response_notes,
        "response_files": get_response_files(db, vr),
    }


# LEA's original evidence on a complaint (request_id NULL), as opposed to FDA's response files
def get_lea_evidence_files(db: Session, complaint_id: UUID) -> list[SharedFileResponse]:
    files = (
        db.query(SharedFile)
        .filter(SharedFile.complaint_id == complaint_id, SharedFile.request_id.is_(None))
        .order_by(SharedFile.uploaded_at.asc())
        .all()
    )
    return [SharedFileResponse.model_validate(f) for f in files]


# Constant + function: 

_RESULT_BY_STATUS = {
    "confirmed_registered": "registered",
    "confirmed_unregistered": "unregistered",
    "rejected": "rejected",
}


# The `verification` object for the walk-in detail panel. None when no request was ever sent.
def get_walkin_verification(db: Session, complaint) -> WalkinVerificationSummary | None:
    vr = get_latest_verification_request(db, complaint.complaint_id)
    if vr is None:
        return None

    def name(user_id):
        return get_display_name_across_agencies(db, user_id) if user_id else None

    status = vr.verification_request_status
    is_unregistered = status == "confirmed_unregistered"

    # Same closure rule as the Closed Cases list: completed takedown, or an acknowledged registered/rejected response
    reason_closed = closed_at = closed_by_id = reason_detail = None
    if complaint.status == "completed":
        reason_closed, closed_at = "completed", complaint.closed_at
        closed_by_id, reason_detail = complaint.closed_by, complaint.closing_notes
    elif vr.lea_acknowledged_at is not None and status in ("confirmed_registered", "rejected"):
        reason_closed = "registered" if status == "confirmed_registered" else "rejected"
        closed_at, closed_by_id = vr.lea_acknowledged_at, vr.lea_acknowledged_by
        reason_detail = vr.response_notes if status == "confirmed_registered" else vr.rejection_reason

    return WalkinVerificationSummary(
        **get_fda_response_fields(db, vr),
        request_id=vr.request_id,
        request_status=status,
        requested_at=vr.requested_at,
        requested_by_name=name(vr.requested_by),
        reminder_sent_at=vr.reminder_sent_at,
        verification_result=_RESULT_BY_STATUS.get(status),
        cpr_number=vr.cpr_number,
        cpr_expiry=vr.cpr_expiry,
        rejection_reason=vr.rejection_reason,
        acknowledged_at=vr.lea_acknowledged_at,
        acknowledged_by_name=name(vr.lea_acknowledged_by),
        complaint_status=complaint.status,
        # takedown record exists only on the unregistered path
        takedown_initiated_at=complaint.field_operation_logged_at if is_unregistered else None,
        takedown_initiated_by_name=name(complaint.field_operation_logged_by) if is_unregistered else None,
        field_operation_notes=complaint.field_operation_notes if is_unregistered else None,
        closed_at=closed_at,
        closed_by_name=name(closed_by_id),
        reason_closed=reason_closed,
        reason_detail=reason_detail,
    )


# The status LEA sees on a walk-in row: the complaint's own takedown stages win,
# otherwise the latest verification request decides. Used by the walk-in list and detail.
def get_walkin_effective_status(complaint, latest_request) -> str:
    if complaint.status == "open":
        return "queued"
    if complaint.status in ("takedown_initiated", "completed"):
        return complaint.status
    return latest_request.verification_request_status if latest_request else "queued"


# ADDED: shared by the FDA submit/reject/detail service and the FDA drafts router, so the
# region + walk-in rule lives in one place. Same 404 whether missing, other region or extension.
def get_request_and_complaint_in_region(db: Session, request_id: UUID, current_user):
    result = (
        db.query(VerificationRequest, Complaint)
        .join(Complaint, VerificationRequest.complaint_id == Complaint.complaint_id)
        .filter(
            VerificationRequest.request_id == request_id,
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",
        )
        .first()
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Verification request not found.")
    return result


# ADDED: the FDA View Reports modal's `verification` + `lea_followup`, reshaped from the same
# walk-in data LEA sees. (None, None) when no request was ever sent.
def get_fda_report_exchange(db: Session, complaint) -> tuple[FdaReportVerification | None, FdaReportLeaFollowup | None]:
    summary = get_walkin_verification(db, complaint)
    if summary is None:
        return None, None

    is_completed = complaint.status == "completed"
    if is_completed:
        stage = "closed"
    elif complaint.status == "takedown_initiated":
        stage = "takedown_initiated"
    elif summary.acknowledged_at is not None:
        stage = "acknowledged"
    else:
        stage = "awaiting_lea"

    verification = FdaReportVerification(
        request_source=complaint.source,
        requested_by_name=summary.requested_by_name,
        requested_at=summary.requested_at,
        product_code=summary.product_code,
        priority=summary.priority,
        verification_result=summary.verification_result,
        cpr_number=summary.cpr_number,
        cpr_expiry=summary.cpr_expiry,
        verified_by_name=summary.verified_by_name,
        unregistered_reason=summary.unregistered_reason,
        response_notes=summary.response_notes,
        responded_at=summary.responded_at,
        # same responder column; the page labels it "Rejected By" for a rejection
        rejected_by_name=summary.verified_by_name if summary.verification_result == "rejected" else None,
        rejection_reason=summary.rejection_reason,
    )
    lea_followup = FdaReportLeaFollowup(
        lea_stage=stage,
        reminder_sent_at=summary.reminder_sent_at,
        acknowledged_at=summary.acknowledged_at,
        acknowledged_by_name=summary.acknowledged_by_name,
        takedown_initiated_at=summary.takedown_initiated_at,
        takedown_initiated_by_name=summary.takedown_initiated_by_name,
        field_operation_notes=summary.field_operation_notes,
        # closing fields belong to a completed takedown only, not to an acknowledged registered/rejected case
        closed_at=summary.closed_at if is_completed else None,
        closed_by_name=summary.closed_by_name if is_completed else None,
        closing_notes=summary.reason_detail if is_completed else None,
    )
    return verification, lea_followup