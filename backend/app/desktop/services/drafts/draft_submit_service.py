# backend/app/desktop/services/drafts/draft_submit_service.py
import os
import shutil
from uuid import uuid4, UUID

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session
from datetime import date
from decimal import Decimal

from fastapi import Request
from app.core.audit import write_audit_log, get_user_region_code
from app.core.constants import AuditAction

from app.models.walkin_intake_drafts import WalkinIntakeDraft
from app.models.draft_attachments import DraftAttachment
from app.models.walkin_complainants import WalkinComplainant
from app.models.complaints import Complaint
from app.models.shared_files import SharedFile
from app.core.case_reference import generate_case_reference
from app.desktop.services.notifications.notification_service import notify_lea_new_walkin_complaint  # ADDED



SHARED_FILES_DIR = "uploads/shared_files"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".docx"}
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024
MAX_FILES_PER_COMPLAINT = 10   # ADDED — shared cap for both create and edit paths


def _create_complainant_and_complaint(
    db: Session,
    current_user,
    region_id,
    complainant_fields: dict,
    complaint_fields: dict,
) -> Complaint:
    case_reference = generate_case_reference(db, region_id=region_id)

    new_complainant = WalkinComplainant(
        **complainant_fields,
        created_by=current_user.user_id,
    )
    db.add(new_complainant)
    db.flush()

    new_complaint = Complaint(
        **complaint_fields,
        case_reference=case_reference,
        region_id=region_id,
        source="walk_in",
        status="open",
        complainant_id=new_complainant.complainant_id,
        created_by=current_user.user_id,
    )
    db.add(new_complaint)
    db.flush()

    return new_complaint


def _copy_attachment_to_shared_files(source_path: str, complaint_id) -> dict:
    os.makedirs(SHARED_FILES_DIR, exist_ok=True)
    original_filename = os.path.basename(source_path)
    unique_name = f"{uuid4()}_{original_filename}"
    destination_path = os.path.join(SHARED_FILES_DIR, str(complaint_id), unique_name)
    os.makedirs(os.path.dirname(destination_path), exist_ok=True)
    shutil.copy2(source_path, destination_path)
    return {
        "file_path": destination_path,
        "file_size_bytes": os.path.getsize(destination_path),
    }


def _save_new_upload_to_shared_files(file: UploadFile, complaint_id) -> dict:
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file_extension}' is not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )
    os.makedirs(SHARED_FILES_DIR, exist_ok=True)
    unique_name = f"{uuid4()}_{file.filename}"
    destination_path = os.path.join(SHARED_FILES_DIR, str(complaint_id), unique_name)
    os.makedirs(os.path.dirname(destination_path), exist_ok=True)
    # CHANGED — stream in 1MB chunks and abort the moment the 25MB
    # cap is crossed, instead of copying the whole upload to disk
    # first and checking size after. The old order let an oversized
    # file get fully written before it was ever rejected.
    total_written = 0
    chunk_size = 1024 * 1024
    with open(destination_path, "wb") as buffer:
        while chunk := file.file.read(chunk_size):
            total_written += len(chunk)
            if total_written > MAX_FILE_SIZE_BYTES:
                buffer.close()
                os.remove(destination_path)
                raise HTTPException(
                    status_code=400,
                    detail=f"'{file.filename}' exceeds the 25 MB limit.",
                )
            buffer.write(chunk)

    return {
        "file_name": file.filename,
        "file_path": destination_path,
        "file_size_bytes": total_written,
        "mime_type": file.content_type,
    }


