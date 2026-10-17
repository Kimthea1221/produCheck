# backend/app/desktop/services/complaints/lea_initiated_cases.py
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.models.complaints import Complaint
from app.core.complaint_status import transition_complaint_status
from app.core.audit import write_audit_log, get_user_region_code
from app.core.constants import AuditAction
from app.desktop.schemas.complaints.complaints import (
    LeaInitiatedCaseListItem,
    LeaInitiatedCaseDetailResponse,
    LeaCloseCaseRequest,
    LeaCloseCaseResponse,
)

from app.desktop.services.verification.verification_helpers import get_latest_verification_request, get_fda_response_fields   # ADDED
from app.desktop.services.notifications.notification_service import (
    notify_fda_case_closed,
    notify_lea_peers_case_closed,  # ADDED
)

# Left panel list — active takedown operations, region-scoped. No
# search/category params, same client-side-filter pattern as the
# other LEA queue tabs.
def list_lea_initiated_cases(db: Session, current_user) -> list[LeaInitiatedCaseListItem]:
    complaints = (
        db.query(Complaint)
        .filter(
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",   # ADDED
            Complaint.status == "takedown_initiated",
        )
        .order_by(Complaint.field_operation_logged_at.desc())
        .all()
    )
    return [LeaInitiatedCaseListItem.model_validate(c) for c in complaints]


# Right panel detail
def get_lea_initiated_case_detail(
    db: Session, complaint_id: UUID, current_user
) -> LeaInitiatedCaseDetailResponse:
    result = (
        db.query(Complaint)
        .filter(
            Complaint.complaint_id == complaint_id,
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",   # ADDED
            Complaint.status == "takedown_initiated",
        )
        .first()
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Initiated case not found.")

    complaint = result

    # ADDED: the takedown came from the unregistered request, so read the FDA side from that one
    vr = get_latest_verification_request(db, complaint.complaint_id, "confirmed_unregistered")

    return LeaInitiatedCaseDetailResponse(
        complaint_id=complaint.complaint_id,
        case_reference=complaint.case_reference,
        product_title=complaint.product_title,
        manufacturer=complaint.manufacturer,
        product_category=complaint.product_category,
        logged_at=complaint.created_at,
        source=complaint.source,
        field_operation_notes=complaint.field_operation_notes,
        **get_fda_response_fields(db, vr),   # ADDED: product_code, priority, notes_to_fda, FDA result fields, response_files
    )


# "Close Case" — takedown_initiated -> completed. Writes its own columns so the
# Initiate Takedown record (field_operation_*) is no longer overwritten.
def close_case(
    db: Session, complaint_id: UUID, current_user, data: LeaCloseCaseRequest, http_request: Request | None = None
) -> LeaCloseCaseResponse:
    complaint = (
        db.query(Complaint)
        .filter(
            Complaint.complaint_id == complaint_id,
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",   # ADDED: an extension complaint gets the same 404
        )
        .first()
    )
    if complaint is None:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    if complaint.status != "takedown_initiated":
        raise HTTPException(status_code=400, detail="Only an active takedown operation can be closed.")

    old_complaint_status = complaint.status

    # CHANGED: was overwriting field_operation_notes / _logged_at / _logged_by
    complaint.closed_at = datetime.now(timezone.utc)
    complaint.closed_by = current_user.user_id
    if data.closing_notes is not None:
        complaint.closing_notes = data.closing_notes

    transition_complaint_status(complaint, "completed")

    notify_fda_case_closed(db, complaint) #Added for notification to FDA personnel that the takedown operation has been closed
    notify_lea_peers_case_closed(db, complaint, current_user)  # ADDED for notification to LEA personnel in the same region that a takedown operation has been closed

    # Captured before commit — commit() expires session objects.
    audit_region_code = get_user_region_code(db, current_user)
    audit_user_id = current_user.user_id
    audit_user_role = current_user.role
    case_reference = complaint.case_reference

    db.commit()
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

    return LeaCloseCaseResponse(
        complaint_id=complaint.complaint_id,
        complaint_status=complaint.status,
        field_operation_notes=complaint.field_operation_notes,
        field_operation_logged_at=complaint.field_operation_logged_at,
        closed_at=complaint.closed_at,            # ADDED
        closing_notes=complaint.closing_notes,    # ADDED
    )