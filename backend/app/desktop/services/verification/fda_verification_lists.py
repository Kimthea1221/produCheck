from datetime import date as date_type
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, aliased
from sqlalchemy import cast, Date, case as sa_case, func, or_

from app.models.verification_requests import VerificationRequest
from app.models.complaints import Complaint
from app.models.users import User
from app.models.shared_files import SharedFile

from app.desktop.schemas.complaints.complaints import SharedFileResponse   # ADDED: used by list_lea_follow_up for attached_files
from app.core.user_display import format_officer_display_name, get_display_name_across_agencies
from app.desktop.schemas.verification.verification import (
    FdaVerificationCompletedListItem,
    FdaVerificationCompletedListResponse,
    FdaVerificationCompletedDetailResponse,
    FdaVerificationRejectedListItem,
    FdaVerificationRejectedListResponse,
    FdaVerificationRejectedDetailResponse,
    FdaVerificationQueueCounts,
    LeaFdaResponseResultChoice,
    LeaFollowUpStage,
    LeaFollowUpListItem,
    LeaFollowUpListResponse, 
)

from app.desktop.services.verification.verification_helpers import get_response_files, get_lea_evidence_files   # CHANGED
# ============================================================
# FDA COMPLETED AND REJECTED LISTS
# ============================================================

# Two separate aliases of the User table — one for whoever REQUESTED
# the verification (the LEA officer), one for whoever RESPONDED to it
# (the FDA officer). Needed because both foreign keys point at the
# same users table; without aliasing, SQLAlchemy has no way to tell
# the two joined copies apart in one query.
Requester = aliased(User)
Responder = aliased(User)


# Shared starting point for every query in this file — joins in
# Complaint AND both officer names in one trip, so no row in any
# list ever needs a follow-up query just to resolve a name.
def _base_query(db: Session, current_user):
    return (
        db.query(VerificationRequest, Complaint, Requester, Responder)
        .join(Complaint, VerificationRequest.complaint_id == Complaint.complaint_id)
        .outerjoin(Requester, VerificationRequest.requested_by == Requester.user_id)
        .outerjoin(Responder, VerificationRequest.responded_by == Responder.user_id)
        .filter(
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",   # ADDED: covers completed/rejected lists and their details
        )
    )


def _apply_common_filters(query, search, category, date_from, date_to):
    if search is not None:
        query = query.filter(
            Complaint.case_reference.ilike(f"%{search}%")
            | VerificationRequest.product_name.ilike(f"%{search}%")
            | Complaint.manufacturer.ilike(f"%{search}%")
        )
    if category is not None:
        query = query.filter(Complaint.product_category == category)
    if date_from is not None:
        query = query.filter(cast(VerificationRequest.responded_at, Date) >= date_from)
    if date_to is not None:
        query = query.filter(cast(VerificationRequest.responded_at, Date) <= date_to)
    return query


def list_fda_verification_completed(
    db: Session,
    current_user,
    search: str | None,
    category: str | None,
    verification_result: str | None,
    date_from: date_type | None,
    date_to: date_type | None,
    page: int,
    page_size: int,
) -> FdaVerificationCompletedListResponse:
    query = _base_query(db, current_user).filter(
        VerificationRequest.verification_request_status.in_(
            ["confirmed_registered", "confirmed_unregistered"]
        )
    )

    # ADDED — narrows down to just one of the two completed outcomes,
    # when the officer picks "Registered" or "Unregistered" specifically
    # instead of leaving the dropdown on "All Results".
    if verification_result is not None:
        target_status = (
            "confirmed_registered" if verification_result == "registered" else "confirmed_unregistered"
        )
        query = query.filter(VerificationRequest.verification_request_status == target_status)

    query = _apply_common_filters(query, search, category, date_from, date_to)

    total = query.count()
    query = query.order_by(VerificationRequest.responded_at.desc())
    offset = (page - 1) * page_size
    results = query.offset(offset).limit(page_size).all()

    # No per-row query anymore — requester/responder came back as
    # part of the same joined result set above.
    items = [
        FdaVerificationCompletedListItem(
            request_id=verification_request.request_id,
            case_reference=complaint.case_reference,
            product_name=verification_request.product_name,
            manufacturer=complaint.manufacturer,
            product_category=complaint.product_category,
            requested_at=verification_request.requested_at,
            responded_at=verification_request.responded_at,
            verification_result=(
                "registered"
                if verification_request.verification_request_status == "confirmed_registered"
                else "unregistered"
            ),
            verified_by_name=format_officer_display_name(responder),
        )
        for verification_request, complaint, requester, responder in results
    ]

    return FdaVerificationCompletedListResponse(items=items, total=total, page=page, page_size=page_size)


