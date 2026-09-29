from datetime import date as date_type
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, aliased
from sqlalchemy import cast, Date

from app.models.verification_requests import VerificationRequest
from app.models.complaints import Complaint
from app.models.users import User
from app.core.user_display import format_officer_display_name, get_display_name_across_agencies
from app.desktop.schemas.verification.verification import (
    FdaVerificationCompletedListItem,
    FdaVerificationCompletedListResponse,
    FdaVerificationCompletedDetailResponse,
    FdaVerificationRejectedListItem,
    FdaVerificationRejectedListResponse,
    FdaVerificationRejectedDetailResponse,
    FdaVerificationQueueCounts,
)

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
        .filter(Complaint.region_id == current_user.region_id)
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
        requested_by_name=get_display_name_across_agencies(db, verification_request.requested_by),        verification_result=(
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
    )

# tiny dashboard for queue, completed, and rejected counts
def get_fda_verification_queue_counts(db: Session, current_user) -> FdaVerificationQueueCounts:
    base = (
        db.query(VerificationRequest)
        .join(Complaint, VerificationRequest.complaint_id == Complaint.complaint_id)
        .filter(Complaint.region_id == current_user.region_id)
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