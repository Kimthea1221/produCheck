from uuid import UUID
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, ConfigDict, field_validator
from enum import Enum


# ============================================================
# ENUMS
# These mirror the CHECK constraints in the model files exactly.
# If the database only allows these strings, the schema shouldn't
# allow anything else either — this catches typos before they
# ever reach a SQL query.
# ============================================================

class DraftStatus(str, Enum):
    incomplete = "incomplete"
    draft = "draft"


class IdType(str, Enum):
    philsys = "philsys"
    passport = "passport"
    drivers_license = "drivers_license"
    other = "other"


class Priority(str, Enum):
    standard = "standard"
    high = "high"
    urgent = "urgent"
    critical = "critical"


class DraftType(str, Enum):
    walkin = "walkin"
    verification = "verification"


class SortOption(str, Enum):
    recently_edited = "recently_edited"
    oldest_first = "oldest_first"
    product_name_az = "product_name_az"


# ============================================================
# WALK-IN INTAKE DRAFT
# ============================================================

# What the officer's form sends us when they hit "Save as Draft."
# Every field is optional here on purpose — the officer might save
# a half-filled form. Deciding whether that makes the row
# "incomplete" or "draft" happens later, in the service layer,
# not here.
class WalkinIntakeDraftSave(BaseModel):
    full_name: str | None = Field(None, max_length=100)
    contact_number: str | None = Field(None, max_length=11)
    email: str | None = Field(None, max_length=254)
    id_type: IdType | None = None
    address: str | None = Field(None, max_length=300)

    product_name: str | None = Field(None, max_length=150)
    manufacturer: str | None = Field(None, max_length=150)
    product_category: str | None = Field(None, max_length=150)
    place_of_purchase: str | None = Field(None, max_length=300)
    date_of_purchase: date | None = None
    amount_paid: Decimal | None = None
    nature_of_complaint: str | None = Field(None, max_length=2000)

    # Normalize Windows CRLF (\r\n) → LF (\n) for all multi-line text fields
    # BEFORE Pydantic enforces max_length. The browser sends \r\n in multipart
    # form data, but the HTML maxLength attribute only counts \n — so without
    # this, a 2000-char textarea can arrive as 2050+ chars and fail validation.
    @field_validator("nature_of_complaint", mode="before")
    @classmethod
    def normalize_newlines(cls, v):
        if isinstance(v, str):
            return v.replace('\r\n', '\n').replace('\r', '\n')
        return v

    @field_validator("contact_number")
    @classmethod
    def validate_contact_number(cls, value):
        if value is None:
            return value
        if not value.isdigit():
            raise ValueError("Contact number must contain digits only.")
        if len(value) != 11:
            raise ValueError("Contact number must be exactly 11 digits.")
        return value


# What we send BACK — e.g. when the officer reopens a saved draft,
# or when one row of the Saved Drafts table is returned.
# Inherits every field from WalkinIntakeDraftSave above, then adds
# the columns the officer never types in themselves — the ones the
# database/backend generates or controls.
class WalkinIntakeDraftResponse(WalkinIntakeDraftSave):
    draft_id: UUID
    saved_by: UUID
    region_id: UUID
    draft_status: DraftStatus
    created_at: datetime
    updated_at: datetime

    # Lets this schema read fields off a SQLAlchemy model object
    # (dot access) instead of requiring a plain dict.
    model_config = ConfigDict(from_attributes=True)


# ============================================================
# ATTACHMENTS  (walkin_intake_drafts only — verification request
# drafts have no attachments table of their own, per the schema)
# ============================================================

# Read-only response schema — attachments are created via file
# upload (handled by the endpoint, not by the officer submitting
# JSON), so there's no matching "Save" schema for this one.
class DraftAttachmentResponse(BaseModel):
    attachment_id: UUID
    walkin_draft_id: UUID
    file_name: str
    file_size_bytes: int
    mime_type: str
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Unified row for the "All Drafts" table (Image 1). Built manually
# in the endpoint from a join, not from a single ORM object — so
# this does NOT use from_attributes=True like the others.
class UnifiedDraftResponse(BaseModel):
    draft_id: UUID
    draft_type: DraftType
    product_name: str | None
    manufacturer: str | None
    product_category: str | None
    complainant_name: str | None
    saved_by: UUID
    saved_by_name: str | None   # added this for saved by in the UI
    region_id: UUID
    draft_status: DraftStatus
    created_at: datetime
    updated_at: datetime


