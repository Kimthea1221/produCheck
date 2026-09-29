# backend/app/desktop/services/verification/lea_verification_lists.py
from uuid import UUID
from datetime import date as date_type

from fastapi import HTTPException
from sqlalchemy.orm import Session, aliased
from sqlalchemy import or_, and_, case as sa_case, cast, Date

from app.models.complaints import Complaint
from app.models.verification_requests import VerificationRequest
from app.models.users import User
from app.models.walkin_complainants import WalkinComplainant
from app.core.user_display import format_officer_display_name, get_display_name_across_agencies
from app.desktop.schemas.verification.verification import (
    LeaVerificationQueueCounts,
    LeaFdaResponseListItem,
    LeaFdaResponseDetailResponse,
    LeaClosedCaseListItem,
    LeaClosedCaseListResponse,
)

Responder = aliased(User)
FieldOpOfficer = aliased(User)
AckOfficer = aliased(User)

# added by Darlene --start
def _result_choice(verification_request_status: str) -> str:
    if verification_request_status == "confirmed_registered":
        return "registered"
    if verification_request_status == "confirmed_unregistered":
        return "unregistered"
    return "rejected"

# FDA Response tab shows two kinds of rows: unregistered cases not yet
# taken down (Complaint.status still 'takedown_requested'), and
# registered/rejected cases already terminal on the complaint but not
# yet clicked-through by LEA (lea_acknowledged_at still null).
def _fda_response_condition():
    return or_(
        and_(
            VerificationRequest.verification_request_status == "confirmed_unregistered",
            Complaint.status == "takedown_requested",
        ),
        and_(
            VerificationRequest.verification_request_status.in_(
                ["confirmed_registered", "rejected"]
            ),
            VerificationRequest.lea_acknowledged_at.is_(None),
        ),
    )


# Rows that have left FDA Response and landed in Closed — completed
# (always terminal) or dismissed-and-acknowledged (registered/rejected
# that LEA has clicked through).
def _closed_condition():
    return or_(
        Complaint.status == "completed",
        and_(
            Complaint.status == "dismissed",
            VerificationRequest.verification_request_status.in_(
                ["confirmed_registered", "rejected"]
            ),
            VerificationRequest.lea_acknowledged_at.isnot(None),
        ),
    )
# added by Darlene --end

# fixed by Darlene --start
# FIXED — was counting Complaint.status alone, which doesn't account
# for the acknowledged-gate on registered/rejected cases. Now joins
# VerificationRequest so both counts agree with what each tab actually
# displays.
def get_lea_verification_queue_counts(db: Session, current_user) -> LeaVerificationQueueCounts:
    joined = (
        db.query(Complaint, VerificationRequest)
        .outerjoin(VerificationRequest, VerificationRequest.complaint_id == Complaint.complaint_id)
        .filter(Complaint.region_id == current_user.region_id)
    )

    fda_response_count = joined.filter(_fda_response_condition()).count()

    initiated_count = (
        db.query(Complaint)
        .filter(Complaint.region_id == current_user.region_id, Complaint.status == "takedown_initiated")
        .count()
    )

    # Closed = completed (always terminal, no acknowledge gate) OR
    # dismissed-and-acknowledged (registered/rejected that LEA has
    # already clicked through).
    dismissed_count = joined.filter(_closed_condition()).count()

    completed_count = joined.filter(Complaint.status == "completed").count()

    return LeaVerificationQueueCounts(
        fda_response_count=fda_response_count,
        initiated_count=initiated_count,
        dismissed_count=dismissed_count,
        completed_count=completed_count,
    )
# fixed by Darlene --end

# added by Darlene --start
# ============================================================
# FDA RESPONSE TAB — LEFT PANEL LIST
# ============================================================

# No search/category params — mirrors list_verification_requests_awaiting_fda's
# pattern: return the full region-scoped, tab-scoped list, let the
# frontend filter client-side (same as Ready to Send / Awaiting FDA already do).
def list_lea_fda_response(db: Session, current_user) -> list[LeaFdaResponseListItem]:
    results = (
        db.query(VerificationRequest, Complaint)
        .join(Complaint, VerificationRequest.complaint_id == Complaint.complaint_id)
        .filter(Complaint.region_id == current_user.region_id)
        .filter(_fda_response_condition())
        .order_by(VerificationRequest.responded_at.desc())
        .all()
    )

    return [
        LeaFdaResponseListItem(
            request_id=vr.request_id,
            complaint_id=complaint.complaint_id,
            case_reference=complaint.case_reference,
            product_name=vr.product_name,
            manufacturer=complaint.manufacturer,
            product_category=complaint.product_category,
            responded_at=vr.responded_at,
            verification_result=_result_choice(vr.verification_request_status),
        )
        for vr, complaint in results
    ]


# Right panel detail. One joined query pulls the responding officer's
# name and complainant name so no follow-up queries are needed.
# Scoped by the same tab condition as the list — an already-
# acknowledged case 404s here, same as it disappears from the list.
def get_lea_fda_response_detail(
    db: Session, request_id: UUID, current_user
) -> LeaFdaResponseDetailResponse:
    result = (
        db.query(VerificationRequest, Complaint, Responder, WalkinComplainant)
        .join(Complaint, VerificationRequest.complaint_id == Complaint.complaint_id)
        # outerjoin, not join — responded_by can be null if somehow
        # queried before FDA actually responded (shouldn't happen given
        # the condition filter below, but stay defensive), and
        # complainant_id on Complaint is nullable by design.
        .outerjoin(Responder, VerificationRequest.responded_by == Responder.user_id)
        .outerjoin(WalkinComplainant, Complaint.complainant_id == WalkinComplainant.complainant_id)
        .filter(Complaint.region_id == current_user.region_id)
        .filter(VerificationRequest.request_id == request_id)
        .filter(_fda_response_condition())
        .first()
    )

    if result is None:
        raise HTTPException(status_code=404, detail="FDA response record not found.")

    vr, complaint, responder, complainant = result

    return LeaFdaResponseDetailResponse(
        request_id=vr.request_id,
        complaint_id=complaint.complaint_id,
        case_reference=complaint.case_reference,
        product_title=complaint.product_title,
        manufacturer=complaint.manufacturer,
        complainant_name=complainant.full_name if complainant else None,
        product_category=complaint.product_category,
        logged_at=complaint.created_at,
        source=complaint.source,
        verification_result=_result_choice(vr.verification_request_status),
        responded_at=vr.responded_at,
        # "Verified By" for registered/unregistered, "Rejected By" for
        # rejected — same underlying column, the frontend picks the
        # label based on verification_result.
        # CHANGED — FDA verifier is invisible to an LEA session under RLS; use the cross-agency helper
        verifier_name=get_display_name_across_agencies(db, vr.responded_by),        # unregistered-only
        unregistered_reason=vr.unregistered_reason,
        # shared between registered and unregistered — label differs
        # on the frontend ("Advisory & Enforcement Recommendations" vs
        # "Official FDA Verification Remarks") but it's one column.
        response_notes=vr.response_notes,
        # unregistered-only — lives on Complaint, not VerificationRequest,
        # since it's LEA's own note and carries forward into the
        # Initiated Cases tab later.
        field_operation_notes=complaint.field_operation_notes,
        # registered-only
        cpr_number=vr.cpr_number,
        cpr_expiry=vr.cpr_expiry,
        # rejected-only. getattr as a defensive guard in case this
        # column name ever shifts — matches the same defensive pattern
        # used elsewhere for this field.
        rejection_reason=getattr(vr, "rejection_reason", None),
    )

# ============================================================
# CLOSED CASES TAB
# ============================================================

# "Date Closed" comes from different columns depending on how the case
# closed — field_operation_logged_at for completed, lea_acknowledged_at
# for dismissed. One SQL CASE expression lets both filtering and
# ordering use a single "closed_at" concept instead of branching twice.
def _closed_at_expr():
    return sa_case(
        (Complaint.status == "completed", Complaint.field_operation_logged_at),
        else_=VerificationRequest.lea_acknowledged_at,
    )


def list_lea_closed_cases(
    db: Session,
    current_user,
    search: str | None,
    category: str | None,
    reason_closed: str | None,
    date_from: date_type | None,
    date_to: date_type | None,
    page: int,
    page_size: int,
) -> LeaClosedCaseListResponse:
    query = (
        db.query(Complaint, VerificationRequest, FieldOpOfficer, AckOfficer)
        .outerjoin(VerificationRequest, VerificationRequest.complaint_id == Complaint.complaint_id)
        .outerjoin(FieldOpOfficer, Complaint.field_operation_logged_by == FieldOpOfficer.user_id)
        .outerjoin(AckOfficer, VerificationRequest.lea_acknowledged_by == AckOfficer.user_id)
        .filter(Complaint.region_id == current_user.region_id)
        .filter(_closed_condition())
    )

    if reason_closed == "completed":
        query = query.filter(Complaint.status == "completed")
    elif reason_closed == "registered":
        query = query.filter(
            Complaint.status == "dismissed",
            VerificationRequest.verification_request_status == "confirmed_registered",
        )
    elif reason_closed == "rejected":
        query = query.filter(
            Complaint.status == "dismissed",
            VerificationRequest.verification_request_status == "rejected",
        )

    if search is not None:
        query = query.filter(
            Complaint.case_reference.ilike(f"%{search}%")
            | Complaint.product_title.ilike(f"%{search}%")
            | Complaint.manufacturer.ilike(f"%{search}%")
        )

    if category is not None:
        query = query.filter(Complaint.product_category == category)

    closed_at = _closed_at_expr()
    if date_from is not None:
        query = query.filter(cast(closed_at, Date) >= date_from)
    if date_to is not None:
        query = query.filter(cast(closed_at, Date) <= date_to)

    total = query.count()
    query = query.order_by(closed_at.desc())
    offset = (page - 1) * page_size
    results = query.offset(offset).limit(page_size).all()

    items = []
    for complaint, vr, field_op_officer, ack_officer in results:
        if complaint.status == "completed":
            items.append(
                LeaClosedCaseListItem(
                    complaint_id=complaint.complaint_id,
                    case_reference=complaint.case_reference,
                    product_title=complaint.product_title,
                    manufacturer=complaint.manufacturer,
                    product_category=complaint.product_category,
                    date_filed=complaint.created_at,
                    date_closed=complaint.field_operation_logged_at,
                    closed_by_name=format_officer_display_name(field_op_officer),
                    reason_closed="completed",
                    reason_detail=complaint.field_operation_notes,
                )
            )
        else:
            is_registered = vr and vr.verification_request_status == "confirmed_registered"
            items.append(
                LeaClosedCaseListItem(
                    complaint_id=complaint.complaint_id,
                    case_reference=complaint.case_reference,
                    product_title=complaint.product_title,
                    manufacturer=complaint.manufacturer,
                    product_category=complaint.product_category,
                    date_filed=complaint.created_at,
                    date_closed=vr.lea_acknowledged_at if vr else None,
                    closed_by_name=format_officer_display_name(ack_officer),
                    reason_closed="registered" if is_registered else "rejected",
                    reason_detail=(vr.response_notes if is_registered else getattr(vr, "rejection_reason", None)) if vr else None,
                )
            )

    return LeaClosedCaseListResponse(items=items, total=total, page=page, page_size=page_size)
    # added by Darlene --end