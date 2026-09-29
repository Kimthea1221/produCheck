# backend/app/models/workspace_location.py
from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey, CheckConstraint, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database.base import Base


class WorkspaceLocation(Base):
    __tablename__ = "workspace_locations"

    workspace_location_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    agency = Column(String(50), nullable=False)

    region_id = Column(
        UUID(as_uuid=True),
        ForeignKey("regions.region_id", ondelete="RESTRICT"),
        nullable=False,
    )

    latitude = Column(Numeric(9, 6), nullable=False)
    longitude = Column(Numeric(9, 6), nullable=False)
    radius_meters = Column(Integer, nullable=False, server_default=text("500"))

    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=func.now())

    __table_args__ = (
        CheckConstraint("agency IN ('FDA', 'LEA-CIDG')", name="ck_workspace_locations_agency"),
        CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="ck_workspace_locations_latitude_range"),
        CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="ck_workspace_locations_longitude_range"),
        CheckConstraint("radius_meters >= 1 AND radius_meters <= 50000", name="ck_workspace_locations_radius_range"),
        UniqueConstraint("agency", "region_id", name="uq_workspace_locations_agency_region"),
    )