# File: backend/app/desktop/schemas/drafts/fda_draft_detail.py

from app.desktop.schemas.drafts.drafts import FdaVerificationDraftDetailResponse
from app.desktop.schemas.complaints.complaints import SharedFileResponse


# ADDED: separate module so drafts.py never imports complaints.py (complaints.py already imports drafts.py)
class FdaVerificationDraftDetailWithFilesResponse(FdaVerificationDraftDetailResponse):
    attached_files: list[SharedFileResponse] = []   # this officer's own saved files for the request