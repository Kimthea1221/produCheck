# backend/app/desktop/services/account_status/guards.py
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException


from app.models.users import User
from app.models.audit_logs import AuditLog
from app.core.constants import Role, AuditAction
from app.core.audit import write_audit_log, get_user_region_code


def agency_of(role: str) -> str | None:
    if role in (Role.FDA_ADMIN, Role.FDA_PERSONNEL):
        return "FDA"
    if role in (Role.LEA_ADMIN, Role.LEA_PERSONNEL):
        return "LEA-CIDG"
    return None


# ADDED: one shared LEA-only check so every LEA endpoint enforces the same rule
def is_lea_user(user: User) -> bool:
    return agency_of(user.role) == "LEA-CIDG"


def assert_lea_user(user: User) -> None:
    if not is_lea_user(user):
        raise HTTPException(
            status_code=403,
            detail="This action is restricted to LEA-CIDG personnel.",
        )


# ADDED: FDA mirror of is_lea_user, for FDA-only read endpoints (lea-follow-up)
def is_fda_user(user: User) -> bool:
    return agency_of(user.role) == "FDA"


def assert_fda_user(user: User) -> None:
    if not is_fda_user(user):
        raise HTTPException(
            status_code=403,
            detail="This action is restricted to FDA personnel.",
        )


def assert_same_agency_and_region(db: Session, actor: User, target: User):
    if actor.role == Role.NATIONAL_ADMIN:
        # National Admin has unrestricted reach over other National Admins
        # (that's a separate peer-management flow, unchanged here). For
        # Interagency Admin targets, National Admin may act on them ONLY
        # if a National Admin (any of them) originally created the
        # account. Agency Admins invited by a FELLOW Agency Admin
        # (by-fellow-admin path) are out of National Admin's reach
        # entirely — view-only in the frontend; this 403 is the real
        # enforcement since the API can be called directly.
        if target.role in Role.ADMIN_ROLES:
            creator = (
                db.query(User).filter(User.user_id == target.created_by).first()
                if target.created_by else None
            )
            created_by_national_admin = creator is not None and creator.role == Role.NATIONAL_ADMIN
            if not created_by_national_admin:
                raise HTTPException(
                    status_code=403,
                    detail="You can only manage interagency admin accounts that were added by a National Admin.",
                )
        return
    if actor.region_id != target.region_id or agency_of(actor.role) != agency_of(target.role):
        raise HTTPException(status_code=403, detail="You can only manage accounts in your own agency and region.")


def assert_not_self(actor: User, target: User):
    if actor.user_id == target.user_id:
        raise HTTPException(status_code=400, detail="You cannot perform this action on your own account.")