def get_fda_verification_completed_detail(
    db: Session, request_id: UUID, current_user
) -> FdaVerificationCompletedDetailResponse:
    result = _base_query(db, current_user).filter(
        VerificationRequest.request_id == request_id,
        VerificationRequest.verification_request_status.in_(
            ["confirmed_registered", "confirmed_unregistered"]
        ),
    ).first()

    if result is None:
        raise HTTPException(status_code=404, detail="Completed verification record not found.")

    verification_request, complaint, requester, responder = result

    return FdaVerificationCompletedDetailResponse(
        request_id=verification_request.request_id,
        case_reference=complaint.case_reference,
        product_name=verification_request.product_name,
        manufacturer=complaint.manufacturer,
        product_category=complaint.product_category,
        requested_at=verification_request.requested_at,
        # CHANGED — was format_officer_display_name(requester), which is None under RLS
        requested_by_name=get_display_name_across_agencies(db, verification_request.requested_by),        
        verification_result=(
            "registered"
            if verification_request.verification_request_status == "confirmed_registered"
            else "unregistered"
        ),
        cpr_number=verification_request.cpr_number,
        cpr_expiry=verification_request.cpr_expiry,
        response_notes=verification_request.response_notes,
        unregistered_reason=verification_request.unregistered_reason,
        verified_by_name=format_officer_display_name(responder),
        responded_at=verification_request.responded_at,
        response_files=get_response_files(db, verification_request),   # ADDED: the officer's own response files
        product_code=verification_request.product_code,                          # ADDED
        reminder_sent_at=verification_request.reminder_sent_at,                  # ADDED
        attached_files=get_lea_evidence_files(db, complaint.complaint_id),       # ADDED
    )


def list_fda_verification_rejected(
    db: Session,
    current_user,
    search: str | None,
    category: str | None,
    date_from: date_type | None,
    date_to: date_type | None,
    page: int,
    page_size: int,
) -> FdaVerificationRejectedListResponse:
    query = _base_query(db, current_user).filter(
        VerificationRequest.verification_request_status == "rejected"
    )
    query = _apply_common_filters(query, search, category, date_from, date_to)

    total = query.count()
    query = query.order_by(VerificationRequest.responded_at.desc())
    offset = (page - 1) * page_size
    results = query.offset(offset).limit(page_size).all()

    items = [
        FdaVerificationRejectedListItem(
            request_id=verification_request.request_id,
            case_reference=complaint.case_reference,
            product_name=verification_request.product_name,
            manufacturer=complaint.manufacturer,
            product_category=complaint.product_category,
            requested_at=verification_request.requested_at,
            responded_at=verification_request.responded_at,
            rejected_by_name=format_officer_display_name(responder),
        )
        for verification_request, complaint, requester, responder in results
    ]

    return FdaVerificationRejectedListResponse(items=items, total=total, page=page, page_size=page_size)


def get_fda_verification_rejected_detail(
    db: Session, request_id: UUID, current_user
) -> FdaVerificationRejectedDetailResponse:
    result = _base_query(db, current_user).filter(
        VerificationRequest.request_id == request_id,
        VerificationRequest.verification_request_status == "rejected",
    ).first()

    if result is None:
        raise HTTPException(status_code=404, detail="Rejected verification record not found.")

    verification_request, complaint, requester, responder = result

    return FdaVerificationRejectedDetailResponse(
        request_id=verification_request.request_id,
        case_reference=complaint.case_reference,
        product_name=verification_request.product_name,
        manufacturer=complaint.manufacturer,
        product_category=complaint.product_category,
        requested_at=verification_request.requested_at,
        # CHANGED — was format_officer_display_name(requester), which is None under RLS
        requested_by_name=get_display_name_across_agencies(db, verification_request.requested_by),        rejected_by_name=format_officer_display_name(responder),
        responded_at=verification_request.responded_at,
        rejection_reason=verification_request.rejection_reason,
        product_code=verification_request.product_code,                          # ADDED
        reminder_sent_at=verification_request.reminder_sent_at,                  # ADDED
        attached_files=get_lea_evidence_files(db, complaint.complaint_id),       # ADDED
    )

# tiny dashboard for queue, completed, and rejected counts
def get_fda_verification_queue_counts(db: Session, current_user) -> FdaVerificationQueueCounts:
    base = (
        db.query(VerificationRequest)
        .join(Complaint, VerificationRequest.complaint_id == Complaint.complaint_id)
        .filter(
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",   # ADDED: counts match the walk-in-only lists
        )
    )

    return FdaVerificationQueueCounts(
        verification_queue_count=base.filter(
            VerificationRequest.verification_request_status == "pending"
        ).count(),
        completed_count=base.filter(
            VerificationRequest.verification_request_status.in_(
                ["confirmed_registered", "confirmed_unregistered"]
            )
        ).count(),
        rejected_count=base.filter(
            VerificationRequest.verification_request_status == "rejected"
        ).count(),
    )


# Function: list_lea_follow_up

_FDA_RESULT_BY_STATUS = {
    "confirmed_registered": "registered",
    "confirmed_unregistered": "unregistered",
    "rejected": "rejected",
}