def submit_walkin_draft(db: Session, draft_id: UUID, current_user, request: Request | None = None) -> Complaint:
    draft = db.query(WalkinIntakeDraft).filter(
        WalkinIntakeDraft.draft_id == draft_id,
        WalkinIntakeDraft.saved_by == current_user.user_id,
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    if draft.draft_status != "draft":
        raise HTTPException(status_code=400, detail="This draft is still incomplete and cannot be submitted yet.")

    attachments = db.query(DraftAttachment).filter(
        DraftAttachment.walkin_draft_id == draft_id
    ).all()
    original_file_paths = [a.file_path for a in attachments]

    new_complaint = _create_complainant_and_complaint(
        db, current_user, draft.region_id,
        complainant_fields={
            "full_name": draft.full_name,
            "contact_number": draft.contact_number,
            "email": draft.email,
            "id_type": draft.id_type,
            "address": draft.address,
        },
        complaint_fields={
            "product_title": draft.product_name,
            "manufacturer": draft.manufacturer,
            "product_category": draft.product_category,
            "place_of_purchase": draft.place_of_purchase,
            "date_of_purchase": draft.date_of_purchase,
            "amount_paid": draft.amount_paid,
            "nature_of_complaint": draft.nature_of_complaint,
        },
    )

    for attachment in attachments:
        file_info = _copy_attachment_to_shared_files(attachment.file_path, new_complaint.complaint_id)
        db.add(SharedFile(
            complaint_id=new_complaint.complaint_id,
            region_id=draft.region_id,
            uploaded_by=current_user.user_id,
            file_name=attachment.file_name,
            file_path=file_info["file_path"],
            file_size_bytes=file_info["file_size_bytes"],
            mime_type=attachment.mime_type,
        ))

    notify_lea_new_walkin_complaint(db, new_complaint, current_user)

    # Captured before commit — commit() expires session objects.
    audit_region_code = get_user_region_code(db, current_user)
    audit_user_id = current_user.user_id
    audit_user_role = current_user.role

    db.commit()
    db.refresh(new_complaint)

    write_audit_log(
        db,
        user=None,
        user_id_override=audit_user_id,
        user_role_override=audit_user_role,
        action=AuditAction.CREATE_COMPLAINT_LOG,
        target_table="complaints",
        target_id=new_complaint.complaint_id,
        target_reference=new_complaint.case_reference,
        new_value={
            "product_title": new_complaint.product_title,
            "manufacturer": new_complaint.manufacturer,
            "product_category": new_complaint.product_category,
            "place_of_purchase": new_complaint.place_of_purchase,
            "date_of_purchase": new_complaint.date_of_purchase.isoformat() if new_complaint.date_of_purchase else None,
            "amount_paid": float(new_complaint.amount_paid) if new_complaint.amount_paid is not None else None,
            "nature_of_complaint": new_complaint.nature_of_complaint,
        },
        request=request,
        region_code=audit_region_code,
    )

    db.delete(draft)
    db.commit()

    for path in original_file_paths:
        if os.path.exists(path):
            os.remove(path)

    return new_complaint


def create_walkin_complaint_direct(
    db: Session,
    current_user,
    complainant_fields: dict,
    complaint_fields: dict,
    files: list[UploadFile],
    request: Request | None = None,
) -> Complaint:
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="At least one file attachment is required.")

    # ADDED — reject oversized batches before any DB row or file
    # write happens, same "fail before touching disk" principle as
    # the per-file size check
    if len(files) > MAX_FILES_PER_COMPLAINT:
        raise HTTPException(
            status_code=400,
            detail=f"You can upload up to {MAX_FILES_PER_COMPLAINT} files only.",
        )

    new_complaint = _create_complainant_and_complaint(
        db, current_user, current_user.region_id,
        complainant_fields=complainant_fields,
        complaint_fields=complaint_fields,
    )

    for uploaded_file in files:
        file_info = _save_new_upload_to_shared_files(uploaded_file, new_complaint.complaint_id)
        db.add(SharedFile(
            complaint_id=new_complaint.complaint_id,
            region_id=current_user.region_id,
            uploaded_by=current_user.user_id,
            **file_info,
        ))

    notify_lea_new_walkin_complaint(db, new_complaint, current_user)

    # Captured before commit — commit() expires session objects, and
    # touching current_user's attributes afterward (even just
    # user.user_id / user.role inside write_audit_log) can fail.
    audit_region_code = get_user_region_code(db, current_user)
    audit_user_id = current_user.user_id
    audit_user_role = current_user.role

    db.commit()
    db.refresh(new_complaint)

    write_audit_log(
        db,
        user=None,
        user_id_override=audit_user_id,
        user_role_override=audit_user_role,
        action=AuditAction.CREATE_COMPLAINT_LOG,
        target_table="complaints",
        target_id=new_complaint.complaint_id,
        target_reference=new_complaint.case_reference,
        new_value={
            "product_title": new_complaint.product_title,
            "manufacturer": new_complaint.manufacturer,
            "product_category": new_complaint.product_category,
            "place_of_purchase": new_complaint.place_of_purchase,
            "date_of_purchase": new_complaint.date_of_purchase.isoformat() if new_complaint.date_of_purchase else None,
                        "amount_paid": float(new_complaint.amount_paid) if new_complaint.amount_paid is not None else None,
            "nature_of_complaint": new_complaint.nature_of_complaint,
        },
        request=request,
        region_code=audit_region_code,
    )
    return new_complaint

