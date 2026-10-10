from sqlalchemy import Column, String, Text, Boolean, BigInteger, DateTime, ForeignKey, CheckConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database.base import Base


class SharedFile(Base):
    __tablename__ = "shared_files"

    file_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    complaint_id = Column(
        UUID(as_uuid=True),
        ForeignKey("complaints.complaint_id", ondelete="SET NULL"),
        nullable=True,
    )
    region_id = Column(
        UUID(as_uuid=True),
        ForeignKey("regions.region_id", ondelete="RESTRICT"),
        nullable=True,
    )
    uploaded_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=False,
    )
    recipient_agency = Column(String(100), nullable=True)

    # Optional, not yet decided (per implementation note) — only add if a
    # single complaint can realistically go through more than one
    # verification request cycle in your test scope:
    # request_id = Column(UUID(as_uuid=True), ForeignKey("verification_requests.request_id", ondelete="SET NULL"), nullable=True)

    request_id = Column(
        UUID(as_uuid=True),
        ForeignKey("verification_requests.request_id", ondelete="CASCADE"),  # CHANGED: was SET NULL
        nullable=True,
    )

    file_name = Column(String(255), nullable=False)
    file_path = Column(Text, nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)

    # shared_file_message intentionally removed per team decision — see
    # implementation note (was in an earlier draft of this table).

    is_read = Column(Boolean, nullable=False, server_default=text("false"))

    uploaded_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "complaint_id IS NOT NULL OR recipient_agency IS NOT NULL",
            name="ck_shared_files_target_present",
        ),
        CheckConstraint(
            "complaint_id IS NOT NULL OR region_id IS NOT NULL",
            name="ck_shared_files_region_present",
        ),
        CheckConstraint(
            "recipient_agency IS NULL OR recipient_agency IN ('fda', 'lea')",
            name="ck_shared_files_recipient_agency",
        ),
    )