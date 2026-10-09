# backend/app/desktop/routers/complaints/complaint_status.py
import logging
import mimetypes
from typing import Annotated, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pathlib import Path

from app.database.sessions import get_db  
from app.models.complaints import Complaint
from app.models.complaints_status_history import ComplaintStatusHistory
from app.models.consumer_accounts import ConsumerAccount
from app.models.walkin_complainants import WalkinComplainant
from app.desktop.services.status.send_email import send_status_update_email
from app.core.security import get_current_personnel  
from app.models.regions import Region
from app.core.audit import write_audit_log
from app.core.constants import AuditAction

from fastapi.responses import FileResponse

from app.desktop.schemas.complaints.complaints import StatusUpdateRequest

logger = logging.getLogger(__name__)

router = APIRouter()
db_dependency = Annotated[Session, Depends(get_db)]
user_dependency = Annotated[dict, Depends(get_current_personnel)]

STATUS_LABELS = {
    "open": "Open",
    "under_review": "Under Review",
    "takedown_requested": "Takedown Requested",
    "completed": "Completed",
    "dismissed": "Dismissed",
}

FINAL_STATUSES = {"completed", "dismissed"}

ALLOWED_TRANSITIONS = {
    "open": {"under_review", "takedown_requested", "completed", "dismissed"},
    "under_review": {"takedown_requested", "completed", "dismissed"},
    "takedown_requested": {"completed", "dismissed"},  # no going back to under_review
}

@router.patch("/complaints/{complaint_id}/status")
async def update_complaint_status(
    complaint_id: UUID,
    payload: StatusUpdateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_personnel), 
):
    complaint = (db.query(Complaint)
                 .filter(Complaint.complaint_id == complaint_id)
                 .filter(Complaint.region_id == current_user["region_id"])
                 .filter(Complaint.source == "extension")
                 .first())
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    if complaint.status in FINAL_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"This complaint is already marked as "
                   f"'{STATUS_LABELS.get(complaint.status, complaint.status)}' and cannot be changed further.",
        )

    allowed_next = ALLOWED_TRANSITIONS.get(complaint.status, set())
    if payload.status not in allowed_next:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change status from "
                f"'{STATUS_LABELS.get(complaint.status, complaint.status)}' to "
                f"'{STATUS_LABELS.get(payload.status, payload.status)}'.",
        )
    
    previous_status = complaint.status
    previous_note = (
        db.query(ComplaintStatusHistory)
        .filter(ComplaintStatusHistory.complaint_id == complaint.complaint_id)
        .order_by(ComplaintStatusHistory.changed_at.desc())
        .first()
    )
    previous_change_note = previous_note.change_note if previous_note else None

    complaint.status = payload.status
    complaint.updated_by = current_user["user_id"]

    if complaint.source == "extension":
        db.add(ComplaintStatusHistory(
            complaint_id=complaint.complaint_id,
            previous_status=previous_status,
            new_status=payload.status,
            changed_by=current_user["user_id"], 
            change_note=payload.change_note,
        ))

    db.commit()
    db.refresh(complaint)

    region = db.query(Region).filter(Region.region_id == current_user["region_id"]).first()
    try:
        write_audit_log(
            db=db,
            user=None,
            action=AuditAction.UPDATE_COMPLAINT_STATUS,
            target_table="complaints",
            target_id=complaint.complaint_id,
            target_reference=complaint.case_reference,
            old_value={"status": previous_status, "change_note": previous_change_note},
            new_value={"status": payload.status, "change_note": payload.change_note},
            request=request,
            user_role_override=current_user["role"],
            region_code=region.region_code if region else None,
            user_id_override=current_user["user_id"],
        )
    except Exception:
        logger.exception("Audit log failed for complaint %s", complaint.complaint_id)

    recipient_email = None
    notification_warning = None
    
    if complaint.consumer_id:
        consumer = db.query(ConsumerAccount).filter(ConsumerAccount.consumer_id == complaint.consumer_id).first()
        if consumer and consumer.email:
            recipient_email = consumer.email
        else:
            notification_warning = (
                "The consumer account linked to this complaint no longer has a usable email "
                "(the account may have been deleted). No email notification was sent."
            )
    else:
        notification_warning = (
            "This complaint has no linked consumer account (likely a guest submission). "
            "No email notification was sent."
        )

    if recipient_email:
        background_tasks.add_task(
            send_status_update_email,
            to_email=recipient_email,
            product_title=complaint.product_title,
            case_reference=complaint.case_reference,
            new_status_label=STATUS_LABELS.get(complaint.status, complaint.status),
            new_status_code=complaint.status,
            change_note=payload.change_note,
        )

    return {
        "complaintId": str(complaint.complaint_id),
        "status": complaint.status,
        "notificationWarning": notification_warning,
    }


@router.get("/complaints-status-update")
def list_complaints(db: Session = Depends(get_db), current_user = Depends(get_current_personnel),):
    complaints = (
        db.query(Complaint)
        .filter(Complaint.deleted_at.is_(None))
        .filter(Complaint.region_id == current_user["region_id"])
        .filter(Complaint.source == "extension")
        .order_by(Complaint.created_at.desc())
        .all()
    )

    result = []
    for c in complaints:
        region = db.query(Region).filter(Region.region_id == c.region_id).first()

        reporter_username = None
        reporter_email = None
        if c.source == "extension" and c.consumer_id:
            consumer = db.query(ConsumerAccount).filter(ConsumerAccount.consumer_id == c.consumer_id).first()
            if consumer:
                reporter_email = consumer.email
                reporter_username = consumer.email.split("@")[0]

        result.append({
            "complaintId": str(c.complaint_id),
            "caseReference": c.case_reference,
            "productTitle": c.product_title,
            "manufacturer": c.manufacturer,
            "region": region.region_name if region else None,
            "status": c.status,
            "reporterUsername": reporter_username,
            "reporterEmail": reporter_email,
            "hasAttachment": bool(c.attachment_path),
            "attachmentName": c.attachment_name,
        })

    return result


@router.get("/complaints/{complaint_id}/attachment")
def get_complaint_attachment(
    complaint_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_personnel),
):
    complaint = (db.query(Complaint)
                 .filter(Complaint.complaint_id == complaint_id)
                 .filter(Complaint.region_id == current_user["region_id"])
                 .filter(Complaint.source == "extension")
                 .first())

    if not complaint or not complaint.attachment_path:
        raise HTTPException(status_code=404, detail="No attachment found for this complaint")

    file_path = Path(complaint.attachment_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Attachment file is missing on disk")

    media_type, _ = mimetypes.guess_type(file_path.name)
    return FileResponse(file_path, media_type=media_type or "application/octet-stream")