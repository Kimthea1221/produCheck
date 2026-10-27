# backend/app/desktop/services/verification/verification_submit_service.py
from uuid import UUID
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log, get_user_region_code
from app.core.constants import AuditAction

from app.models.verification_request_drafts import VerificationRequestDraft
from app.models.verification_requests import VerificationRequest
from app.models.complaints import Complaint

from app.desktop.services.notifications.notification_service import notify_fda_new_verification_request
from app.desktop.services.notifications.notification_service import notify_fda_reminder_sent
from app.desktop.services.notifications.notification_service import notify_fda_request_recalled
from app.desktop.services.notifications.notification_service import notify_lea_peers_verification_sent
from app.desktop.services.notifications.notification_service import notify_lea_peers_reminder_sent
from app.desktop.services.notifications.notification_service import notify_lea_peers_request_recalled

from app.core.complaint_status import transition_complaint_status


def _create_verification_request(
    db: Session,
    current_user,
    complaint_id: UUID,
    product_code: str | None,
    priority: str,
    complaint_statement: str,
    region_id: UUID,   # region parameter added to ensure the request is created within the correct region
    request: Request | None = None,
) -> VerificationRequest:
    complaint = db.query(Complaint).filter(
        Complaint.complaint_id == complaint_id,
        Complaint.region_id == region_id,   # region scoping to ensure the complaint belongs to the user's region
        Complaint.source == "walk_in",   # ADDED: extension complaints never go through LEA verification
        ).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Linked complaint not found.")

    # Sending a verification request always moves the complaint from
    # 'open' to 'under_review' — this is what makes it disappear from
    # the "Ready to Send" queue.
    transition_complaint_status(complaint, "under_review")

    new_request = VerificationRequest(
        complaint_id=complaint_id,
        requested_by=current_user.user_id,
        product_name=complaint.product_title,
        product_code=product_code,
        complaint_statement=complaint_statement,
        verification_request_status="pending",
        priority=priority,
    )
    db.add(new_request)
    db.flush()

    notify_fda_new_verification_request(db, complaint, priority)   # ADDED for notification to FDA personnel that a new verification request has been submitted
    notify_lea_peers_verification_sent(db, complaint, priority, current_user) #Added for notification to LEA peers that a new verification request has been submitted
    
    return new_request, complaint


