# backend/app/desktop/services/auth/admin_auth.py
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

from fastapi import Request
from app.models.users import User
from app.core.security import verify_password, hash_password
from app.core.constants import Role, UserStatus, AuditAction
from app.core.audit import write_audit_log, get_user_region_code
from app.desktop.services.admin_notifications import admin_notification_service as notification_service
from app.desktop.schemas.admin_notifications.notification_enums import NotificationEventType
from app.desktop.services.auth.login_throttle import (
    LoginThrottledError, LOCK_AFTER_ATTEMPTS, WARN_FROM_ATTEMPTS, THROTTLE_SECONDS,
    ACCOUNT_LOCKED_MESSAGE,
    attempts_left_message, check_throttle, record_failed_attempt, reset_login_state,
)


_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing-safety-only")

AGENCY_ROLE_MAP = {
    "fda": Role.FDA_ADMIN,
    "lea": Role.LEA_ADMIN,
}


def authenticate_admin(db, email, password, agency, http_request=None) -> User:
    user = db.query(User).filter(User.email == email).first()

    expected_role = AGENCY_ROLE_MAP.get(agency)
    if expected_role is None:
        raise ValueError("Invalid agency selection")

    if not user or user.role != expected_role:
        verify_password(password, user.password_hash if user else _DUMMY_PASSWORD_HASH)
        raise ValueError("Access Denied: Make sure you select the correct agency to sign in.")

    if user.is_locked:
        raise ValueError(ACCOUNT_LOCKED_MESSAGE)

    check_throttle(user)  # before the password check; not counted

    if not verify_password(password, user.password_hash):
        _handle_failed_attempt(db, user, http_request)  # always raises

    if user.status == UserStatus.PENDING_APPROVAL:
        raise ValueError("Your account is awaiting activation from a National Admin or a fellow Admin.")

    if not user.is_active:
        raise ValueError("Account is suspended. Please contact your administrator.")

    reset_login_state(db, user.user_id)
    return user


def _handle_failed_attempt(db, user, http_request=None) -> None:
    user_id = user.user_id
    user_email = user.email
    user_role = user.role
    region_code = get_user_region_code(db, user)

    attempts = record_failed_attempt(db, user_id)

    if attempts >= LOCK_AFTER_ATTEMPTS:
        user.is_locked = True
        user.locked_until = None   # a lock must never look like a throttle
        db.commit()

        if attempts == LOCK_AFTER_ATTEMPTS:
            notification_service.notify_self_service_account_event(
                db=db, target=user,
                event_type=NotificationEventType.ACCOUNT_LOCKED,
                title="Account locked out",
                message=f"{user_email} has been locked out after {attempts} failed login attempts.",
            )
            write_audit_log(
                db,
                user=None,
                action=AuditAction.LOCK_REGIONAL_ADMIN_ACCOUNT,
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