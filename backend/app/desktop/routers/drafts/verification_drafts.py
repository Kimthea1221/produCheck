from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.sessions import get_db
from app.models.verification_request_drafts import VerificationRequestDraft
from app.models.complaints import Complaint
from app.desktop.schemas.drafts.drafts import (
    VerificationRequestDraftSave,
    VerificationRequestDraftResponse,
    DraftStatus,
    SortOption,
)
from app.desktop.schemas.complaints.complaints import VerificationRequestDraftDetailResponse
from app.desktop.services.complaints.complaint_detail_service import get_complaint_verification_detail
from app.desktop.services.account_status.guards import assert_lea_user   # ADDED

from app.core.dependencies import get_current_user


router = APIRouter(prefix="/drafts/verification", tags=["Verification Request Drafts"])


# Fields the officer's compose screen requires (Image 3) — everything
# except product_code, which is explicitly labeled "(if known)" in
# the UI. Same pattern as walk-in's REQUIRED_TEXT_FIELDS, just a
# shorter list since this draft type has far fewer fields overall.
REQUIRED_FIELDS = ["priority", "notes_to_fda"]


# ADDED HELPER: a draft may only point at a walk-in complaint in the officer's own region
def _assert_walkin_complaint_in_region(db: Session, complaint_id: UUID, current_user) -> None:
    exists = db.query(Complaint.complaint_id).filter(
        Complaint.complaint_id == complaint_id,
        Complaint.region_id == current_user.region_id,
        Complaint.source == "walk_in",
        Complaint.deleted_at.is_(None),
    ).first()
    if exists is None:
        raise HTTPException(status_code=404, detail="Complaint not found.")


def _determine_draft_status(data: VerificationRequestDraftSave) -> DraftStatus:
    for field_name in REQUIRED_FIELDS:
        value = getattr(data, field_name)
        if value is None or (isinstance(value, str) and value.strip() == ""):
            return DraftStatus.incomplete
    return DraftStatus.draft                         


    #
    #
    #
    #
    #
    #
    # POST /drafts/verification/
@router.post("/", response_model=VerificationRequestDraftResponse)
def save_verification_draft(
    data: VerificationRequestDraftSave,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)   # ADDED
    _assert_walkin_complaint_in_region(db, data.complaint_id, current_user)   # ADDED: was saving any complaint_id

    status = _determine_draft_status(data)  

    new_draft = VerificationRequestDraft(
        saved_by=current_user.user_id,
        region_id=current_user.region_id,
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
    # GET /drafts/verification/{draft_id}
@router.get("/{draft_id}", response_model=VerificationRequestDraftDetailResponse)
def get_verification_draft(
    draft_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)   # ADDED

    draft = db.query(VerificationRequestDraft).filter(
        VerificationRequestDraft.draft_id == draft_id,
        VerificationRequestDraft.saved_by == current_user.user_id,
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    complaint_detail = get_complaint_verification_detail(db, draft.complaint_id, current_user.region_id)

    return VerificationRequestDraftDetailResponse(
        draft_id=draft.draft_id,
        draft_status=draft.draft_status,
        product_code=draft.product_code,
        priority=draft.priority,
        notes_to_fda=draft.notes_to_fda,
        saved_by=draft.saved_by,
        region_id=draft.region_id,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
        complaint=complaint_detail,
    )


    #
    #
    #
    #
    #
    #
    # PUT /drafts/verification/{draft_id}
@router.put("/{draft_id}", response_model=VerificationRequestDraftResponse)
def update_verification_draft(
    draft_id: UUID,
    data: VerificationRequestDraftSave,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)   # ADDED
    _assert_walkin_complaint_in_region(db, data.complaint_id, current_user)   # ADDED: PUT also overwrites complaint_id

    draft = db.query(VerificationRequestDraft).filter(
        VerificationRequestDraft.draft_id == draft_id,
        VerificationRequestDraft.saved_by == current_user.user_id,
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    for field_name, value in data.model_dump().items():
        setattr(draft, field_name, value)

    # Recalculate status on every update too — an officer might edit
    # a draft to REMOVE priority/notes (unlikely, but the schema
    # technically allows it), which should knock it back to incomplete
    draft.draft_status = _determine_draft_status(data)

    db.commit()
    db.refresh(draft)
    return draft


    #
    #
    #
    #
    #
    #
    # DELETE /drafts/verification/{draft_id}
@router.delete("/{draft_id}")
def delete_verification_draft(
    draft_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)   # ADDED

    draft = db.query(VerificationRequestDraft).filter(
        VerificationRequestDraft.draft_id == draft_id,
        VerificationRequestDraft.saved_by == current_user.user_id,
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    db.delete(draft)
    db.commit()
    return {"message": "Draft deleted successfully."}


    #
    #
    #
    #
    #
    #
    # GET /drafts/verification/
@router.get("/", response_model=list[VerificationRequestDraftResponse])
def list_verification_drafts(
    status: DraftStatus | None = Query(None),
    search: str | None = Query(None, max_length=150),
    sort: SortOption = Query(SortOption.recently_edited),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)   # ADDED
    
    # Joined to Complaint from the start, since search AND sort both
    # potentially need product_title — which only exists on the
    # joined table, not on VerificationRequestDraft itself
    query = db.query(VerificationRequestDraft).join(
        Complaint, VerificationRequestDraft.complaint_id == Complaint.complaint_id
    ).filter(
        VerificationRequestDraft.saved_by == current_user.user_id
    )

    if status is not None:
        query = query.filter(VerificationRequestDraft.draft_status == status)

    if search is not None:
        query = query.filter(Complaint.product_title.ilike(f"%{search}%"))

    if sort == SortOption.recently_edited:
        query = query.order_by(VerificationRequestDraft.updated_at.desc())
    elif sort == SortOption.oldest_first:
        query = query.order_by(VerificationRequestDraft.updated_at.asc())  
    elif sort == SortOption.product_name_az:
        query = query.order_by(Complaint.product_title.asc())  

    return query.all()