def submit_verification_draft(db: Session, draft_id: UUID, current_user, request: Request | None = None) -> VerificationRequest:
    draft = db.query(VerificationRequestDraft).filter(
        VerificationRequestDraft.draft_id == draft_id,
        VerificationRequestDraft.saved_by == current_user.user_id,
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    # ADDED — same defense-in-depth check
    if draft.draft_status != "draft":
        raise HTTPException(status_code=400, detail="This draft is still incomplete and cannot be submitted yet.")

    new_request, complaint = _create_verification_request(
        db, current_user,
        complaint_id=draft.complaint_id,
        product_code=draft.product_code,
        priority=draft.priority,
        complaint_statement=draft.notes_to_fda,
        region_id=draft.region_id,   # region parameter passed to ensure the request is created within the correct region
    )

    # Captured before commit — commit() expires session objects.
    audit_region_code = get_user_region_code(db, current_user)
    audit_user_id = current_user.user_id
    audit_user_role = current_user.role

    # Point of no return — the real verification_requests row exists now
    db.commit()
    db.refresh(new_request)

    write_audit_log(
        db,
        user=None,
        user_id_override=audit_user_id,
        user_role_override=audit_user_role,
        action=AuditAction.CREATE_VERIFICATION_REQUEST,
        target_table="verification_requests",
        target_id=new_request.request_id,
        target_reference=complaint.case_reference,
        new_value={
            "product_name": new_request.product_name,
            "product_code": new_request.product_code,
            "priority": new_request.priority,
            "verification_request_status": new_request.verification_request_status,
        },
        request=request,
        region_code=audit_region_code,
    )

    # Only now delete the draft — no files to clean up for this
    # draft type, so no disk-cleanup step needed unlike walk-in submit
    db.delete(draft)
    db.commit()

    return new_request


def create_verification_request_direct(
    db: Session,
    current_user,
    complaint_id: UUID,
    product_code: str | None,
    priority: str,
    notes_to_fda: str,
    request: Request | None = None,
) -> VerificationRequest:
    new_request, complaint = _create_verification_request(
        db, current_user,
        complaint_id=complaint_id,
        product_code=product_code,
        priority=priority,
        complaint_statement=notes_to_fda,
        region_id=current_user.region_id,   # region parameter passed to ensure the request is created within the correct region
    )

    # Captured before commit — commit() expires session objects.
    audit_region_code = get_user_region_code(db, current_user)
    audit_user_id = current_user.user_id
    audit_user_role = current_user.role

    db.commit()
    db.refresh(new_request)

    write_audit_log(
        db,
        user=None,
        user_id_override=audit_user_id,
        user_role_override=audit_user_role,
        action=AuditAction.CREATE_VERIFICATION_REQUEST,
        target_table="verification_requests",
        target_id=new_request.request_id,
        target_reference=complaint.case_reference,
        new_value={
            "product_name": new_request.product_name,
            "product_code": new_request.product_code,
            "priority": new_request.priority,
            "verification_request_status": new_request.verification_request_status,
        },
        request=request,
        region_code=audit_region_code,
    )
    return new_request


#ashanti start

def recall_verification_request(db: Session, request_id: UUID, current_user, http_request: Request | None = None) -> VerificationRequest:
    request = db.query(VerificationRequest).join(
        Complaint, VerificationRequest.complaint_id == Complaint.complaint_id
    ).filter(
        VerificationRequest.request_id == request_id,
        Complaint.region_id == current_user.region_id,   # region scoping, same pattern as everywhere else
        Complaint.source == "walk_in",   # ADDED
    ).first()

    if not request:
        raise HTTPException(status_code=404, detail="Verification request not found.")

    if request.verification_request_status != "pending":
        raise HTTPException(
            status_code=400,
            detail="Only pending requests can be recalled.",
        )

    complaint = db.query(Complaint).filter(
        Complaint.complaint_id == request.complaint_id
    ).first()

    old_verification_status = request.verification_request_status
    old_complaint_status = complaint.status

    # Send the complaint back to Ready to Send — raises a clear 400
    # itself if this transition somehow isn't allowed, so no need to
    # duplicate that check here.
    transition_complaint_status(complaint, "open")

    request.verification_request_status = "recalled"
    request.recalled_at = datetime.now(timezone.utc)
    request.recalled_by = current_user.user_id

    notify_fda_request_recalled(db, complaint) #Added for notification to FDA personnel that the verification request has been recalled
    notify_lea_peers_request_recalled(db, complaint, current_user)  # ADDED for notification to LEA peers that the verification request has been recalled
    
    # Captured before commit — commit() expires session objects.
    audit_region_code = get_user_region_code(db, current_user)
    audit_user_id = current_user.user_id
    audit_user_role = current_user.role
    case_reference = complaint.case_reference

    db.commit()
    db.refresh(request)

    write_audit_log(
        db,
        user=None,
        user_id_override=audit_user_id,
        user_role_override=audit_user_role,
        action=AuditAction.DELETE_VERIFICATION_REQUEST,
        target_table="verification_requests",
        target_id=request.request_id,
        target_reference=case_reference,
        old_value={
            "verification_request_status": old_verification_status,
            "complaint_status": old_complaint_status,
        },
        new_value={
            "verification_request_status": request.verification_request_status,
            "complaint_status": complaint.status,
        },
        request=http_request,
        region_code=audit_region_code,
    )

    return request


REMINDER_COOLDOWN = timedelta(hours=24)


def resend_reminder(db: Session, request_id: UUID, current_user) -> VerificationRequest:
    request = db.query(VerificationRequest).join(
        Complaint, VerificationRequest.complaint_id == Complaint.complaint_id
    ).filter(
        VerificationRequest.request_id == request_id,
        Complaint.region_id == current_user.region_id,
        Complaint.source == "walk_in",   # ADDED
    ).first()

    if not request:
        raise HTTPException(status_code=404, detail="Verification request not found.")

    if request.verification_request_status != "pending":
        raise HTTPException(
            status_code=400,
            detail="Only pending requests can be reminded.",
        )

    now = datetime.now(timezone.utc)

    if request.reminder_sent_at is not None:
        elapsed = now - request.reminder_sent_at
        if elapsed < REMINDER_COOLDOWN:
            wait_left = REMINDER_COOLDOWN - elapsed
            # Round down to whole minutes — an officer doesn't need
            # second/microsecond precision, just a rough sense of when
            # they can try again.
            total_minutes = int(wait_left.total_seconds() // 60)
            hours, minutes = divmod(total_minutes, 60)

            if hours > 0:
                readable_wait = f"{hours} hour{'s' if hours != 1 else ''} and {minutes} minute{'s' if minutes != 1 else ''}"
            else:
                readable_wait = f"{minutes} minute{'s' if minutes != 1 else ''}"

            raise HTTPException(
                status_code=400,
                detail=f"A reminder was already sent recently. Try again in {readable_wait}.",
            )

    request.reminder_sent_at = now
    request.reminder_sent_by = current_user.user_id

    complaint = db.query(Complaint).filter(Complaint.complaint_id == request.complaint_id).first()
    notify_fda_reminder_sent(db, complaint, request.priority)  # ADDED for notification to FDA personnel that a reminder has been sent for the verification request
    notify_lea_peers_reminder_sent(db, complaint, request.priority, current_user)  # ADDED for notification to LEA peers that a reminder has been sent for the verification request

    db.commit()
    db.refresh(request)

    return request

#ashanti  end

