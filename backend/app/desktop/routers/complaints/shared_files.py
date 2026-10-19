# File: shared_files.py  (the router with prefix /shared-files)
import os
import mimetypes   # ADDED: derive the preview type from the file name
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session


from app.database.sessions import get_db
from app.core.dependencies import get_current_user
from app.models.shared_files import SharedFile
from app.models.complaints import Complaint  # ADDED
from app.models.verification_requests import VerificationRequest  # ADDED
from app.desktop.services.account_status.guards import is_lea_user  # ADDED


router = APIRouter(prefix="/shared-files", tags=["Shared Files"])


# ADDED: one access rule shared by download and preview, so they can't drift apart.
def _get_accessible_file(db: Session, file_id: UUID, current_user) -> SharedFile:
    file_row = db.query(SharedFile).filter(
        SharedFile.file_id == file_id,
        SharedFile.region_id == current_user.region_id,   # region scoping, same as before
    ).first()

    if not file_row:
        raise HTTPException(status_code=404, detail="File not found.")

    if is_lea_user(current_user):
        # ADDED: LEA only handles walk-in complaints, so extension files are not theirs to open
        walkin_file = db.query(Complaint.complaint_id).filter(
            Complaint.complaint_id == file_row.complaint_id,
            Complaint.source == "walk_in",
        ).first()
        if walkin_file is None:
            raise HTTPException(status_code=404, detail="File not found.")   # same 404 as missing
        # ADDED: an FDA officer's attachment opens for LEA only once that officer has
        # responded, the same files get_response_files shows
        if file_row.request_id is not None:
            answered = db.query(VerificationRequest.request_id).filter(
                VerificationRequest.request_id == file_row.request_id,
                VerificationRequest.responded_at.isnot(None),
                VerificationRequest.responded_by == file_row.uploaded_by,
            ).first()
            if answered is None:
                raise HTTPException(status_code=404, detail="File not found.")   # same 404 as missing
    else:
        # Non-LEA users can't open files on walk-in complaints LEA hasn't sent yet.
        # Extension files and everything else behave exactly as before.
        unsent_walkin = db.query(Complaint.complaint_id).filter(
            Complaint.complaint_id == file_row.complaint_id,
            Complaint.source == "walk_in",
            Complaint.status == "open",
        ).first()
        if unsent_walkin is not None:
            raise HTTPException(status_code=404, detail="File not found.")

    return file_row


    #
    #
    #
    #
    #
    #
    # GET /shared-files/{file_id}/download
@router.get("/{file_id}/download")
def download_shared_file(
    file_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    file_row = _get_accessible_file(db, file_id, current_user)  # CHANGED: role-aware access check

    if not os.path.exists(file_row.file_path):
        # Row exists but the physical file is missing — a real edge
        # case worth surfacing clearly rather than crashing
        raise HTTPException(status_code=404, detail="File no longer exists on disk.")

    # FileResponse streams the actual file bytes back to whoever
    # requested it. filename= sets what the browser suggests as the
    # saved filename (the ORIGINAL name, not the UUID-prefixed one
    # stored on disk) — media_type tells the browser what kind of
    # file it is, so it can decide to preview vs. force-download it.
    return FileResponse(
        path=file_row.file_path,
        filename=file_row.file_name,
        media_type=file_row.mime_type,
    )


    #
    #
    #
    #
    #
    #
    # GET /shared-files/{file_id}/preview
@router.get("/{file_id}/preview")
def preview_shared_file(
    file_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    file_row = _get_accessible_file(db, file_id, current_user)  # CHANGED: role-aware access check

    if not os.path.exists(file_row.file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk.")

    # Identical to download, except content_disposition_type="inline" —
    # this is what tells the browser to render the file (for our
    # <img>/<iframe> preview) instead of forcing a save-as download.
    # CHANGED: type comes from the file name, not the uploader's claim; nosniff stops
    # the browser guessing HTML out of a mislabeled file
    media_type = mimetypes.guess_type(file_row.file_name)[0] or "application/octet-stream"
    return FileResponse(
        path=file_row.file_path,
        filename=file_row.file_name,
        media_type=media_type,
        content_disposition_type="inline",
        headers={"X-Content-Type-Options": "nosniff"},
    )