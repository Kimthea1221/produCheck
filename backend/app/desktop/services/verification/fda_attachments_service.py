# File: backend/app/desktop/services/verification/fda_attachments_service.py  

import os
from uuid import UUID

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.constants import Role
from app.models.complaints import Complaint
from app.models.shared_files import SharedFile
from app.models.verification_requests import VerificationRequest
from app.desktop.schemas.complaints.complaints import SharedFileResponse
from app.desktop.services.drafts.draft_submit_service import _save_new_upload_to_shared_files  # reuse: same limits as LEA

MAX_FDA_FILES_PER_REQUEST = 10   # per officer, per request


def upload_fda_attachments(
    db: Session, request_id: UUID, current_user, files: list[UploadFile]
) -> list[SharedFileResponse]:
    # Role first: submit/reject need FDA_PERSONNEL, so uploading does too
    if current_user.role != Role.FDA_PERSONNEL:
        raise HTTPException(status_code=403, detail="Only FDA personnel can attach files to a verification response.")

    if not files:
        raise HTTPException(status_code=400, detail="No files were uploaded.")

    # Region + walk-in scope. 404 (not 403) so other regions' request ids are not revealed.
    found = (
        db.query(VerificationRequest, Complaint)
        .join(Complaint, Complaint.complaint_id == VerificationRequest.complaint_id)
        .filter(
            VerificationRequest.request_id == request_id,
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",
            Complaint.deleted_at.is_(None),
        )
        .first()
    )
    if found is None:
        raise HTTPException(status_code=404, detail="Verification request not found.")
    vr, complaint = found

    if vr.verification_request_status != "pending":
        raise HTTPException(status_code=400, detail="Files can only be attached while the request is pending.")

    # Cap counts this officer's existing files on this request plus the new ones
    existing = (
        db.query(SharedFile)
        .filter(SharedFile.request_id == vr.request_id, SharedFile.uploaded_by == current_user.user_id)
        .count()
    )
    if existing + len(files) > MAX_FDA_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"You can attach at most {MAX_FDA_FILES_PER_REQUEST} files per request ({existing} already attached).",
        )

    saved_paths: list[str] = []
    new_rows: list[SharedFile] = []
    try:
        for uploaded_file in files:
            info = _save_new_upload_to_shared_files(uploaded_file, complaint.complaint_id)
            saved_paths.append(info["file_path"])   # tracked before the row, so cleanup works on any failure
            row = SharedFile(
                complaint_id=complaint.complaint_id,
                region_id=complaint.region_id,
                uploaded_by=current_user.user_id,
                request_id=vr.request_id,   # marks this as FDA's file (NULL = LEA's original evidence)
                **info,
            )
            db.add(row)
            new_rows.append(row)
        db.commit()
    except Exception:
        db.rollback()
        for path in saved_paths:   # all-or-nothing: no orphaned files on disk
            if os.path.exists(path):
                os.remove(path)
        raise

    for row in new_rows:
        db.refresh(row)
    return [SharedFileResponse.model_validate(row) for row in new_rows]


def delete_fda_attachment(db: Session, request_id: UUID, file_id: UUID, current_user) -> None:
    if current_user.role != Role.FDA_PERSONNEL:   # role first
        raise HTTPException(status_code=403, detail="Only FDA personnel can remove attachments.")

    # Own file only, same region, walk-in only. 404 for "not yours" and "doesn't exist" alike.
    found = (
        db.query(SharedFile, VerificationRequest)
        .join(VerificationRequest, VerificationRequest.request_id == SharedFile.request_id)
        .join(Complaint, Complaint.complaint_id == VerificationRequest.complaint_id)
        .filter(
            SharedFile.file_id == file_id,
            SharedFile.request_id == request_id,
            SharedFile.uploaded_by == current_user.user_id,
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",
            Complaint.deleted_at.is_(None),
        )
        .first()
    )
    if found is None:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    shared_file, vr = found

    if vr.verification_request_status != "pending":
        raise HTTPException(status_code=400, detail="Attachments can only be removed while the request is pending.")

    file_path = shared_file.file_path
    db.delete(shared_file)
    db.commit()

    # Row first, disk second: a stray file is harmless, a row pointing at a missing file is not
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError:
        pass


# Functions: delete_request_attachments, remove_files_from_disk  (ADD at the end of the file)

def delete_request_attachments(
    db: Session, request_id: UUID, uploaded_by=None, keep_uploaded_by=None
) -> list[str]:
    # Deletes ROWS only and returns their disk paths. The caller commits, THEN calls
    # remove_files_from_disk, so a failed commit never leaves rows pointing at deleted files.
    query = db.query(SharedFile).filter(SharedFile.request_id == request_id)
    if uploaded_by is not None:
        query = query.filter(SharedFile.uploaded_by == uploaded_by)        # only this officer's files
    if keep_uploaded_by is not None:
        query = query.filter(SharedFile.uploaded_by != keep_uploaded_by)   # everyone except this officer
    rows = query.all()
    paths = [row.file_path for row in rows]
    for row in rows:
        db.delete(row)
    return paths


def remove_files_from_disk(paths: list[str]) -> None:
    for path in paths:
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass   # the row is already gone; a stray file on disk is harmless