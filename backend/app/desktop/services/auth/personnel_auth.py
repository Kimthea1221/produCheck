# backend/app/desktop/services/auth/personnel_auth.py
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from app.database.sessions import set_bypass_rls
from app.models.users import User
from app.core.security import verify_password, hash_password
from app.core.constants import Role, AuditAction
from app.core.audit import write_audit_log, get_user_region_code
from app.desktop.services.admin_notifications import admin_notification_service as notification_service
from app.desktop.schemas.admin_notifications.notification_enums import NotificationEventType
from app.desktop.services.auth.login_throttle import ACCOUNT_LOCKED_MESSAGE
from app.desktop.services.auth.login_throttle import (
    LoginThrottledError, LOCK_AFTER_ATTEMPTS, WARN_FROM_ATTEMPTS, THROTTLE_SECONDS,
    attempts_left_message, check_throttle, record_failed_attempt, reset_login_state,
)

AGENCY_ROLE_MAP = {
    "fda": Role.FDA_PERSONNEL,
    "lea": Role.LEA_PERSONNEL,
}

_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing-safety-only")


def authenticate_personnel(
    db: Session,
    email: str,
    password: str,
    agency: str,
    http_request: Request | None = None,
) -> User:
    set_bypass_rls(db, True)
    user = db.query(User).filter(User.email == email).first()

    if not user:
        verify_password(password, _DUMMY_PASSWORD_HASH)  # timing safety
        raise ValueError("Invalid credentials")

    expected_role = AGENCY_ROLE_MAP.get(agency)
    if expected_role is None:
        raise ValueError("Invalid agency selection")

    if user.role != expected_role:
        raise ValueError("Access Denied: Make sure you select the correct agency to sign in.")

    if user.is_locked:
        raise ValueError(ACCOUNT_LOCKED_MESSAGE)

    check_throttle(user)  # before the password check; not counted as an attempt

    if not verify_password(password, user.password_hash):
        _handle_failed_attempt(db, user, http_request)  # always raises

    # Only reveal account state once the password is proven correct
    if user.status != "active":
        raise ValueError("Your account is not yet active. Please contact your administrator.")

    if not user.is_active:
        raise ValueError("Account is suspended.")

    reset_login_state(db, user.user_id)
    return user


def _handle_failed_attempt(db: Session, user: User, http_request: Request | None = None) -> None:
    # Capture everything BEFORE commit (commit expires the ORM object).
    user_id = user.user_id
    user_email = user.email
    user_role = user.role
    region_code = get_user_region_code(db, user)

    attempts = record_failed_attempt(db, user_id)

    if attempts >= LOCK_AFTER_ATTEMPTS:
        user.is_locked = True
        user.locked_until = None   # a lock must never look like a throttle
        db.commit()

        if attempts == LOCK_AFTER_ATTEMPTS:  # side effects once, not per parallel request
            notification_service.notify_self_service_account_event(
                db=db, target=user,
                event_type=NotificationEventType.ACCOUNT_LOCKED,
                title="Account locked out",
                message=f"{user_email} has been locked out after {attempts} failed login attempts.",
            )
            write_audit_log(
                db,
                user=None,
                action=AuditAction.LOCK_PERSONNEL_ACCOUNT,
                target_table="users",
                target_id=user_id,
                target_reference=user_email,
                old_value={"is_locked": False},
                new_value={"is_locked": True, "failed_login_attempts": attempts},
                request=http_request,
                region_code=region_code,
                user_role_override=user_role,
                user_id_override=user_id,
            )
        raise ValueError(ACCOUNT_LOCKED_MESSAGE)

    hint = attempts_left_message(attempts)
    if hint:
        user.locked_until = datetime.now(timezone.utc) + timedelta(seconds=THROTTLE_SECONDS)
        db.commit()

        if attempts == WARN_FROM_ATTEMPTS:
            notification_service.notify_self_service_account_event(
                db=db, target=user,
                event_type=NotificationEventType.FAILED_LOGIN_WARNING,
                title="Repeated failed login attempts",
                message=f"{attempts} failed attempts on {user_email}.",
            )
        raise LoginThrottledError(THROTTLE_SECONDS, f"Invalid email or password. {hint}")

    db.commit()
    raise ValueError("Invalid credentials")