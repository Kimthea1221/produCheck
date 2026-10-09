# backend/app/desktop/services/auth/national_admin_auth.py
from sqlalchemy.orm import Session
from sqlalchemy import update, text
from datetime import datetime, timedelta, timezone

from fastapi import Request
from app.models.users import User
from app.core.security import verify_password, hash_password
from app.core.constants import Role, UserStatus, AuditAction
from app.core.audit import write_audit_log
from app.desktop.services.admin_notifications import admin_notification_service as notification_service
from app.desktop.schemas.admin_notifications.notification_enums import NotificationEventType
from app.desktop.services.auth.login_throttle import (
    LoginThrottledError, LOCK_AFTER_ATTEMPTS, WARN_FROM_ATTEMPTS, THROTTLE_SECONDS,
    ACCOUNT_LOCKED_MESSAGE,
    attempts_left_message, check_throttle, record_failed_attempt, reset_login_state,
)



class NationalAdminThrottledError(LoginThrottledError):
    pass



_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing-safety-only")
_LOCKOUT_BACKOFF_SECONDS = [30, 120, 300, 900, 3600]


def _backoff_seconds_for(attempts: int) -> int:
    cycle_index = (attempts // 5) - 1
    cycle_index = max(0, min(cycle_index, len(_LOCKOUT_BACKOFF_SECONDS) - 1))
    return _LOCKOUT_BACKOFF_SECONDS[cycle_index]


def _try_hard_lock_if_not_last_national_admin(db: Session, user: User) -> bool:
    """
    Atomically hard-locks `user` UNLESS doing so would leave zero active
    national admins. Returns True if the lock was applied, False if
    blocked (caller should throttle instead).

    WHY THE ADVISORY LOCK IS REQUIRED, NOT OPTIONAL:
    A plain `UPDATE users SET is_locked=true WHERE user_id=:id AND
    (SELECT COUNT(*) ...) > 0` is atomic per ROW, but its subquery reads
    OTHER rows without locking them. If two different national admins,
    A and B, both fail their 5th attempt at the same moment:
      - TxA's subquery counts B as still active -> proceeds to lock A
      - TxB's subquery counts A as still active (A's write hasn't
        committed yet) -> proceeds to lock B
      - Both commit. Zero active national admins — exactly the outcome
        this mechanism exists to prevent.
    pg_advisory_xact_lock serializes EVERY national-admin lockout
    decision through one point: whichever transaction arrives first
    finishes (and commits) before the next one is even allowed to read
    the "how many others are active" count, so the second always sees
    accurate, post-commit data. It's transaction-scoped, so it releases
    automatically on this transaction's next commit or rollback — no
    manual unlock call needed.
    """
    # Flush any pending ORM changes (e.g. an in-memory failed_attempts
    # increment made just before this call) so the raw SQL below sees
    # them, regardless of the session's autoflush setting.
    db.flush()

    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('national_admin_lockout'))"))

    result = db.execute(
        text("""
            UPDATE users
            SET is_locked = true
            WHERE user_id = :user_id
              AND (
                SELECT COUNT(*) FROM users AS others
                WHERE others.role = :role
                  AND others.user_id != :user_id
                  AND others.is_active = true
                  AND others.is_locked = false
                  AND others.status = 'active'
              ) > 0
            RETURNING user_id
        """),
        {"user_id": str(user.user_id), "role": Role.NATIONAL_ADMIN},
    )
    return result.fetchone() is not None


def _record_failed_attempt_atomic(db: Session, user: User) -> int:
    attempts = record_failed_attempt(db, user.user_id)
    db.commit()
    return attempts


def authenticate_national_admin(db: Session, email: str, password: str, http_request: Request | None = None) -> User:
    user = db.query(User).filter(User.email == email).first()

    if not user or user.role != Role.NATIONAL_ADMIN:
        verify_password(password, user.password_hash if user else _DUMMY_PASSWORD_HASH)
        raise ValueError("Invalid credentials")

    if user.is_locked:
        raise ValueError(ACCOUNT_LOCKED_MESSAGE)

    check_throttle(user, error_cls=NationalAdminThrottledError)

    password_ok = verify_password(password, user.password_hash)

    if not password_ok:
        _handle_failed_attempt(db, user, http_request)
        raise ValueError("Invalid credentials")

    if user.status == UserStatus.PENDING_APPROVAL:
        raise ValueError("Your account is awaiting activation from a fellow National Admin.")

    if not user.is_active:
        raise ValueError("Account is inactive")

    reset_login_state(db, user.user_id)
    return user
    


def _handle_failed_attempt(db: Session, user: User, http_request: Request | None = None) -> None:
    attempts = _record_failed_attempt_atomic(db, user)

    if attempts > 0 and attempts % 5 == 0:
        hard_locked = _try_hard_lock_if_not_last_national_admin(db, user)

        if not hard_locked:
            # Blocked: this IS the last active national admin. Throttle
            # instead of permanently locking so the system is never left
            # with zero admins able to sign in.
            backoff = _backoff_seconds_for(attempts)
            user.locked_until = datetime.now(timezone.utc) + timedelta(seconds=backoff)
            db.commit()
            notification_service.notify_self_service_account_event(
                db=db, target=user,
                event_type=NotificationEventType.FAILED_LOGIN_WARNING,
                title="Last national admin under repeated attack",
                message=(
                    f"{user.email} has hit {attempts} failed login attempts and is the "
                    f"only active national admin. Account was throttled (locked out for "
                    f"{backoff}s) rather than permanently locked. Investigate immediately."
                ),
            )
        else:
            db.refresh(user)  # local ORM object is stale after the raw UPDATE
            user.locked_until = None  # a lock must never look like a throttle
            user_id = user.user_id
            user_email = user.email
            db.commit()
            notification_service.notify_self_service_account_event(
                db=db, target=user,
                event_type=NotificationEventType.ACCOUNT_LOCKED,
                title="Account locked out",
                message=f"{user_email} has been locked out after {attempts} failed login attempts.",
            )
            write_audit_log(
                db,
                user=None,
                action=AuditAction.LOCK_NATIONAL_ADMIN_ACCOUNT,
                target_table="users",
                target_id=user_id,
                target_reference=user_email,
                old_value={"is_locked": False},
                new_value={"is_locked": True, "failed_login_attempts": attempts},
                request=http_request,
                region_code=None,
                user_role_override=Role.NATIONAL_ADMIN,
                user_id_override=user_id,
            )
            raise ValueError(ACCOUNT_LOCKED_MESSAGE)  # show the lock message on the 5th attempt

    elif (hint := attempts_left_message(attempts)):
        user_email = user.email
        user.locked_until = datetime.now(timezone.utc) + timedelta(seconds=THROTTLE_SECONDS)
        db.commit()
        if attempts == WARN_FROM_ATTEMPTS:
            notification_service.notify_self_service_account_event(
                db=db, target=user,
                event_type=NotificationEventType.FAILED_LOGIN_WARNING,
                title="Repeated failed login attempts",
                message=f"{attempts} failed attempts on {user_email}.",
            )
        raise NationalAdminThrottledError(THROTTLE_SECONDS, f"Invalid email or password. {hint}")

    else:
        db.commit()