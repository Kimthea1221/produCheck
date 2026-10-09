# backend/app/core/audit.py
"""Shared helper for writing rows to the audit_logs table.

Call this AFTER the main DB write succeeds (e.g. after db.commit() on the
actual product/advisory/profile change), never before — a failed write
should never produce a phantom audit-log row. This does its own commit,
so it works as a small independent step at the end of a request.
"""
from typing import Any, Optional
from uuid import UUID

from fastapi import Request
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone 

from app.models.audit_logs import AuditLog
from app.models.regions import Region
from app.core.constants import AuditAction


def get_user_region_code(db: Session, user) -> Optional[str]:
    """Looks up the region_code string for a user's region_id.
    Returns None if the user has no region_id set (e.g. superadmin).
    """
    if not user or not getattr(user, "region_id", None):
        return None
    region = db.query(Region).filter(Region.region_id == user.region_id).first()
    return region.region_code if region else None


def write_audit_log(
    db: Session,
    user,  # the User object of whoever performed the action; can be None for system actions
    action: str,  # one of the AuditAction.* constants
    target_table: Optional[str] = None,
    target_id: Optional[UUID] = None,
    target_reference: Optional[str] = None,
    old_value: Optional[dict[str, Any]] = None,
    new_value: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
    user_role_override: Optional[str] = None,
    region_code: Optional[str] = None,
    user_id_override: Optional[UUID] = None,
) -> AuditLog:
    
    ip_address = None
    user_agent = None
    if request is not None:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

    entry = AuditLog(
        user_id=user_id_override if user_id_override is not None else (user.user_id if user else None),
        user_role=user_role_override or (user.role if user else "system"),
        region_code=region_code,
        action=action,
        target_table=target_table,
        target_id=target_id,
        target_reference=target_reference,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry



# Keep in sync with PASSWORD_RESET_COOLDOWN_MS in profile-setting.jsx
RESET_REQUEST_COOLDOWN = timedelta(hours=8)


def reset_request_retry_after(db, user_id) -> int:
    """Seconds until this user may request a password reset again; 0 if allowed now."""
    last = (
        db.query(AuditLog.performed_at)
        .filter(
            AuditLog.action == AuditAction.PERSONNEL_REQUEST_PASSWORD_UPDATE,
            AuditLog.target_id == user_id,
        )
        .order_by(AuditLog.performed_at.desc())
        .first()
    )
    if not last:
        return 0
    last_at = last[0]
    if last_at.tzinfo is None:  # naive timestamps: treat as UTC
        last_at = last_at.replace(tzinfo=timezone.utc)
    remaining = RESET_REQUEST_COOLDOWN - (datetime.now(timezone.utc) - last_at)
    return max(0, int(remaining.total_seconds()))