from uuid import UUID
from datetime import date, datetime

from pydantic import BaseModel, Field, ConfigDict
from enum import Enum

from app.desktop.schemas.drafts.drafts import Priority
from app.desktop.schemas.common import NonEmptyStr
from app.desktop.schemas.complaints.complaints import SharedFileResponse, LeaFdaResponseSummary   # CHANGED: added LeaFdaResponseSummary




# Used ONLY by the direct path (no draft) — officer composes and
# clicks "Send Request to FDA" immediately. The draft-submit path
# never needs this schema, since every field it needs already lives
# on the existing VerificationRequestDraft row.
class VerificationRequestCreate(BaseModel):
    complaint_id: UUID
    product_code: str | None = Field(None, max_length=100)
    priority: Priority
    notes_to_fda: str = Field(..., min_length=10, max_length=2000)


class VerificationRequestResponse(BaseModel):
    request_id: UUID
    complaint_id: UUID
    requested_by: UUID
    product_name: str
    product_code: str | None
    complaint_statement: str
    verification_request_status: str
    priority: str
    requested_at: datetime
    responded_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class VerificationRequestAwaitingFDAResponse(BaseModel):
    request_id: UUID
    complaint_id: UUID
    case_reference: str
    product_name: str
    manufacturer: str | None
    product_category: str | None
    complainant_name: str | None
    source: str
    priority: str
    requested_at: datetime
    has_draft: bool = False        # ADDED: this officer already saved a draft on this request
    draft_id: UUID | None = None   

# ============================================================
# FDA VERIFICATION RESPONSE (real submit — not a draft)
# ============================================================

class FdaVerificationStatusChoice(str, Enum):
    registered = "registered"
    unregistered = "unregistered"


# What the FDA officer's form sends on "Submit Verification." Unlike
# the draft version, this is NOT all-optional — but the required-ness
# depends on which status was chosen (CPR fields for registered,
# unregistered_reason for unregistered), which is conditional logic a
# flat Pydantic schema can't express cleanly. So this stays loose at
# the schema level, and the actual required-field checks happen in
# the service, where we can give a specific, readable error message
# per case instead of a generic Pydantic validation error.
class FdaVerificationSubmitRequest(BaseModel):
    verification_status: FdaVerificationStatusChoice
    cpr_number: str | None = Field(None, max_length=100)
    cpr_expiry: date | None = None
    response_notes: str | None = Field(None, max_length=2000)
    unregistered_reason: str | None = Field(None, max_length=2000)


# Built manually in the router from (VerificationRequest, Complaint)
# — NOT from_attributes=True, since complaint_status doesn't live on
# the VerificationRequest object itself.
class FdaVerificationSubmitResponse(BaseModel):
    request_id: UUID
    verification_request_status: str
    cpr_number: str | None
    cpr_expiry: date | None
    response_notes: str | None
    unregistered_reason: str | None
    responded_by: UUID
    responded_at: datetime
    complaint_id: UUID
    complaint_status: str


class FdaVerificationRejectRequest(BaseModel):
    rejection_reason: NonEmptyStr = Field(..., min_length=10, max_length=2000)


class FdaVerificationRejectResponse(BaseModel):
    request_id: UUID
    verification_request_status: str
    rejection_reason: str
    responded_by: UUID
    responded_at: datetime
    complaint_id: UUID
    complaint_status: str


# Full detail for the right panel — fetched only when an officer
# clicks a specific card in the queue, not included in the lean list
# response. Built manually from a join, not from_attributes=True.
class FdaVerificationRequestDetailResponse(BaseModel):
    request_id: UUID
    case_reference: str
    product_name: str
    manufacturer: str | None
    product_category: str | None
    requested_by_name: str | None
    requested_at: datetime
    product_code: str | None
    priority: str
    complaint_statement: str
    attached_files: list[SharedFileResponse]


# ============================================================
# FDA VERIFICATION QUEUE - COMPLETED TAB
# ============================================================

class FdaVerificationResultChoice(str, Enum):
    registered = "registered"
    unregistered = "unregistered"


class FdaVerificationCompletedListItem(BaseModel):
    request_id: UUID
    case_reference: str
    product_name: str
    manufacturer: str | None
    product_category: str | None
    requested_at: datetime
    responded_at: datetime
    verification_result: FdaVerificationResultChoice
    verified_by_name: str | None


class FdaVerificationCompletedListResponse(BaseModel):
    items: list[FdaVerificationCompletedListItem]
    total: int
    page: int
    page_size: int


class FdaVerificationCompletedDetailResponse(BaseModel):
    request_id: UUID
    case_reference: str
    product_name: str
    manufacturer: str | None
    product_category: str | None
    requested_at: datetime
    requested_by_name: str | None
    verification_result: FdaVerificationResultChoice
    cpr_number: str | None
    cpr_expiry: date | None
    response_notes: str | None
    unregistered_reason: str | None
    verified_by_name: str | None
    responded_at: datetime
    response_files: list[SharedFileResponse] = []   # ADDED: the responding officer's files, same as LEA sees
    product_code: str | None = None                  # ADDED
    reminder_sent_at: datetime | None = None         # ADDED
    attached_files: list[SharedFileResponse] = []    # ADDED: LEA's original evidence


# ============================================================
# FDA VERIFICATION QUEUE - REJECTED TAB
# ============================================================

class FdaVerificationRejectedListItem(BaseModel):
    request_id: UUID
    case_reference: str
    product_name: str
    manufacturer: str | None
    product_category: str | None
    requested_at: datetime
    responded_at: datetime
    rejected_by_name: str | None