def get_target(db: Session, user_id) -> User:
    target = db.query(User).filter(User.user_id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Account not found.")
    return target


# Maps (role, verb) -> the correct AuditAction constant, so every action
# function can log correctly for personnel/admin/national_admin without
# repeating a role-check ladder in each one.
_ACTION_TABLE = {
    Role.NATIONAL_ADMIN: {
        "SUSPEND": AuditAction.SUSPEND_NATIONAL_ADMIN_ACCOUNT,
        "REACTIVATE": AuditAction.REACTIVATE_NATIONAL_ADMIN_ACCOUNT,
        "UNLOCK": AuditAction.UNLOCK_NATIONAL_ADMIN_ACCOUNT,
        "DELETE": AuditAction.DELETE_NATIONAL_ADMIN_ACCOUNT,
        "INVITE_RESENT": AuditAction.INVITE_NATIONAL_ADMIN_RESENT,
    },
    "ADMIN": {
        "SUSPEND": AuditAction.SUSPEND_REGIONAL_ADMIN_ACCOUNT,
        "REACTIVATE": AuditAction.REACTIVATE_REGIONAL_ADMIN_ACCOUNT,
        "UNLOCK": AuditAction.UNLOCK_REGIONAL_ADMIN_ACCOUNT,
        "DELETE": AuditAction.DELETE_REGIONAL_ADMIN_ACCOUNT,
        "INVITE_RESENT": AuditAction.INVITE_REGIONAL_ADMIN_RESENT,
    },
    "PERSONNEL": {
        "SUSPEND": AuditAction.SUSPEND_PERSONNEL_ACCOUNT,
        "REACTIVATE": AuditAction.REACTIVATE_PERSONNEL_ACCOUNT,
        "UNLOCK": AuditAction.UNLOCK_PERSONNEL_ACCOUNT,
        "DELETE": AuditAction.DELETE_PERSONNEL_ACCOUNT,
        "INVITE_RESENT": AuditAction.INVITE_PERSONNEL_RESENT,
        "EDIT_INFO": AuditAction.UPDATE_PERSONNEL_INFORMATION,
        "RESET_PASSWORD": AuditAction.UPDATE_PERSONNEL_PASSWORD,
    },
}


def action_for_role(role: str, verb: str) -> str:
    if role == Role.NATIONAL_ADMIN:
        return _ACTION_TABLE[Role.NATIONAL_ADMIN][verb]
    if role in Role.ADMIN_ROLES:
        return _ACTION_TABLE["ADMIN"][verb]
    return _ACTION_TABLE["PERSONNEL"][verb]


def assert_employee_id_available(db: Session, employee_id: str | None, exclude_user_id=None):
    """Raises 400 if employee_id is already taken by another user.
    Call this on every account-creation path that accepts employee_id,
    and on edit, so the rule is enforced in exactly one place."""
    if not employee_id:
        return
    query = db.query(User).filter(User.employee_id == employee_id)
    if exclude_user_id is not None:
        query = query.filter(User.user_id != exclude_user_id)
    if query.first():
        raise HTTPException(status_code=400, detail="This Employee ID is already in use.")


def get_agency_admins_for(db: Session, target: User) -> list[User]:
    """Returns all Admin-role users (FDA or LEA) in the same region and same
    agency as `target`. Used to scope notifications/actions to the admins
    responsible for a given personnel account — e.g. the 'Notify Admin to
    Reset Password' button, which must not broadcast to all national admins.

    Deliberately excludes National Admins: per the current role model,
    National Admin does not manage Personnel directly — that's Admin's job,
    scoped to region + agency.
    """
    if target.region_id is None:
        return []

    target_agency = agency_of(target.role)
    if target_agency is None:
        return []

    candidates = (
        db.query(User)
        .filter(User.role.in_(Role.ADMIN_ROLES), User.region_id == target.region_id)
        .all()
    )
    return [u for u in candidates if agency_of(u.role) == target_agency]


def _expired_invitation_action_for_role(role: str) -> str:
    if role == Role.NATIONAL_ADMIN:
        return AuditAction.INVITATION_EXPIRED_NATIONAL_ADMIN
    if role in Role.ADMIN_ROLES:
        return AuditAction.INVITATION_EXPIRED_REGIONAL_ADMIN
    return AuditAction.INVITATION_EXPIRED_PERSONNEL


def log_expired_invitation_if_needed(db: Session, target: User, latest_token, request=None):
    """Writes an INVITATION_EXPIRED_* audit row the first time an admin views
    a list containing an invite that expired with no response — same expiry
    check compute_display_status already runs to show the "Link Expired"
    badge, just also logging it once. Dedups by checking audit_logs directly
    (action + target_id) rather than adding a new column, so this needs no
    migration.
    """
    if not latest_token or latest_token.used_at is not None:
        return

    expires_at = latest_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at >= datetime.now(timezone.utc):
        return

    action = _expired_invitation_action_for_role(target.role)

    already_logged = (
        db.query(AuditLog)
        .filter(AuditLog.action == action, AuditLog.target_id == target.user_id)
        .first()
    )
    if already_logged:
        return

    write_audit_log(
        db,
        user=target,
        action=action,
        target_table="users",
        target_id=target.user_id,
        target_reference=target.email,
        old_value={"status": "invited"},
        new_value={"status": "expired"},
        request=request,
        region_code=get_user_region_code(db, target) if target.region_id else None,
    )