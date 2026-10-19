from uuid import UUID


from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from datetime import date
from sqlalchemy import cast, Date

from app.database.sessions import get_db
from app.models.fda_verification_drafts import FdaVerificationDraft
from app.models.verification_requests import VerificationRequest
from app.models.complaints import Complaint
from app.models.users import User
from app.models.shared_files import SharedFile

from app.desktop.schemas.complaints.complaints import SharedFileResponse
from app.desktop.schemas.drafts.fda_draft_detail import FdaVerificationDraftDetailWithFilesResponse   # ADDED
from app.desktop.schemas.drafts.drafts import (
    FdaVerificationDraftSave,
    FdaVerificationDraftResponse,
    FdaVerificationDraftListItem,
    FdaVerificationDraftListResponse,
    DraftStatus,
    SortOption,
)
from app.core.dependencies import get_current_user
from app.core.user_display import format_officer_display_name, get_display_name_across_agencies   # CHANGED: added cross-agency lookup
from app.core.constants import Role   # ADDED

from app.desktop.services.verification.fda_attachments_service import delete_request_attachments, remove_files_from_disk   # ADDED
from app.desktop.services.verification.verification_helpers import get_request_and_complaint_in_region   # CHANGED: shared with the drafts router



router = APIRouter(prefix="/drafts/fda-verification", tags=["FDA Verification Drafts"])


# ADDED: only FDA personnel work on FDA drafts; without this any region user could create one
def _assert_fda_personnel(current_user) -> None:
    if current_user.role != Role.FDA_PERSONNEL:
        raise HTTPException(status_code=403, detail="Only FDA personnel can manage verification drafts.")


# Deciding incomplete vs draft is much simpler here than on the LEA
# side — there's only ONE thing that has to be filled in before this
# stops being "incomplete": the officer has to have picked Registered
# or Unregistered. Everything else (CPR number, remarks, reason) can
# stay blank in a draft no matter what.
def _determine_draft_status(data: FdaVerificationDraftSave) -> DraftStatus:
    if data.draft_verification_status is None:
        return DraftStatus.incomplete
    return DraftStatus.draft


    #
    #
    #
    #
    #
    #
    # POST /drafts/fda-verification/{verification_request_id}
    # Saves the officer's in-progress findings for one verification
    # request. First save creates the draft row; every save after
    # that updates the SAME row — the officer never ends up with two
    # drafts for one case, since this checks for an existing draft
    # before deciding whether to insert or update.