class FdaVerificationRejectedListResponse(BaseModel):
    items: list[FdaVerificationRejectedListItem]
    total: int
    page: int
    page_size: int


class FdaVerificationRejectedDetailResponse(BaseModel):
    request_id: UUID
    case_reference: str
    product_name: str
    manufacturer: str | None
    product_category: str | None
    requested_at: datetime
    requested_by_name: str | None
    rejected_by_name: str | None
    responded_at: datetime
    rejection_reason: str
    product_code: str | None = None                  # ADDED
    reminder_sent_at: datetime | None = None         # ADDED
    attached_files: list[SharedFileResponse] = []    # ADDED: LEA's original evidence

# tiny dashboard count fda
class FdaVerificationQueueCounts(BaseModel):
    verification_queue_count: int
    completed_count: int
    rejected_count: int

# LEA-side dashboard counts — status counts on Complaint, not
# VerificationRequest, since these three tabs track what LEA does
# AFTER FDA responds (takedown_requested/initiated/dismissed+completed),
# not the verification request lifecycle itself.
class LeaVerificationQueueCounts(BaseModel):
    fda_response_count: int
    initiated_count: int
    dismissed_count: int
    completed_count: int


# added by Darlene --start
# Result choices for LEA FDA response items
class LeaFdaResponseResultChoice(str, Enum):
    registered = "registered"
    unregistered = "unregistered"
    rejected = "rejected"

# Left panel detail for the LEA FDA response tab 
class LeaFdaResponseListItem(BaseModel):
    request_id: UUID
    complaint_id: UUID
    case_reference: str
    product_name: str
    manufacturer: str | None
    product_category: str | None
    responded_at: datetime
    verification_result: LeaFdaResponseResultChoice

# Right panel detail for the LEA FDA response tab
class LeaFdaResponseDetailResponse(BaseModel):
    request_id: UUID
    complaint_id: UUID
    case_reference: str
    product_title: str
    manufacturer: str | None
    product_category: str | None
    logged_at: datetime
    source: str
    verification_result: LeaFdaResponseResultChoice
    responded_at: datetime
    verifier_name: str | None

    # unregistered
    unregistered_reason: str | None
    response_notes: str | None # this one field serves BOTH registered and unregistered
    field_operation_notes: str | None

    # registered
    cpr_number: str | None
    cpr_expiry: date | None

    # rejected
    rejection_reason: str | None
    # ADDED: FDA Response tab shows the request fields and FDA's own attachments
    product_code: str | None = None
    priority: str | None = None
    notes_to_fda: str | None = None
    response_files: list[SharedFileResponse] = []


# Optional, confirm later if it becomes required.
class LeaInitiateTakedownRequest(BaseModel):
    field_operation_notes: str | None = Field(None, max_length=2000)

class LeaFdaResponseActionResponse(BaseModel):
    request_id: UUID
    complaint_id: UUID
    complaint_status: str
    lea_acknowledged_at: datetime | None

class LeaClosedReasonChoice(str, Enum):
    completed = "completed"
    registered = "registered"
    rejected = "rejected"

class LeaClosedCaseListItem(BaseModel):
    complaint_id: UUID
    case_reference: str
    product_title: str
    manufacturer: str | None
    product_category: str | None
    date_filed: datetime
    date_closed: datetime | None
    closed_by_name: str | None
    reason_closed: LeaClosedReasonChoice
    reason_detail: str | None # reason closed explanation sa loob ng view

class LeaClosedCaseListResponse(BaseModel):
    items: list[LeaClosedCaseListItem]
    total: int
    page: int
    page_size: int
# added by Darlene --end


# ADDED: FDA "LEA Response" tab (lea-follow-up). Stage is derived at query time, never stored.
class LeaFollowUpStage(str, Enum):
    awaiting_lea = "awaiting_lea"
    acknowledged = "acknowledged"
    takedown_initiated = "takedown_initiated"
    closed = "closed"


# Deliberately has NO complainant fields: FDA must never receive them.
class LeaFollowUpListItem(BaseModel):
    request_id: UUID
    case_reference: str
    product_title: str
    product_category: str | None
    manufacturer: str | None
    source: str
    product_code: str | None
    fda_result: LeaFdaResponseResultChoice
    responded_at: datetime
    verified_by_name: str | None
    lea_stage: LeaFollowUpStage
    last_updated_at: datetime
    acknowledged_at: datetime | None
    acknowledged_by_name: str | None
    takedown_initiated_at: datetime | None
    takedown_initiated_by_name: str | None
    field_operation_notes: str | None
    closed_at: datetime | None
    closed_by_name: str | None
    close_reason: str | None
    closing_notes: str | None
    reminder_sent_at: datetime | None
    attached_files: list[SharedFileResponse]   # LEA's original evidence (request_id IS NULL)


class LeaFollowUpListResponse(BaseModel):
    items: list[LeaFollowUpListItem]
    total: int
    page: int
    page_size: int


# ADDED: full final record for the Closed Cases modal. Date/closed-by/closing note stay on the list row.
class LeaClosedCaseDetailResponse(LeaFdaResponseSummary):
    verification_result: LeaFdaResponseResultChoice | None = None
    requested_by_name: str | None = None
    requested_at: datetime | None = None
    cpr_number: str | None = None
    cpr_expiry: date | None = None
    rejection_reason: str | None = None
    rejected_by_name: str | None = None
    lea_acknowledged_at: datetime | None = None
    acknowledged_by_name: str | None = None
    takedown_initiated_at: datetime | None = None
    takedown_initiated_by_name: str | None = None
    field_operation_notes: str | None = None
    attached_files: list[SharedFileResponse] = []