# Ashanti code starts here

def update_walkin_complaint_direct(
    db: Session,
    current_user,
    complaint_id: UUID,
    complainant_fields: dict,
    complaint_fields: dict,
    files: list[UploadFile],
    remove_attachment_ids: list[UUID],
    request: Request | None = None,
) -> Complaint:
    """
    Edit path for an already-submitted walk-in complaint. Only
    allowed while the complaint is still 'open' (Ready to Send) —
    same rule as delete, since anything past that point has a
    verification request genuinely in flight or FDA has already
    responded, and editing those would be misleading.
    """
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
            detail="Only complaints in Ready to Send status can be edited.",
        )

    # A complaint must always have at least one supporting attachment.
    # Existing files not being removed still count — only check that
    # after removals + no new uploads, we wouldn't end up at zero.

    existing_query = db.query(SharedFile).filter(
        SharedFile.complaint_id == complaint_id,
        SharedFile.request_id.is_(None),   # ADDED: count only LEA's own files, not FDA's response files
    )
    if remove_attachment_ids:
        existing_query = existing_query.filter(SharedFile.file_id.notin_(remove_attachment_ids))
    existing_count = existing_query.count()

    # ADDED — total attachments after this edit (surviving existing
    # files + newly uploaded ones) must stay within the same 10-file
    # cap as a fresh submission, not just the new batch in isolation
    if existing_count + len(files) > MAX_FILES_PER_COMPLAINT:
        raise HTTPException(
            status_code=400,
            detail=f"You can have up to {MAX_FILES_PER_COMPLAINT} files total on this complaint.",
        )

    if existing_count == 0 and len(files) == 0:
        raise HTTPException(
            status_code=400,
            detail="At least one file attachment is required.",
        )

    if complaint.complainant_id:
        complainant = db.query(WalkinComplainant).filter(
            WalkinComplainant.complainant_id == complaint.complainant_id
        ).first()
        if complainant:
            for field, value in complainant_fields.items():
                setattr(complainant, field, value)

    old_complaint_values = {
        field: (
            getattr(complaint, field).isoformat() if isinstance(getattr(complaint, field), date)
            else float(getattr(complaint, field)) if isinstance(getattr(complaint, field), Decimal)
            else getattr(complaint, field)
        )
        for field in complaint_fields
    }

    for field, value in complaint_fields.items():
        setattr(complaint, field, value)
    complaint.updated_by = current_user.user_id

    if remove_attachment_ids:
        files_to_remove = db.query(SharedFile).filter(
            SharedFile.file_id.in_(remove_attachment_ids),
            SharedFile.complaint_id == complaint_id,
            SharedFile.request_id.is_(None),   # ADDED: LEA can never delete FDA's response files
        ).all()
        for f in files_to_remove:
            if os.path.exists(f.file_path):
                os.remove(f.file_path)
            db.delete(f)

    for uploaded_file in files:
        file_info = _save_new_upload_to_shared_files(uploaded_file, complaint.complaint_id)
        db.add(SharedFile(
            complaint_id=complaint.complaint_id,
            region_id=complaint.region_id,
            uploaded_by=current_user.user_id,
            **file_info,
        ))

    audit_region_code = get_user_region_code(db, current_user)
    audit_user_id = current_user.user_id
    audit_user_role = current_user.role
    db.commit()
    db.refresh(complaint)
    write_audit_log(
        db,
        user=None,
        user_id_override=audit_user_id,
        user_role_override=audit_user_role,
        action=AuditAction.UPDATE_COMPLAINT_LOG,
        target_table="complaints",
        target_id=complaint.complaint_id,
        target_reference=complaint.case_reference,
        old_value=old_complaint_values,
        new_value={
            "product_title": complaint.product_title,
            "manufacturer": complaint.manufacturer,
            "product_category": complaint.product_category,
            "place_of_purchase": complaint.place_of_purchase,
            "date_of_purchase": complaint.date_of_purchase.isoformat() if complaint.date_of_purchase else None,
                        "amount_paid": float(complaint.amount_paid) if complaint.amount_paid is not None else None,
            "nature_of_complaint": complaint.nature_of_complaint,
        },
        request=request,
        region_code=audit_region_code,
    )
    return complaint

#Ashanti code ends here
