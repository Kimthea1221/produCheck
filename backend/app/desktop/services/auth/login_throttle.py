# backend/app/desktop/services/auth/login_throttle.py
import math
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.users import User

ACCOUNT_LOCKED_MESSAGE = "Account locked. Please contact your administrator."

WARN_FROM_ATTEMPTS = 3
LOCK_AFTER_ATTEMPTS = 5
THROTTLE_SECONDS = 30


class LoginThrottledError(Exception):
    def __init__(self, retry_after_seconds: int, message: str = "Too many failed attempts."):
        self.retry_after_seconds = retry_after_seconds
        self.message = message
        super().__init__(message)


def attempts_left_message(attempts: int) -> str | None:
    """Warning text for attempts 3 and 4, otherwise None."""
    if WARN_FROM_ATTEMPTS <= attempts < LOCK_AFTER_ATTEMPTS:
        left = LOCK_AFTER_ATTEMPTS - attempts
        return f"{left} more failed attempt{'s' if left != 1 else ''} and your account will be locked."
    return None


def check_throttle(user: User, error_cls=LoginThrottledError) -> None:
    """Call BEFORE verifying the password. Throttled requests are not counted."""
    if not user.locked_until:
        return
    now = datetime.now(timezone.utc)
    if user.locked_until > now:
        remaining = math.ceil((user.locked_until - now).total_seconds())
        hint = attempts_left_message(user.failed_login_attempts)
        message = f"Too many failed attempts. {hint}" if hint else "Too many failed attempts."
        raise error_cls(retry_after_seconds=remaining, message=message)


def record_failed_attempt(db: Session, user_id) -> int:
    """Atomic increment. RETURNING gives each parallel request its own value.
    Does not commit; the caller commits."""
    return db.execute(
        update(User)
        .where(User.user_id == user_id)
        .values(failed_login_attempts=User.failed_login_attempts + 1)
        .returning(User.failed_login_attempts)
        .execution_options(synchronize_session=False)
    ).scalar_one()


def reset_login_state(db: Session, user_id) -> None:
    """Explicit UPDATE so a racing failed attempt can't survive a successful login."""
    db.execute(
        update(User)
        .where(User.user_id == user_id)
        .values(
            failed_login_attempts=0,
            locked_until=None,
            last_login=datetime.now(timezone.utc),
        )
        .execution_options(synchronize_session=False)
    )
    db.commit()