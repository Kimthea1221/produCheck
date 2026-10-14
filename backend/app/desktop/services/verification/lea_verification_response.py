# backend/app/desktop/services/verification/lea_verification_response.py
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.models.verification_requests import VerificationRequest
from app.models.complaints import Complaint
from app.core.complaint_status import transition_complaint_status
from app.core.audit import write_audit_log, get_user_region_code
from app.core.constants import AuditAction
from app.desktop.schemas.verification.verification import (
    LeaInitiateTakedownRequest,
    LeaFdaResponseActionResponse,
)

from app.desktop.services.notifications.notification_service import (
    notify_fda_lea_acknowledged,
    notify_fda_takedown_initiated,  # ADDED
    notify_lea_peers_acknowledged,       # ADDED
    notify_lea_peers_takedown_initiated, # ADDED
)


# Shared lookup for both actions below — region-scoped, 404s the same
# way whether the request truly doesn't exist or belongs to another region.
def _get_fda_response_in_region(db: Session, request_id: UUID, current_user):
    result = (
        db.query(VerificationRequest, Complaint)
        .join(Complaint, VerificationRequest.complaint_id == Complaint.complaint_id)
        .filter(
            VerificationRequest.request_id == request_id,
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",   # ADDED: extension complaints never reach LEA
        )
        .first()
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Verification request not found.")
    return result


# "Dismiss Case" (registered) and "Acknowledge" (rejected) — complaint
# status is already dismissed from FDA's submit; this just marks that
# LEA has reviewed it, so it drops out of FDA Response into Closed.
def acknowledge_fda_response(
    db: Session, request_id: UUID, current_user, http_request: Request | None = None
) -> LeaFdaResponseActionResponse:
    verification_request, complaint = _get_fda_response_in_region(db, request_id, current_user)

    if verification_request.verification_request_status not in ("confirmed_registered", "rejected"):
        raise HTTPException(
            status_code=400,
            detail="Only registered or rejected FDA responses can be acknowledged here.",
        )

    if verification_request.lea_acknowledged_at is not None:
        raise HTTPException(status_code=400, detail="This response has already been acknowledged.")

    verification_request.lea_acknowledged_at = datetime.now(timezone.utc)
    verification_request.lea_acknowledged_by = current_user.user_id

    notify_fda_lea_acknowledged(db, complaint)  # ADDED for notification to FDA personnel that LEA has acknowledged the FDA response
    notify_lea_peers_acknowledged(db, complaint, current_user)  # ADDED for notification to LEA personnel in the same region that a colleague has acknowledged the FDA response

    # Captured before commit — commit() expires session objects.
    audit_region_code = get_user_region_code(db, current_user)
    audit_user_id = current_user.user_id
    audit_user_role = current_user.role
    case_reference = complaint.case_reference
    verification_result = verification_request.verification_request_status

    db.commit()
    db.refresh(verification_request)
    db.refresh(complaint)

    write_audit_log(
        db,
        user=None,
        user_id_override=audit_user_id,
        user_role_override=audit_user_role,
        action=AuditAction.UPDATE_COMPLAINT_STATUS,
        target_table="complaints",
        target_id=complaint.complaint_id,
        target_reference=case_reference,
        old_value={
            "verification_request_status": verification_result,
            "lea_acknowledged_at": None,
        },
        new_value={
            "verification_request_status": verification_result,
            "lea_acknowledged_at": verification_request.lea_acknowledged_at.isoformat(),
        },
        request=http_request,
        region_code=audit_region_code,
    )

    return LeaFdaResponseActionResponse(
        request_id=verification_request.request_id,
        complaint_id=complaint.complaint_id,
        complaint_status=complaint.status,
        lea_acknowledged_at=verification_request.lea_acknowledged_at,
    )


# "Initiate Takedown" (unregistered) — the one real status transition
# on this tab: takedown_requested -> takedown_initiated.
def initiate_takedown(
    db: Session, request_id: UUID, current_user, data: LeaInitiateTakedownRequest, http_request: Request | None = None
) -> LeaFdaResponseActionResponse:
    verification_request, complaint = _get_fda_response_in_region(db, request_id, current_user)

    if verification_request.verification_request_status != "confirmed_unregistered":
        raise HTTPException(
            status_code=400,
            detail="Only unregistered FDA responses can be moved to takedown.",
        )

    old_complaint_status = complaint.status

    # Notes stay optional, but the timestamp/officer always stamp —
    # the Initiated Cases list needs a reliable "activity" date even
    # when no notes were typed at this step.
    if data.field_operation_notes is not None:
        complaint.field_operation_notes = data.field_operation_notes
    complaint.field_operation_logged_at = datetime.now(timezone.utc)
    complaint.field_operation_logged_by = current_user.user_id

    # Reads complaint.source internally — always 'walk_in' here.
    transition_complaint_status(complaint, "takedown_initiated")

    notify_fda_takedown_initiated(db, complaint) #Added for notification to FDA personnel that a takedown operation has been initiated
    notify_lea_peers_takedown_initiated(db, complaint, current_user)  # ADDED for notification to LEA personnel in the same region that a takedown operation has been initiated

    # Captured before commit — commit() expires session objects.
    audit_region_code = get_user_region_code(db, current_user)
    audit_user_id = current_user.user_id
    audit_user_role = current_user.role
    case_reference = complaint.case_reference

    db.commit()
    db.refresh(verification_request)
    db.refresh(complaint)

    write_audit_log(
        db,
        user=None,
        user_id_override=audit_user_id,
        user_role_override=audit_user_role,
        action=AuditAction.UPDATE_COMPLAINT_STATUS,
        target_table="complaints",
        target_id=complaint.complaint_id,
        target_reference=case_reference,
        old_value={"status": old_complaint_status},
        new_value={"status": complaint.status},
        request=http_request,
        region_code=audit_region_code,
    )

    return LeaFdaResponseActionResponse(
        request_id=verification_request.request_id,
        complaint_id=complaint.complaint_id,
        complaint_status=complaint.status,
        lea_acknowledged_at=verification_request.lea_acknowledged_at,
    )