# backend/app/desktop/services/location/personnel_location_check.py
import math
from datetime import datetime, timezone
from typing import Optional
import uuid
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.core.constants import Role
from app.models.notifications import Notification
from app.models.personnel_location_logs import PersonnelLocationLog
from app.models.regions import Region
from app.models.users import User
from app.models.workspace_locations import WorkspaceLocation
from app.desktop.schemas.admin_notifications.notification_enums import NotificationEventType
from app.desktop.services.account_status.guards import agency_of
from app.desktop.services.admin_notifications import admin_notification_service as notification_service
from app.desktop.services.auth.email import send_location_anomaly_email


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates distance between two coordinates in meters using the Haversine formula."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def format_distance(dist_meters: float) -> str:
    if dist_meters < 1000:
        return f"{int(round(dist_meters))} m"
    return f"{(dist_meters / 1000.0):.1f} km"


def format_login_datetime(dt: datetime) -> str:
    return dt.strftime("%b %d, %Y, %I:%M %p")


def check_and_log_personnel_login_location(
    db: Session,
    user: User,
    session_id: Optional[uuid.UUID],
    latitude: Optional[float],
    longitude: Optional[float],
    source: Optional[str] = "gps",
    background_tasks: Optional[BackgroundTasks] = None,
) -> Optional[PersonnelLocationLog]:
    """Checks personnel login against designated workspace location.
    Logs location and dispatches email and in-app notifications if distance > radius_meters."""
    if latitude is None or longitude is None:
        return None

    if not user.region_id or user.role not in Role.PERSONNEL_ROLES:
        return None

    agency = agency_of(user.role)
    if not agency:
        return None

    workspace = (
        db.query(WorkspaceLocation)
        .filter(
            WorkspaceLocation.agency == agency,
            WorkspaceLocation.region_id == user.region_id,
        )
        .first()
    )

    if not workspace:
        return None

    dist_meters = haversine_distance(
        latitude,
        longitude,
        float(workspace.latitude),
        float(workspace.longitude),
    )

    is_anomaly = dist_meters > float(workspace.radius_meters)
    detection_source = source if source in ("gps", "ip") else "gps"

    log = PersonnelLocationLog(
        personnel_id=user.user_id,
        workspace_location_id=workspace.workspace_location_id,
        session_id=session_id,
        latitude=latitude,
        longitude=longitude,
        distance_meters=int(round(dist_meters)),
        is_anomaly=is_anomaly,
        source=detection_source,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    if is_anomaly:
        region = db.query(Region).filter(Region.region_id == user.region_id).first()
        region_name = region.region_name if region else "Regional Office"
        roman_or_name = region_name.replace("Region ", "").strip() if region else ""

        if agency == "FDA":
            workspace_name = f"FDA-RFO {roman_or_name} office"
        else:
            workspace_name = f"CIDG-RFU {roman_or_name} office"

        personnel_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email
        formatted_dist = format_distance(dist_meters)
        now_str = format_login_datetime(datetime.now(timezone.utc))
        detection_source_label = "device GPS" if detection_source == "gps" else "IP address (approximate)"

        # 1. In-App Notification to Regional Admins
        agency_admin_role = Role.FDA_ADMIN if agency == "FDA" else Role.LEA_ADMIN
        admin_notif_title = f"Location Anomaly Detected — {personnel_name}"
        admin_notif_msg = (
            f"Personnel {personnel_name} ({user.email}) logged in on {now_str} from approximately "
            f"{formatted_dist} away from {workspace_name} (exceeds {workspace.radius_meters}m geofence radius)."
        )

        notification_service.notify_regional_admin_workspace(
            db=db,
            agency_admin_role=agency_admin_role,
            region_id=user.region_id,
            agency=agency,
            event_type=NotificationEventType.LOCATION_ANOMALY_DETECTED,
            title=admin_notif_title,
            message=admin_notif_msg,
            related_user_id=user.user_id,
        )

        # 2. Send Email Alert to all active Regional Admins (Personnel are not notified)
        admins = (
            db.query(User)
            .filter(
                User.role == agency_admin_role,
                User.region_id == user.region_id,
                User.is_active == True,
            )
            .all()
        )

        for admin in admins:
            if admin.email:
                if background_tasks:
                    background_tasks.add_task(
                        send_location_anomaly_email,
                        to_email=admin.email,
                        agency_name=agency,
                        personnel_name=personnel_name,
                        personnel_email=user.email,
                        login_at=now_str,
                        formatted_distance=formatted_dist,
                        workspace_name=workspace_name,
                        radius_meters=workspace.radius_meters,
                        detection_source=detection_source_label,
                        region_name=region_name,
                    )

    return log
