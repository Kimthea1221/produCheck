#for FDA View Reports
from sqlalchemy.orm import Session
from app.models.complaints import Complaint
from app.desktop.schemas.complaints.complaints import FdaComplaintListItem
from fastapi import HTTPException
from app.models.shared_files import SharedFile
from app.desktop.schemas.complaints.complaints import SharedFileResponse, FdaComplaintDetailResponse

# ADDED: shared LEA check, so LEA can still open any complaint
from app.desktop.services.account_status.guards import is_lea_user
from app.desktop.services.verification.verification_helpers import get_fda_report_exchange   # ADDED

# services/complaints/fda_reports_service.py — one line change

def list_all_complaints_for_fda(
    db: Session, current_user, search: str | None, category: str | None,
    status: str | None, source: str | None,
) -> list[FdaComplaintListItem]:
    query = db.query(Complaint).filter(
        Complaint.deleted_at.is_(None),
        Complaint.status != "open",   # not yet sent to FDA by LEA, excluded from this report
        Complaint.region_id == current_user.region_id,   # FDA personnel are region-scoped, same as LEA
    )
    if current_user.role != "superadmin" and current_user.region_id:
        query = query.filter(Complaint.region_id == current_user.region_id)

    if source is not None:
        query = query.filter(Complaint.source == source)
    if status is not None:
        query = query.filter(Complaint.status == status)
    if category is not None:
        query = query.filter(Complaint.product_category == category)
    if search is not None:
        query = query.filter(
            Complaint.case_reference.ilike(f"%{search}%")
            | Complaint.product_title.ilike(f"%{search}%")
            | Complaint.manufacturer.ilike(f"%{search}%")
        )

    complaints = query.order_by(Complaint.created_at.desc()).all()

    return [
        FdaComplaintListItem(
            complaint_id=c.complaint_id,
            case_reference=c.case_reference,
            product_title=c.product_title,
            manufacturer=c.manufacturer,
            product_category=c.product_category,
            source=c.source,
            status=c.status,
            created_at=c.created_at,
        )
        for c in complaints
    ]


# services/complaints/fda_reports_service.py — add this function to the same file


def get_fda_complaint_detail(db: Session, complaint_id, current_user) -> FdaComplaintDetailResponse:
    query = db.query(Complaint).filter(
        Complaint.complaint_id == complaint_id,
        Complaint.deleted_at.is_(None),
    )
    if current_user.role != "superadmin" and current_user.region_id:
        query = query.filter(Complaint.region_id == current_user.region_id)
    
    # CHANGED: only walk-in complaints are gated; extension complaints stay exactly as before
    if not is_lea_user(current_user):
        query = query.filter(
            (Complaint.source != "walk_in") | (Complaint.status != "open")
        )
        
    complaint = query.first()

    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    # Description lives on different columns depending on source:
    # nature_of_complaint for walk_in, consumer_description for extension.
    # Only one of the two is ever populated for a given complaint.
    description = complaint.nature_of_complaint or complaint.consumer_description

    files = db.query(SharedFile).filter(
            SharedFile.complaint_id == complaint_id,
            SharedFile.request_id.is_(None),   # ADDED: LEA's original evidence only
        ).all()

    # ADDED: walk-in only; extension complaints keep both fields as None
    verification, lea_followup = (None, None)
    if complaint.source == "walk_in":
        verification, lea_followup = get_fda_report_exchange(db, complaint)
      
    return FdaComplaintDetailResponse(
        complaint_id=complaint.complaint_id,
        case_reference=complaint.case_reference,
        product_title=complaint.product_title,
        manufacturer=complaint.manufacturer,
        product_category=complaint.product_category,
        source=complaint.source,
        status=complaint.status,
        created_at=complaint.created_at,
        description=description,
        attached_files=[SharedFileResponse.model_validate(f) for f in files],
        verification=verification,
        lea_followup=lea_followup,
    )