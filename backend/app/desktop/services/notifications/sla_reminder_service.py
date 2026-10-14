# backend/app/desktop/services/notifications/sla_reminder_service.py
from datetime import datetime, timezone, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.verification_requests import VerificationRequest
from app.models.complaints import Complaint
from app.desktop.services.notifications.notification_service import (
    notify_fda_sla_reminder_1,
    notify_fda_sla_reminder_2,
    notify_fda_sla_breach,
)


# Full deadline per priority, measured from requested_at. 'standard' has
# no deadline and is excluded from this check entirely.
SLA_DEADLINES = {
    "critical": timedelta(hours=1),
    "urgent": timedelta(hours=24),
    "high": timedelta(hours=48),
}

# Elapsed-time thresholds for each of the two pre-deadline warnings —
# measured as time-since-requested_at, not time-remaining, to keep the
# comparison against `elapsed` simple.
SLA_REMINDER_1_THRESHOLDS = {
    "critical": timedelta(minutes=30),   # 30 min left
    "urgent": timedelta(hours=12),       # 12 hr left
    "high": timedelta(hours=24),         # 24 hr left
}

SLA_REMINDER_2_THRESHOLDS = {
    "critical": timedelta(minutes=50),          # 10 min left
    "urgent": timedelta(hours=23, minutes=30),  # 30 min left
    "high": timedelta(hours=47),                # 1 hr left
}


# Atomically claims one SLA checkpoint for one request. The UPDATE's
# WHERE clause re-checks "still NULL" at the database level, so if two
# requests race to claim the same checkpoint at nearly the same instant,
# Postgres serializes the two UPDATEs and only the first to commit will
# find a matching row — the second's UPDATE simply matches zero rows.
# Only the session that gets a row back from RETURNING is the one that
# actually sends the notification, so it's impossible for both to send it.
def _try_claim_checkpoint(db: Session, request_id, column: str, now: datetime) -> bool:
    result = db.execute(
        text(f"""
            UPDATE verification_requests
            SET {column} = :now
            WHERE request_id = :request_id
              AND {column} IS NULL
            RETURNING request_id
        """),
        {"now": now, "request_id": request_id},
    )
    return result.fetchone() is not None


# Called from get_unread_count() on every poll — piggybacks on the
# existing 30s frontend polling instead of running a separate scheduler.
# Only relevant for FDA personnel, since only FDA responds to these.
def check_and_send_sla_reminders(db: Session, current_user) -> None:
    if current_user.role != "fda_personnel":
        return

    now = datetime.now(timezone.utc)

    pending_requests = (
        db.query(VerificationRequest, Complaint)
        .join(Complaint, VerificationRequest.complaint_id == Complaint.complaint_id)
        .filter(
            VerificationRequest.verification_request_status == "pending",
            VerificationRequest.priority != "standard",
            Complaint.region_id == current_user.region_id,
            Complaint.source == "walk_in",   # ADDED: SLA reminders only apply to walk-in verification requests
        )
        .all()
    )

    for request, complaint in pending_requests:
        priority = request.priority
        elapsed = now - request.requested_at
        deadline_at = request.requested_at + SLA_DEADLINES[priority]
        already_past_deadline = now >= deadline_at

        if (
            request.sla_reminder_1_sent_at is None
            and elapsed >= SLA_REMINDER_1_THRESHOLDS[priority]
        ):
            if _try_claim_checkpoint(db, request.request_id, "sla_reminder_1_sent_at", now):
                notify_fda_sla_reminder_1(
                    db, complaint, priority, _format_remaining(deadline_at, now),
                    is_late=already_past_deadline,
                )
                db.commit()
            else:
                db.rollback()

        if (
            request.sla_reminder_2_sent_at is None
            and elapsed >= SLA_REMINDER_2_THRESHOLDS[priority]
        ):
            if _try_claim_checkpoint(db, request.request_id, "sla_reminder_2_sent_at", now):
                notify_fda_sla_reminder_2(
                    db, complaint, priority, _format_remaining(deadline_at, now),
                    is_late=already_past_deadline,
                )
                db.commit()
            else:
                db.rollback()

        if (
            request.sla_breach_notified_at is None
            and elapsed >= SLA_DEADLINES[priority]
        ):
            if _try_claim_checkpoint(db, request.request_id, "sla_breach_notified_at", now):
                notify_fda_sla_breach(db, complaint, priority)
                db.commit()
            else:
                db.rollback()


def _format_remaining(deadline_at: datetime, now: datetime) -> str:
    remaining = deadline_at - now
    total_minutes = max(int(remaining.total_seconds() // 60), 0)
    if total_minutes >= 60:
        hours, mins = divmod(total_minutes, 60)
        if mins == 0:
            return f"{hours} hour{'s' if hours != 1 else ''}"
        return f"{hours}h {mins}m"
    return f"{total_minutes} minute{'s' if total_minutes != 1 else ''}"