# backend/app/desktop/routers/profile_setting/profile.py
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from fastapi import Request
from app.core.audit import write_audit_log, get_user_region_code, reset_request_retry_after
from app.core.constants import AuditAction, Role

from app.database.sessions import get_db
from app.models.user_sessions import UserSession
from app.models.users import User
from app.models.regions import Region
from app.desktop.schemas.profile_setting.profile import (
    ProfileResponse,
    ProfileUpdateRequest,
    ChangePasswordRequest,
)
from app.core.dependencies import get_current_user
from app.core.security import hash_password, verify_password
from app.desktop.services.admin_notifications import admin_notification_service as notification_service
from app.desktop.schemas.admin_notifications.notification_enums import NotificationEventType

from app.desktop.services.account_status.guards import agency_of

router = APIRouter(prefix="/profile", tags=["profile"])

AGENCY_LABELS = {
    "fda_personnel": "FDA",
    "lea_personnel": "LEA-CIDG",
    "fda_admin": "FDA",
    "lea_admin": "LEA-CIDG",
    Role.NATIONAL_ADMIN: "NATIONAL ADMIN",
}

# Field-level self-edit permissions per role tier.
# - National Admin: name only (they only have name + email to begin with).
# - Admin (fda/lea): same broad set personnel used to have.
# - Personnel: none — read only, editable only by an admin via user management.
NATIONAL_ADMIN_EDITABLE_FIELDS = {"first_name", "middle_name", "last_name"}
ADMIN_EDITABLE_FIELDS = {
    "first_name", "middle_name", "last_name",
    "employee_id", "contact_number", "department", "position",
}
PERSONNEL_EDITABLE_FIELDS: set[str] = set()
PH_MOBILE_REGEX = re.compile(r"^09\d{9}$")
# Every editable field is required EXCEPT middle_name.
OPTIONAL_FIELDS = {"middle_name"}


def _editable_fields_for(role: str) -> set[str]:
    if role == Role.NATIONAL_ADMIN:
        return NATIONAL_ADMIN_EDITABLE_FIELDS
    if role in Role.ADMIN_ROLES:
        return ADMIN_EDITABLE_FIELDS
    return PERSONNEL_EDITABLE_FIELDS  # personnel: read only


def build_profile_response(db: Session, user: User) -> ProfileResponse:
    region_name = None
    if user.region_id:
        region = db.query(Region).filter(Region.region_id == user.region_id).first()
        region_name = region.region_name if region else None

    return ProfileResponse(
        user_id=user.user_id,
        first_name=user.first_name,
        middle_name=user.middle_name,
        last_name=user.last_name,
        employee_id=user.employee_id,
        email=user.email,
        contact_number=user.contact_number,
        department=user.department,
        position=user.position,
        role=user.role,
        agency=AGENCY_LABELS.get(user.role, user.role),
        region=region_name,
    )


@router.get("", response_model=ProfileResponse)
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_profile_response(db, current_user)


