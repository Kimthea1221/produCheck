# File: backend/app/desktop/services/verification/verification_helpers.py  (NEW FILE)
# Functions: get_latest_verification_request, get_response_files, get_fda_response_fields

from uuid import UUID
from sqlalchemy.orm import Session

from app.core.user_display import get_display_name_across_agencies
from app.models.shared_files import SharedFile
from app.models.verification_requests import VerificationRequest
from app.desktop.schemas.complaints.complaints import SharedFileResponse


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