@router.post("/{verification_request_id}", response_model=FdaVerificationDraftResponse)
def save_fda_verification_draft(
    verification_request_id: UUID,
    data: FdaVerificationDraftSave,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _assert_fda_personnel(current_user)

    # Confirms the request is real and in-region BEFORE touching the
    # drafts table at all — no point creating a draft against a
    # request this officer shouldn't even be able to see.
    verification_request, complaint = get_request_and_complaint_in_region(db, verification_request_id, current_user)

    # Drafts only make sense while a request is still awaiting a
    # decision — once it's been responded to, saving a draft against
    # it would just be dead data nobody can ever act on.
    if verification_request.verification_request_status != "pending":
        raise HTTPException(
            status_code=400,
            detail="This verification request has already been responded to and can no longer be drafted.",
        )

    status = _determine_draft_status(data)

    # THE UPSERT CHECK — this single query is what makes "Save Draft"
    # safe to click repeatedly on the same case without ever creating
    # duplicate rows.
    existing_draft = db.query(FdaVerificationDraft).filter(
        FdaVerificationDraft.verification_request_id == verification_request_id,
        FdaVerificationDraft.saved_by == current_user.user_id,
    ).first()

    if existing_draft:
        for field_name, value in data.model_dump().items():
            setattr(existing_draft, field_name, value)
        existing_draft.draft_status = status
        db.commit()
        db.refresh(existing_draft)
        return existing_draft

    new_draft = FdaVerificationDraft(
        saved_by=current_user.user_id,
        verification_request_id=verification_request_id,
        draft_status=status,
        **data.model_dump(),
    )
    db.add(new_draft)
    db.commit()
    db.refresh(new_draft)
    return new_draft


    #
    #
    #
    #
    #
    #
    # GET /drafts/fda-verification/{draft_id}
    # Powers both the "View" and "Edit Draft" buttons in the Saved
    # Drafts table — same call either way, since the officer's own
    # frontend decides whether the form opens read-only or editable.
    # Returns the officer's saved fields PLUS read-only case info
    # (product name, manufacturer, etc.) pulled from the parent
    # request/complaint, so the frontend has everything it needs to
    # redraw the full Verification Queue screen for this case.
@router.get("/{draft_id}", response_model=FdaVerificationDraftDetailWithFilesResponse)
def get_fda_verification_draft(
    draft_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _assert_fda_personnel(current_user)
    draft = db.query(FdaVerificationDraft).filter(
        FdaVerificationDraft.draft_id == draft_id,
        # Ownership check — same vague-404 reasoning as the LEA
        # drafts: "not found" whether it truly doesn't exist, or it
        # exists but belongs to a different officer.
        FdaVerificationDraft.saved_by == current_user.user_id,
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    verification_request, complaint = (
        db.query(VerificationRequest, Complaint)
        .join(Complaint, VerificationRequest.complaint_id == Complaint.complaint_id)
        .filter(VerificationRequest.request_id == draft.verification_request_id)
        .first()
    ) 

    requested_by_name = get_display_name_across_agencies(db, verification_request.requested_by)   # CHANGED: format_officer_display_name returns None for the other agency

    # ADDED: only THIS officer's files on this request (another officer's uploads must not show here)
    own_files = (
        db.query(SharedFile)
        .filter(
            SharedFile.request_id == draft.verification_request_id,
            SharedFile.uploaded_by == current_user.user_id,
        )
        .order_by(SharedFile.uploaded_at.asc())
        .all()
    )

    # CHANGED: the final return builds the new class instead of FdaVerificationDraftDetailResponse
    return FdaVerificationDraftDetailWithFilesResponse(
        **FdaVerificationDraftResponse.model_validate(draft).model_dump(),
        case_reference=complaint.case_reference,
        product_name=verification_request.product_name,
        manufacturer=complaint.manufacturer,
        product_category=complaint.product_category,
        requested_by_name=requested_by_name,
        requested_at=verification_request.requested_at,
        attached_files=[SharedFileResponse.model_validate(f) for f in own_files],
    )


    #
    #
    #
    #
    #
    #
    # DELETE /drafts/fda-verification/{draft_id}
    # Removes one draft. Used by the "⋮" menu's Delete option, AND
    # reused later by the real submit logic — once an officer's
    # findings are actually submitted to verification_requests, the
    # leftover draft for that case gets deleted the same way.
@router.delete("/{draft_id}")
def delete_fda_verification_draft(
    draft_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _assert_fda_personnel(current_user)

    draft = db.query(FdaVerificationDraft).filter(
        FdaVerificationDraft.draft_id == draft_id,
        FdaVerificationDraft.saved_by == current_user.user_id,
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    # ADDED: discarding a draft also discards this officer's saved files, but only while the request is pending.
    # After a submit those files ARE the response LEA sees, so they must survive.
    verification_request = db.query(VerificationRequest).filter(
        VerificationRequest.request_id == draft.verification_request_id
    ).first()
    file_paths: list[str] = []
    if verification_request is not None and verification_request.verification_request_status == "pending":
        file_paths = delete_request_attachments(
            db, draft.verification_request_id, uploaded_by=current_user.user_id
        )

    db.delete(draft)
    db.commit()
    remove_files_from_disk(file_paths)   # ADDED: after the commit, never before
    return {"message": "Draft deleted successfully."}


    #
    #
    #
    #
    #
    #
    # GET /drafts/fda-verification/
    # Fills the whole Saved Drafts table (Image 4 from earlier) — one
    # row per draft this officer owns, with case_reference/
    # product_name/manufacturer/category pulled in from the joined
    # request+complaint, since none of that lives on the draft row
    # itself.
@router.get("/", response_model=FdaVerificationDraftListResponse)
def list_fda_verification_drafts(
    search: str | None = Query(None, max_length=150),
    category: str | None = Query(None),
    date_filter: date | None = Query(None),
    sort: SortOption = Query(SortOption.recently_edited),
    page: int = Query(1, ge=1),
    page_size: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _assert_fda_personnel(current_user)

    query = (
        db.query(FdaVerificationDraft, VerificationRequest, Complaint)
        .join(VerificationRequest, FdaVerificationDraft.verification_request_id == VerificationRequest.request_id)
        .join(Complaint, VerificationRequest.complaint_id == Complaint.complaint_id)
        .filter(FdaVerificationDraft.saved_by == current_user.user_id)
    )

    if search is not None:
        query = query.filter(
            Complaint.case_reference.ilike(f"%{search}%")
            | VerificationRequest.product_name.ilike(f"%{search}%")
            | Complaint.manufacturer.ilike(f"%{search}%")
        )

    if category is not None:
        query = query.filter(Complaint.product_category == category)

    if date_filter is not None:
        query = query.filter(cast(FdaVerificationDraft.updated_at, Date) == date_filter)

    # Total count BEFORE pagination is applied — this is what powers
    # "Showing 1-5 of 6 drafts." Counting after .offset()/.limit()
    # would just return the page size, not the real total.
    total = query.count()

    if sort == SortOption.recently_edited:
        query = query.order_by(FdaVerificationDraft.updated_at.desc())
    elif sort == SortOption.oldest_first:
        query = query.order_by(FdaVerificationDraft.updated_at.asc())
    elif sort == SortOption.product_name_az:
        query = query.order_by(VerificationRequest.product_name.asc())

    offset = (page - 1) * page_size
    results = query.offset(offset).limit(page_size).all()

    items = [
        FdaVerificationDraftListItem(
            draft_id=draft.draft_id,
            verification_request_id=draft.verification_request_id,
            case_reference=complaint.case_reference,
            product_name=verification_request.product_name,
            manufacturer=complaint.manufacturer,
            product_category=complaint.product_category,
            draft_status=draft.draft_status,
            updated_at=draft.updated_at,
        )
        for draft, verification_request, complaint in results
    ]

    return FdaVerificationDraftListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )