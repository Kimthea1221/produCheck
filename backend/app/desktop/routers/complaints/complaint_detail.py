# backend/app/desktop/routers/complaints/complaint_detail.py
from uuid import UUID
from datetime import datetime, timedelta, timezone, date
from typing import List
from pydantic import BaseModel

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session

from app.database.sessions import get_db
from app.core.dependencies import get_current_user
from app.desktop.schemas.complaints.complaints import ComplaintVerificationDetailResponse
from app.desktop.services.complaints.complaint_detail_service import get_complaint_verification_detail
# ADDED: shared LEA-only helpers and the Role constants
from app.desktop.services.account_status.guards import assert_lea_user, is_lea_user
from app.core.constants import Role

from app.desktop.schemas.complaints.complaints import FdaComplaintListItem
from app.desktop.services.complaints.fda_reports_service import list_all_complaints_for_fda
from app.desktop.schemas.complaints.complaints import FdaComplaintDetailResponse
from app.desktop.services.complaints.fda_reports_service import (
    list_all_complaints_for_fda,
    get_fda_complaint_detail,
)

from app.models.verification_requests import VerificationRequest
from app.desktop.schemas.complaints.complaints import ComplaintAwaitingRequestResponse
from app.models.complaints import Complaint
from app.models.walkin_complainants import WalkinComplainant
from app.core.complaint_status import transition_complaint_status
from app.models.shared_files import SharedFile

from app.desktop.schemas.complaints.complaints import (
    SharedFileResponse,
    WalkinComplaintDetailResponse,
    LeaInitiatedCaseListItem,
    LeaInitiatedCaseDetailResponse,
    LeaCloseCaseRequest,
    LeaCloseCaseResponse,
)
from app.desktop.services.verification.verification_helpers import get_latest_verification_request, get_walkin_verification, get_walkin_effective_status   # CHANGED
from app.desktop.services.complaints.lea_initiated_cases import (
    list_lea_initiated_cases,
    get_lea_initiated_case_detail,
    close_case,
)

router = APIRouter(prefix="/complaints", tags=["Complaint Detail"])


# Response schema for list of complaints on the dashboard/tabs
class ComplaintListItemResponse(BaseModel):
    complaint_id: UUID
    case_reference: str
    product_title: str
    manufacturer: str | None
    product_category: str | None
    source: str
    status: str
    complainant_name: str | None
    created_at: datetime
    notes: str | None

class ComplaintTransitionRequest(BaseModel):
    new_status: str
    notes: str | None = None

class DashboardTrendsResponse(BaseModel):
    intake_data: list[int]
    forwarded_data: list[int]
    pipeline_data: list[dict]


# GET /complaints/trends
@router.get("/trends", response_model=DashboardTrendsResponse)
def get_dashboard_trends(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    assert_lea_user(current_user)   # ADDED

    now = datetime.now(timezone.utc)
    start_of_year = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    
    # 1. Intake trend (walk-ins created this year)
    complaints = db.query(Complaint).filter(
        Complaint.region_id == current_user.region_id,
        Complaint.source == "walk_in",
        Complaint.created_at >= start_of_year,
        Complaint.deleted_at.is_(None)
    ).all()
    
    intake_trend = [0] * 12
    for c in complaints:
        m = c.created_at.month - 1
        intake_trend[m] += 1
        
    # 2. Forwarded trend (requests sent this year)
    requests = db.query(VerificationRequest).join(Complaint).filter(
        Complaint.region_id == current_user.region_id,
        Complaint.source == "walk_in",   # ADDED
        VerificationRequest.requested_at >= start_of_year
    ).all()
    
    forwarded_trend = [0] * 12
    for r in requests:
        m = r.requested_at.month - 1
        forwarded_trend[m] += 1
        
    # 3. Monthly pipeline data (last 4 months)
    pipeline_trend = []
    for i in range(3, -1, -1):
        target_year = now.year
        target_month = now.month - i
        while target_month <= 0:
            target_month += 12
            target_year -= 1
            
        month_start = datetime(target_year, target_month, 1, tzinfo=timezone.utc)
        if target_month == 12:
            next_month_start = datetime(target_year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            next_month_start = datetime(target_year, target_month + 1, 1, tzinfo=timezone.utc)
            
        label = month_start.strftime("%b")
        
        ops_count = db.query(Complaint).filter(
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",   # ADDED
            Complaint.status.in_(["takedown_requested", "takedown_initiated", "completed"]),
            Complaint.created_at >= month_start,
            Complaint.created_at < next_month_start,
            Complaint.deleted_at.is_(None)
        ).count()
        
        takedowns_count = db.query(Complaint).filter(
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",   # ADDED
            Complaint.status == "dismissed",
            Complaint.created_at >= month_start,
            Complaint.created_at < next_month_start,
            Complaint.deleted_at.is_(None)
        ).count()
        
        pipeline_trend.append({
            "label": label,
            "ops": ops_count,
            "takedowns": takedowns_count
        })
        
    return DashboardTrendsResponse(
        intake_data=intake_trend,
        forwarded_data=forwarded_trend,
        pipeline_data=pipeline_trend
    )


# GET /complaints/
@router.get("", response_model=list[ComplaintListItemResponse])
def list_complaints(
    status: List[str] = Query(None),
    source: str | None = Query(None),
    search: str | None = Query(None, max_length=150),
    category: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    query = db.query(Complaint, WalkinComplainant).outerjoin(
        WalkinComplainant, Complaint.complainant_id == WalkinComplainant.complainant_id
    ).filter(
        Complaint.region_id == current_user.region_id,
        Complaint.deleted_at.is_(None)
    )

    is_lea = is_lea_user(current_user)   # CHANGED: moved up from below
    if is_lea:
        query = query.filter(Complaint.source == "walk_in")   # ADDED: LEA never sees extension complaints, whatever ?source= says
    
    if status:
        query = query.filter(Complaint.status.in_(status))
    if source:
        query = query.filter(Complaint.source == source)
    if category:
        query = query.filter(Complaint.product_category == category)
    if search:
        query = query.filter(
            Complaint.case_reference.ilike(f"%{search}%")
            | Complaint.product_title.ilike(f"%{search}%")
            | Complaint.manufacturer.ilike(f"%{search}%")
        )
        
    results = query.order_by(Complaint.created_at.desc()).all()

    return [
        ComplaintListItemResponse(
            complaint_id=c.complaint_id,
            case_reference=c.case_reference,
            product_title=c.product_title,
            manufacturer=c.manufacturer,
            product_category=c.product_category,
            source=c.source,
            status=c.status,
            complainant_name=wc.full_name if (wc and is_lea) else None,  # CHANGED: citizen name is LEA-only
            created_at=c.created_at,
            notes=c.notes
        )
        for c, wc in results
    ]


# POST /complaints/{complaint_id}/transition
@router.post("/{complaint_id}/transition")
def transition_complaint(
    complaint_id: UUID,
    data: ComplaintTransitionRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    complaint = db.query(Complaint).filter(
        Complaint.complaint_id == complaint_id,
        Complaint.region_id == current_user.region_id
    ).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    
    transition_complaint_status(complaint, data.new_status)
    if data.notes is not None:
        complaint.notes = data.notes
    db.commit()
    return {"message": f"Complaint status transitioned to {data.new_status}."}


# GET /complaints/{complaint_id}/verification-detail
@router.get("/{complaint_id}/verification-detail", response_model=ComplaintVerificationDetailResponse)
def get_complaint_detail_for_verification(
    complaint_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return get_complaint_verification_detail(db, complaint_id, current_user.region_id)


# GET /complaints/awaiting-verification-request
@router.get("/awaiting-verification-request", response_model=list[ComplaintAwaitingRequestResponse])
def list_complaints_awaiting_request(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    
    #complaint_ids_with_requests = db.query(VerificationRequest.complaint_id).subquery() initial code before adding recall and resend reminder
    complaint_ids_with_requests = db.query(VerificationRequest.complaint_id).filter(
        VerificationRequest.verification_request_status == "pending"
    ).subquery()


    complaints = db.query(Complaint).filter(
    Complaint.complaint_id.notin_(complaint_ids_with_requests),
    Complaint.status == "open",
    Complaint.region_id == current_user.region_id,
    Complaint.deleted_at.is_(None),   # ADD — exclude soft-deleted complaints
    Complaint.source == "walk_in", # ADDED — this list is walk-in only; without this filter, browser-extension complaints with status "open" also show up here
    ).order_by(Complaint.created_at.desc()).all()

    return complaints

    #
    #Ashanti code starts here
    # GET /complaints/{complaint_id}/walkin-detail
@router.get("/{complaint_id}/walkin-detail", response_model=WalkinComplaintDetailResponse)
def get_walkin_complaint_detail(
    complaint_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED: before any query, so FDA can't probe which IDs exist

    complaint = db.query(Complaint).filter(
    Complaint.complaint_id == complaint_id,
    Complaint.region_id == current_user.region_id,
    Complaint.source == "walk_in",
    Complaint.deleted_at.is_(None), #added
    ).first()

    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    complainant = None
    if complaint.complainant_id:
        complainant = db.query(WalkinComplainant).filter(
            WalkinComplainant.complainant_id == complaint.complainant_id
        ).first()

    files = db.query(SharedFile).filter(
            SharedFile.complaint_id == complaint_id,
            SharedFile.request_id.is_(None),   # ADDED: LEA's original evidence only; FDA response files have a request_id
        ).all()
    # Same precedence as the list endpoint: complaint.status is the
    # source of truth. "open" always means queued/Ready to Send,
    # regardless of any recalled/rejected request sitting in history.
    # Only fall back to the latest request's status when the complaint
    # itself is not open (i.e. a request is genuinely active or FDA
    # has responded).
    latest_request = get_latest_verification_request(db, complaint_id)
    effective_status = get_walkin_effective_status(complaint, latest_request)   # CHANGED: shared with the walk-in list

    return WalkinComplaintDetailResponse(
        complaint_id=complaint.complaint_id,
        case_reference=complaint.case_reference,
        product_title=complaint.product_title,
        manufacturer=complaint.manufacturer,
        product_category=complaint.product_category,
        complainant_name=complainant.full_name if complainant else None,
        status=effective_status,
        created_at=complaint.created_at,
        nature_of_complaint=complaint.nature_of_complaint,
        place_of_purchase=complaint.place_of_purchase,
        date_of_purchase=complaint.date_of_purchase,
        amount_paid=complaint.amount_paid,
        full_name=complainant.full_name if complainant else None,
        contact_number=complainant.contact_number if complainant else None,
        email=complainant.email if complainant else None,
        id_type=complainant.id_type if complainant else None,
        address=complainant.address if complainant else None,
        attached_files=[SharedFileResponse.model_validate(f) for f in files],
        verification=get_walkin_verification(db, complaint),   # ADDED
    )
#Ashanti code ends here


# added by darlene --start
# ============================================================
# LEA INITIATED CASES TAB
# ============================================================


    #
    #
    #
    #
    #
    #
    # GET /complaints/initiated
@router.get("/initiated", response_model=list[LeaInitiatedCaseListItem])
def list_initiated_cases_endpoint(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return list_lea_initiated_cases(db, current_user)


    #
    #
    #
    #
    #
    #
    # GET /complaints/initiated/{complaint_id}
@router.get("/initiated/{complaint_id}", response_model=LeaInitiatedCaseDetailResponse)
def get_initiated_case_detail_endpoint(
    complaint_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_lea_user(current_user)  # ADDED
    return get_lea_initiated_case_detail(db, complaint_id, current_user)


    #
    #
    #
    #
    #
    #
    # POST /complaints/{complaint_id}/close-case
@router.post("/{complaint_id}/close-case", response_model=LeaCloseCaseResponse)
def close_case_endpoint(
    complaint_id: UUID,
    data: LeaCloseCaseRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # ADDED: same rule as initiate-takedown, whoever can start a takedown can close it
    if current_user.role != Role.LEA_PERSONNEL:
        raise HTTPException(status_code=403, detail="Only LEA personnel can close a case.")
    return close_case(db, complaint_id, current_user, data, http_request)
#added by darlene --end 


    #
    #Ashanti code starts here
    # GET /complaints/fda-reports
@router.get("/fda-reports", response_model=list[FdaComplaintListItem])
def list_fda_reports_endpoint(
    search: str | None = Query(None, max_length=150),
    category: str | None = None,
    status: str | None = None,
    source: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return list_all_complaints_for_fda(db, current_user, search, category, status, source)



    # GET /complaints/{complaint_id}/fda-detail
@router.get("/{complaint_id}/fda-detail", response_model=FdaComplaintDetailResponse)
def get_fda_complaint_detail_endpoint(
    complaint_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_fda_complaint_detail(db, complaint_id, current_user)

#Ashanti code ends here