# ============================================================
# VERIFICATION REQUEST DRAFT
# ============================================================

# What gets sent when the officer hits "Save Draft" on the
# "Compose verification request to FDA" screen (Image 3).
# NOTE: complaint_id is required here, unlike the officer-typed
# fields below — the draft can't exist without knowing which
# complaint it's attached to (see Image 2, the officer clicks
# INTO a specific walk-in case card first).
class VerificationRequestDraftSave(BaseModel):
    complaint_id: UUID

    product_code: str | None = Field(None, max_length=100)
    priority: Priority | None = None
    notes_to_fda: str | None = Field(None, max_length=2000)

    # Same CRLF normalization as WalkinIntakeDraftSave — browser sends
    # \r\n in multipart but maxLength counts only \n.
    @field_validator("notes_to_fda", mode="before")
    @classmethod
    def normalize_newlines(cls, v):
        if isinstance(v, str):
            return v.replace('\r\n', '\n').replace('\r', '\n')
        return v


# What we send back — reopening a saved draft, or one row in the
# "Verification Request" list. Inherits complaint_id, product_code,
# priority, and notes_to_fda from VerificationRequestDraftSave, then
# adds the backend/database-controlled columns.
class VerificationRequestDraftResponse(VerificationRequestDraftSave):
    draft_id: UUID
    saved_by: UUID
    region_id: UUID
    draft_status: DraftStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class WalkinIntakeDraftDetailResponse(WalkinIntakeDraftResponse):
    attachments: list[DraftAttachmentResponse] = []


# ============================================================
# VERIFICATION CONFIRMATION DRAFT FDA SIDE
# ============================================================

class FdaDraftVerificationStatus(str, Enum):
    registered = "registered"
    unregistered = "unregistered"


# What the officer's form sends on "Save Draft." Every field optional —
# same reasoning as WalkinIntakeDraftSave: a half-filled save is valid,
# and draft_status ('incomplete' vs 'draft') is decided in the endpoint,
# not here.
class FdaVerificationDraftSave(BaseModel):
    draft_verification_status: FdaDraftVerificationStatus | None = None
    draft_cpr_number: str | None = Field(None, max_length=100)
    draft_cpr_expiry: date | None = None
    draft_response_notes: str | None = Field(None, max_length=2000)
    draft_unregistered_reason: str | None = Field(None, max_length=2000)

    # Same CRLF normalization — browser textarea sends \r\n, maxLength counts \n only.
    @field_validator("draft_response_notes", "draft_unregistered_reason", mode="before")
    @classmethod
    def normalize_newlines(cls, v):
        if isinstance(v, str):
            return v.replace('\r\n', '\n').replace('\r', '\n')
        return v


# What we send back for a bare draft row — inherits the officer-typed
# fields, adds the backend-controlled columns.
class FdaVerificationDraftResponse(FdaVerificationDraftSave):
    draft_id: UUID
    saved_by: UUID
    verification_request_id: UUID
    draft_status: DraftStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# One row of the Saved Drafts table (View/Edit/Delete screenshot).
# Built manually from a join in the endpoint, same reasoning as
# UnifiedDraftResponse — NOT from_attributes=True, since this never
# maps 1:1 onto a single ORM object.
class FdaVerificationDraftListItem(BaseModel):
    draft_id: UUID
    verification_request_id: UUID
    case_reference: str
    product_name: str
    manufacturer: str | None
    product_category: str | None
    draft_status: DraftStatus
    updated_at: datetime


# Full detail view — View/Edit Draft buttons land here. Same
# joined-data reasoning as WalkinIntakeDraftDetailResponse, just
# extended with read-only case info instead of attachments.
class FdaVerificationDraftDetailResponse(FdaVerificationDraftResponse):
    case_reference: str
    product_name: str
    manufacturer: str | None
    product_category: str | None
    requested_by_name: str | None
    requested_at: datetime

# Wraps the Saved Drafts list with pagination info, so the frontend
# can render "Showing X-Y of Z drafts" and build Prev/Next controls
# without a second API call just to get the total count.
class FdaVerificationDraftListResponse(BaseModel):
    items: list[FdaVerificationDraftListItem]
    total: int
    page: int
    page_size: int