@router.put("/update", response_model=ProfileResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    update_data = payload.model_dump(exclude_unset=True)

    if current_user.role in Role.PERSONNEL_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Your account information can only be edited by an administrator.",
        )

    allowed_fields = _editable_fields_for(current_user.role)
    disallowed = set(update_data.keys()) - allowed_fields
    if disallowed:
        raise HTTPException(
            status_code=403,
            detail=f"You are not permitted to update: {', '.join(sorted(disallowed))}",
        )

    for field, value in list(update_data.items()):
        if field in OPTIONAL_FIELDS:
            update_data[field] = value.strip() if value and value.strip() else None
            continue

        stripped = value.strip() if isinstance(value, str) else value
        if not stripped:
            raise HTTPException(
                status_code=400,
                detail=f"{field.replace('_', ' ').title()} is required and cannot be blank.",
            )
        update_data[field] = stripped

    if "contact_number" in update_data and not PH_MOBILE_REGEX.match(update_data["contact_number"]):
        raise HTTPException(
            status_code=400,
            detail="Contact number must be exactly 11 digits and start with 09.",
        )

    if "employee_id" in update_data:
        existing = (
            db.query(User)
            .filter(
                User.employee_id == update_data["employee_id"],
                User.user_id != current_user.user_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="This Employee ID is already in use.")

    old_data = {field: getattr(current_user, field, None) for field in update_data}

    for field, value in update_data.items():
        setattr(current_user, field, value)

    db.commit()
    db.refresh(current_user)

    # ...unchanged notification + audit log code below...

    if update_data:
        notification_service.notify_self_service_account_event(
            db=db, target=current_user,
            event_type=NotificationEventType.ACCOUNT_INFO_UPDATED,
            title="Profile information updated",
            message=f"{current_user.email} updated their profile information.",
        )

        profile_action = (
            AuditAction.UPDATE_NATIONAL_ADMIN_INFORMATION
            if current_user.role == Role.NATIONAL_ADMIN
            else AuditAction.UPDATE_REGIONAL_ADMIN_INFORMATION
        )

        write_audit_log(
            db,
            user=current_user,
            action=profile_action,
            target_table="users",
            target_id=current_user.user_id,
            target_reference=f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or current_user.email,
            old_value=old_data,
            new_value=update_data,
            request=http_request,
            region_code=get_user_region_code(db, current_user),
        )

    return build_profile_response(db, current_user)


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in Role.PERSONNEL_ROLES:
        # Personnel no longer self-service their password — an admin
        # triggers Reset from user management instead (temp password +
        # force_password_change).
        raise HTTPException(
            status_code=403,
            detail="Password changes for your account are handled by an administrator.",
        )

    if not current_user.password_hash or not verify_password(
        payload.current_password, current_user.password_hash
    ):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    current_user.password_hash = hash_password(payload.new_password)
    current_user.force_password_change = False
    db.query(UserSession).filter(UserSession.user_id == current_user.user_id).update(
        {"is_revoked": True}
    )
    db.commit()

    notification_service.notify_self_service_account_event(
        db=db, target=current_user,
        event_type=NotificationEventType.PASSWORD_CHANGED,
        title="Password changed",
        message=f"{current_user.email} changed their password.",
    )

    password_action = (
        AuditAction.UPDATE_NATIONAL_ADMIN_PASSWORD
        if current_user.role == Role.NATIONAL_ADMIN
        else AuditAction.UPDATE_REGIONAL_ADMIN_PASSWORD
    )

    write_audit_log(
        db,
        user=current_user,
        action=password_action,
        target_table="users",
        target_id=current_user.user_id,
        target_reference=current_user.email,
        request=http_request,
        region_code=get_user_region_code(db, current_user),
    )

    return {"message": "Password updated successfully"}


@router.post("/request-password-reset")
def request_password_reset(
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Personnel-only: 'Notify Administrator to Reset Password' button on the
    profile page. Personnel can't self-service a password change (see
    change_password above) — this just raises a flag for their agency admin
    to act on via personnel_management's existing reset-password endpoint.

    NOTE: notification targeting (who actually gets notified) is being wired
    in separately — this only handles the audit trail and the endpoint
    contract the frontend button calls. No is_locked/is_active gating here;
    if a personnel account can authenticate at all, it can ask for this.
    """
    if current_user.role not in Role.PERSONNEL_ROLES:
        raise HTTPException(
            status_code=403,
            detail="This action is only available to personnel accounts.",
        )

    retry_after = reset_request_retry_after(db, current_user.user_id)
    if retry_after > 0:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "You already sent a request recently. Please wait before trying again.",
                "retry_after_seconds": retry_after,
            },
        )

    write_audit_log(
        db,
        user=current_user,
        action=AuditAction.PERSONNEL_REQUEST_PASSWORD_UPDATE,
        target_table="users",
        target_id=current_user.user_id,
        target_reference=current_user.email,
        request=http_request,
        region_code=get_user_region_code(db, current_user),
    )

    agency_admin_role = Role.FDA_ADMIN if current_user.role == Role.FDA_PERSONNEL else Role.LEA_ADMIN

    notification_service.notify_regional_admin_workspace(
        db=db, agency_admin_role=agency_admin_role, region_id=current_user.region_id,
        agency=agency_of(current_user.role),
        event_type=NotificationEventType.PASSWORD_RESET_REQUESTED,
        title="Password reset requested",
        message=f"{current_user.email} requested a password reset.",
        related_user_id=current_user.user_id,
    )

    return {"message": "Your request has been sent to the administrator."}