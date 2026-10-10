from sqlalchemy import Column, String, text, Text, Date, DECIMAL, ForeignKey, TIMESTAMP, CheckConstraint, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database.base import Base 


class Complaint(Base):
    __tablename__ = "complaints"

    complaint_id = Column(
        UUID(as_uuid=True), 
        primary_key=True, 
        server_default=text("gen_random_uuid()")
    )
    
    case_reference = Column(String(20), unique=True, nullable=False)

    region_id = Column(
        UUID(as_uuid=True), 
        ForeignKey("regions.region_id", ondelete="RESTRICT"), 
        nullable=False
    )

    source = Column(String(50), nullable=False)
    platform = Column(String(50), nullable=True)
    product_title = Column(Text, nullable=False)
    product_url = Column(Text, nullable=True)
    store_name = Column(String(255), nullable=True)
    attachment_path = Column(Text, nullable=True)
    attachment_name = Column(String(255), nullable=True)
    consumer_description = Column(Text, nullable=True)

    manufacturer = Column(String(255), nullable=True)
    product_category = Column(String(100), nullable=True)
    place_of_purchase = Column(Text, nullable=True)
    date_of_purchase = Column(Date, nullable=True)
    amount_paid = Column(DECIMAL(10, 2), nullable=True)
    nature_of_complaint = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    verification_result = Column(String(50), nullable=True)
    match_score = Column(DECIMAL(5, 4), nullable=True)

    status = Column(String(50), nullable=False, server_default=text("'open'"))

    consumer_id = Column(
        UUID(as_uuid=True), 
        ForeignKey("consumer_account_table.consumer_id", ondelete="SET NULL"), 
        nullable=True
    )

    complainant_id = Column(
        UUID(as_uuid=True), 
        ForeignKey("walkin_complainants.complainant_id", ondelete="SET NULL"), 
        nullable=True
    )

    # field operation notes should be here since it is outside verification and is part of a commplaint 
    field_operation_notes = Column(Text, nullable=True)
    field_operation_logged_at = Column(DateTime(timezone=True), nullable=True)
    field_operation_logged_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    # Who actually logged this complaint — works for BOTH walk-in and
    # extension sources, unlike complainant_id (which only exists for
    # walk-in). nullable=True so this doesn't break any existing rows
    # or any insert code (yours or the extension team's) that hasn't
    # been updated to include it yet.
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    updated_by = Column(
        UUID(as_uuid=True), 
        ForeignKey("users.user_id", ondelete="SET NULL"), 
        nullable=True
    )
    
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)
    deleted_by = Column(
        UUID(as_uuid=True), 
        ForeignKey("users.user_id", ondelete="SET NULL"), 
        nullable=True
    )

    closed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    # ADDED: who closed the takedown case, and the closing note (separate from the takedown note)
    closed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    closing_notes = Column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "source IN ('extension', 'walk_in')",
            name="ck_complaints_source",
        ),
        CheckConstraint(
            "status IN ('open', 'under_review', 'takedown_requested', "
            "'takedown_initiated', 'completed', 'dismissed')",
            name="ck_complaints_status",
        ),
        CheckConstraint(
            "(deleted_at IS NULL AND deleted_by IS NULL) OR "
            "(deleted_at IS NOT NULL AND deleted_by IS NOT NULL)",
            name="ck_complaints_soft_delete_pair",
        ),
    )