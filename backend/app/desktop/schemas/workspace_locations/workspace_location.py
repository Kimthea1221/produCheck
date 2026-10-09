# backend/app/desktop/schemas/workspace_locations/workspace_location.py
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class WorkspaceLocationSaveRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180")
    radius_meters: int = Field(500, ge=1, le=50000, description="Geofence radius in meters between 1 and 50000")

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v: float) -> float:
        if v < -90.0 or v > 90.0:
            raise ValueError("Latitude must be between -90 and 90.")
        return v

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, v: float) -> float:
        if v < -180.0 or v > 180.0:
            raise ValueError("Longitude must be between -180 and 180.")
        return v

    @field_validator("radius_meters")
    @classmethod
    def validate_radius_meters(cls, v: int) -> int:
        if v < 1 or v > 50000:
            raise ValueError("Geofence radius must be between 1 and 50,000 meters.")
        return v


class WorkspaceLocationResponse(BaseModel):
    workspace_location_id: uuid.UUID
    agency: str
    region_id: uuid.UUID
    region: Optional[str] = None
    latitude: float
    longitude: float
    radius_meters: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None

    class Config:
        from_attributes = True
