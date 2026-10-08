# backend/app/desktop/services/location/workspace_location_service.py
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log, get_user_region_code
from app.core.constants import AuditAction, Role
from app.models.regions import Region
from app.models.users import User
from app.models.workspace_locations import WorkspaceLocation
from app.models.notifications import Notification
from app.desktop.schemas.workspace_locations.workspace_location import (
    WorkspaceLocationSaveRequest,
    WorkspaceLocationResponse,
)
from app.desktop.services.account_status.guards import agency_of
from app.desktop.services.admin_notifications import admin_notification_service as notification_service
from app.desktop.schemas.admin_notifications.notification_enums import NotificationEventType


def format_user_display_name(user: Optional[User]) -> Optional[str]:
    if not user:
        return None
    if user.first_name and user.last_name:
        return f"{user.first_name[0]}. {user.last_name}"
    if user.first_name:
        return user.first_name
    if user.last_name:
        return user.last_name
    return user.email


def build_workspace_location_response(db: Session, loc: WorkspaceLocation) -> WorkspaceLocationResponse:
    region = db.query(Region).filter(Region.region_id == loc.region_id).first()
    region_name = region.region_name if region else None

    updater = None
    if loc.updated_by:
        updater = db.query(User).filter(User.user_id == loc.updated_by).first()
    elif loc.created_by:
        updater = db.query(User).filter(User.user_id == loc.created_by).first()

    updated_by_name = format_user_display_name(updater)

    return WorkspaceLocationResponse(
        workspace_location_id=loc.workspace_location_id,
        agency=loc.agency,
        region_id=loc.region_id,
        region=region_name,
        latitude=float(loc.latitude),
        longitude=float(loc.longitude),
        radius_meters=loc.radius_meters,
        created_at=loc.created_at,
        updated_at=loc.updated_at or loc.created_at,
        updated_by=updated_by_name,
    )


def get_workspace_location(
    db: Session,
    user: User,
    agency_override: Optional[str] = None,
    region_id_override: Optional[uuid.UUID] = None,
) -> Optional[WorkspaceLocationResponse]:
    target_agency = agency_override or agency_of(user.role)
    target_region_id = region_id_override or user.region_id

    if not target_agency or not target_region_id:
        return None

    loc = (
        db.query(WorkspaceLocation)
        .filter(
            WorkspaceLocation.agency == target_agency,
            WorkspaceLocation.region_id == target_region_id,
        )
        .first()
    )

    if not loc:
        return None

    return build_workspace_location_response(db, loc)


def save_workspace_location(
    db: Session,
    user: User,
    payload: WorkspaceLocationSaveRequest,
    http_request: Request,
) -> WorkspaceLocationResponse:
    if user.role not in Role.ADMIN_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only regional administrators can configure workspace location.",
        )

    agency = agency_of(user.role)
    if not agency:
        raise HTTPException(
            status_code=400,
            detail="User role is not associated with a recognized agency.",
        )

    if not user.region_id:
        raise HTTPException(
            status_code=400,
            detail="Administrator does not have an assigned region.",
        )

    if payload.latitude < -90.0 or payload.latitude > 90.0:
        raise HTTPException(
            status_code=400,
            detail="Latitude must be between -90 and 90.",
        )

    if payload.longitude < -180.0 or payload.longitude > 180.0:
        raise HTTPException(
            status_code=400,
            detail="Longitude must be between -180 and 180.",
        )

    if payload.radius_meters < 1 or payload.radius_meters > 50000:
        raise HTTPException(
            status_code=400,
            detail="Geofence radius must be between 1 and 50,000 meters.",
        )

    region = db.query(Region).filter(Region.region_id == user.region_id).first()
    region_name = region.region_name if region else "Unknown Region"

    loc = (
        db.query(WorkspaceLocation)
        .filter(
            WorkspaceLocation.agency == agency,
            WorkspaceLocation.region_id == user.region_id,
        )
        .first()
    )

    now = datetime.now(timezone.utc)

    if loc:
        old_value = {
            "latitude": float(loc.latitude),
            "longitude": float(loc.longitude),
            "radius_meters": loc.radius_meters,
        }
        loc.latitude = payload.latitude
        loc.longitude = payload.longitude
        loc.radius_meters = payload.radius_meters
        loc.updated_by = user.user_id
        loc.updated_at = now
    else:
        old_value = None
        loc = WorkspaceLocation(
            agency=agency,
            region_id=user.region_id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            radius_meters=payload.radius_meters,
            created_by=user.user_id,
            updated_by=user.user_id,
            created_at=now,
            updated_at=now,
        )
        db.add(loc)

    db.commit()
    db.refresh(loc)

    new_value = {
        "latitude": float(loc.latitude),
        "longitude": float(loc.longitude),
        "radius_meters": loc.radius_meters,
    }

    target_ref = f"{agency} {region_name} Office"

    write_audit_log(
        db,
        user=user,
        action=AuditAction.UPDATE_WORKSPACE_LOCATION,
        target_table="workspace_locations",
        target_id=loc.workspace_location_id,
        target_reference=target_ref,
        old_value=old_value,
        new_value=new_value,
        request=http_request,
        region_code=get_user_region_code(db, user),
    )

    actor_display_name = format_user_display_name(user) or user.email

    # 1. Notify all co-admins in this regional workspace
    notification_service.notify_regional_admin_workspace(
        db=db,
        agency_admin_role=user.role,
        region_id=user.region_id,
        agency=agency,
        event_type=NotificationEventType.WORKSPACE_LOCATION_UPDATED,
        title="Workspace location updated",
        message=f"{actor_display_name} updated the workspace office coordinates and geofence radius for {region_name}.",
        related_user_id=user.user_id,
    )

    return build_workspace_location_response(db, loc)