def list_lea_follow_up(
    db: Session,
    current_user,
    search: str | None,
    stage: LeaFollowUpStage | None,
    fda_result: LeaFdaResponseResultChoice | None,
    page: int,
    page_size: int,
) -> LeaFollowUpListResponse:
    # Derived, never stored. Registered/rejected: only lea_acknowledged_at decides
    # (complaint is 'dismissed' in both stages). Unregistered: complaint.status decides.
    stage_expr = sa_case(
        (
            VerificationRequest.verification_request_status == "confirmed_unregistered",
            sa_case(
                (Complaint.status == "completed", "closed"),
                (Complaint.status == "takedown_initiated", "takedown_initiated"),
                else_="awaiting_lea",
            ),
        ),
        else_=sa_case(
            (VerificationRequest.lea_acknowledged_at.is_(None), "awaiting_lea"),
            else_="acknowledged",
        ),
    )
    # GREATEST ignores NULLs in Postgres, so unset timestamps are skipped
    last_updated_expr = func.greatest(
        VerificationRequest.responded_at,
        VerificationRequest.lea_acknowledged_at,
        Complaint.field_operation_logged_at,
        Complaint.closed_at,
    )

    query = (
        db.query(
            VerificationRequest,
            Complaint,
            stage_expr.label("lea_stage"),
            last_updated_expr.label("last_updated_at"),
        )
        .join(Complaint, Complaint.complaint_id == VerificationRequest.complaint_id)
        .filter(
            Complaint.region_id == current_user.region_id,   # region scope
            Complaint.source == "walk_in",                   # walk-in only
            Complaint.deleted_at.is_(None),
            VerificationRequest.verification_request_status.in_(list(_FDA_RESULT_BY_STATUS)),
        )
    )

    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Complaint.case_reference.ilike(like),
                Complaint.product_title.ilike(like),
                Complaint.manufacturer.ilike(like),
            )
        )
    if fda_result:
        status_for_result = {v: k for k, v in _FDA_RESULT_BY_STATUS.items()}[fda_result.value]
        query = query.filter(VerificationRequest.verification_request_status == status_for_result)
    if stage:
        query = query.filter(stage_expr == stage.value)

    total = query.count()
    rows = (
        query.order_by(last_updated_expr.desc(), VerificationRequest.request_id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # LEA's original evidence for this page, in one query (request_id IS NULL = LEA's, not FDA's)
    complaint_ids = [c.complaint_id for _, c, _, _ in rows]
    files_by_complaint: dict = {}
    if complaint_ids:
        for f in (
            db.query(SharedFile)
            .filter(SharedFile.complaint_id.in_(complaint_ids), SharedFile.request_id.is_(None))
            .all()
        ):
            files_by_complaint.setdefault(f.complaint_id, []).append(f)

    # Cross-agency name lookup (FDA can't read LEA user rows under RLS); cached per request
    names: dict = {}

    def _name(user_id):
        if user_id is None:
            return None
        if user_id not in names:
            names[user_id] = get_display_name_across_agencies(db, user_id)
        return names[user_id]

    items = []
    for vr, complaint, lea_stage, last_updated_at in rows:
        is_unregistered = vr.verification_request_status == "confirmed_unregistered"
        items.append(
            LeaFollowUpListItem(
                request_id=vr.request_id,
                case_reference=complaint.case_reference,
                product_title=complaint.product_title,
                product_category=complaint.product_category,
                manufacturer=complaint.manufacturer,
                source=complaint.source,
                product_code=vr.product_code,
                fda_result=_FDA_RESULT_BY_STATUS[vr.verification_request_status],
                responded_at=vr.responded_at,
                verified_by_name=_name(vr.responded_by),
                lea_stage=lea_stage,
                last_updated_at=last_updated_at,
                acknowledged_at=vr.lea_acknowledged_at,
                acknowledged_by_name=_name(vr.lea_acknowledged_by),
                # takedown/closing data exists only on the unregistered path
                takedown_initiated_at=complaint.field_operation_logged_at if is_unregistered else None,
                takedown_initiated_by_name=_name(complaint.field_operation_logged_by) if is_unregistered else None,
                field_operation_notes=complaint.field_operation_notes if is_unregistered else None,
                closed_at=complaint.closed_at if is_unregistered else None,
                closed_by_name=_name(complaint.closed_by) if is_unregistered else None,
                close_reason="Completed" if lea_stage == "closed" else None,   # CHANGED: frontend displays this text as-is                
                closing_notes=complaint.closing_notes if is_unregistered else None,
                reminder_sent_at=vr.reminder_sent_at,
                attached_files=[
                    SharedFileResponse.model_validate(f)
                    for f in files_by_complaint.get(complaint.complaint_id, [])
                ],
            )
        )

    return LeaFollowUpListResponse(items=items, total=total, page=page, page_size=page_size)