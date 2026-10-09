from uuid import UUID
from datetime import date, datetime
from decimal import Decimal

from app.desktop.schemas.drafts.drafts import DraftStatus, Priority


from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.core.formatting import format_file_size


class ComplaintResponse(BaseModel):
    complaint_id: UUID
    case_reference: str
    region_id: UUID
    source: str
    product_title: str
    manufacturer: str | None
    product_category: str | None
    place_of_purchase: str | None
    date_of_purchase: date | None
    amount_paid: Decimal | None
    nature_of_complaint: str | None
    status: str
    complainant_id: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ComplaintAwaitingRequestResponse(BaseModel):
    complaint_id: UUID
    case_reference: str
    product_title: str
    manufacturer: str | None
    product_category: str | None
    source: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================
# VERIFICATION REQUEST
# ============================================================

class SharedFileResponse(BaseModel):
    file_id: UUID
    file_name: str
    file_size_bytes: int
    mime_type: str
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def file_size_display(self) -> str:
        return format_file_size(self.file_size_bytes)


# The joined, read-only display data for the "Compose verification
# request" screen — case info, product info, complainant, and the
# auto-attached files list. Used alone when an officer clicks a
# complaint directly (no draft yet), and nested inside
# VerificationRequestDraftDetailResponse when reopening an existing
# draft. Built manually from a join, so no from_attributes here.
class ComplaintVerificationDetailResponse(BaseModel):
    complaint_id: UUID
    case_reference: str
    product_title: str
    manufacturer: str | None
    product_category: str | None
    complainant_name: str | None
    created_at: datetime
    source: str
    attached_files: list[SharedFileResponse]


# Reopening an existing verification draft. Nests the read-only
# complaint detail above under `complaint`, alongside the draft's
# own editable fields — keeps "read-only" and "editable" visually
# separate, and avoids field-name collisions (both a complaint and
# a draft have their own created_at).
class VerificationRequestDraftDetailResponse(BaseModel):
    draft_id: UUID
    draft_status: DraftStatus
    product_code: str | None
    priority: Priority | None
    notes_to_fda: str | None
    saved_by: UUID
    region_id: UUID
    created_at: datetime
    updated_at: datetime
    complaint: ComplaintVerificationDetailResponse


# I added this (Ashanti) starting here
class WalkinComplaintListResponse(BaseModel):
    complaint_id: UUID
    case_reference: str
    product_title: str
    manufacturer: str | None
    product_category: str | None
    complainant_name: str | None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)



class WalkinComplaintDetailResponse(WalkinComplaintListResponse):
    nature_of_complaint: str | None
    place_of_purchase: str | None
    date_of_purchase: date | None
    amount_paid: Decimal | None
    full_name: str | None
    contact_number: str | None
    email: str | None
    id_type: str | None
    address: str | None
    attached_files: list[SharedFileResponse]

#Ashanti code ends here

# added by Darlene --start
class LeaInitiatedCaseListItem(BaseModel):
    complaint_id: UUID
    case_reference: str
    product_title: str
    manufacturer: str | None
    product_category: str | None
    field_operation_logged_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class LeaInitiatedCaseDetailResponse(BaseModel):
    complaint_id: UUID
    case_reference: str
    product_title: str
    manufacturer: str | None
    complainant_name: str | None
    product_category: str | None
    logged_at: datetime
    source: str
    field_operation_notes: str | None


class LeaCloseCaseRequest(BaseModel):
    field_operation_notes: str | None = Field(None, max_length=2000)


class LeaCloseCaseResponse(BaseModel):
    complaint_id: UUID
    complaint_status: str
    field_operation_notes: str | None
    field_operation_logged_at: datetime | None
# added by Darlene --end

#Ashanti code starts here in FDA View Reports:

class FdaComplaintListItem(BaseModel):
    complaint_id: UUID
    case_reference: str
    product_title: str
    manufacturer: str | None
    product_category: str | None
    source: str
    status: str
    created_at: datetime

# desktop/schemas/complaints/complaints.py — add
class FdaComplaintDetailResponse(BaseModel):
    complaint_id: UUID
    case_reference: str
    product_title: str
    manufacturer: str | None
    product_category: str | None
    source: str
    status: str
    created_at: datetime
    description: str | None
    attached_files: list[SharedFileResponse]

# fda-status description schema
class StatusUpdateRequest(BaseModel):
    status: str
    change_note: str | None = Field(default=None, max_length=500)