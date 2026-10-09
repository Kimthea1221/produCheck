# backend/app/desktop/routers/auth/password_reset_request.py
from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session

from app.database.sessions import get_db, set_bypass_rls
from app.core.constants import Role, AuditAction
from app.core.audit import write_audit_log, get_user_region_code, reset_request_retry_after
from app.models.users import User
from app.desktop.schemas.auth.password_reset_request import PasswordResetRequestPayload
from app.desktop.services.admin_notifications import admin_notification_service as notification_service
from app.desktop.schemas.admin_notifications.notification_enums import NotificationEventType
from app.desktop.services.account_status.guards import agency_of

router = APIRouter(prefix="/auth", tags=["password-reset-request"])

AGENCY_ROLE_MAP = {
    "fda": Role.FDA_PERSONNEL,
    "lea": Role.LEA_PERSONNEL,
}

# Always returned, whether or not a matching account was found — this
# endpoint is unauthenticated (called from the login page), so it must
# never reveal via its response whether a given email/agency combination
# corresponds to a real account. See PERSONNEL_REQUEST_PASSWORD_UPDATE
# in profile.py for the equivalent authenticated version of this flow.
GENERIC_RESPONSE = {"message": "If an account matching that information exists, your administrator has been notified."}


@router.post("/request-password-reset")
def request_password_reset_public(
    payload: PasswordResetRequestPayload,
    http_request: Request,
    db: Session = Depends(get_db),
):
    set_bypass_rls(db, True)

    expected_role = AGENCY_ROLE_MAP.get(payload.agency)
    if expected_role is None:
        # Invalid agency value entirely — still return the generic response.
        # No account lookup is even meaningful here, so nothing to log.
        return GENERIC_RESPONSE

    user = (
        db.query(User)
        .filter(User.email == payload.email, User.role == expected_role)
        .first()
    )

    # No matching personnel account for this email+agency: do nothing
    # further, but still return the generic success response so the
    # response itself can't be used to probe which emails are registered.
    if not user:
        return GENERIC_RESPONSE

    if reset_request_retry_after(db, user.user_id) > 0:
        return GENERIC_RESPONSE  # silent: no audit row, no notification
    
    write_audit_log(
        db,
        user=user,
        action=AuditAction.PERSONNEL_REQUEST_PASSWORD_UPDATE,
        target_table="users",
        target_id=user.user_id,
        target_reference=user.email,
        request=http_request,
        region_code=get_user_region_code(db, user),
    )

    agency_admin_role = Role.FDA_ADMIN if user.role == Role.FDA_PERSONNEL else Role.LEA_ADMIN

    notification_service.notify_regional_admin_workspace(
        db=db, agency_admin_role=agency_admin_role, region_id=user.region_id,
        agency=agency_of(user.role),
        event_type=NotificationEventType.PASSWORD_RESET_REQUESTED,
        title="Password reset requested",
        message=f"{user.email} requested a password reset (from login screen).",
        related_user_id=user.user_id,
    )

    return GENERIC_RESPONSE