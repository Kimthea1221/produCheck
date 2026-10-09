# backend/app/desktop/routers/auth/admin_login.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta

from app.database.sessions import get_db, set_bypass_rls
from app.desktop.schemas.auth.admin_login import AdminLoginRequest, AdminOTPVerifyRequest
from app.desktop.services.auth.admin_auth import authenticate_admin, AGENCY_ROLE_MAP
from app.desktop.services.auth.login_throttle import LoginThrottledError 
from app.desktop.services.auth.otp_service import create_otp_for_user, verify_otp_for_user
from app.desktop.services.auth.email import send_admin_otp_email
from app.models.users import User
from app.core.security import create_desktop_access_token, generate_refresh_token, hash_refresh_token
from app.models.user_sessions import UserSession
from app.core.config import settings
from app.core.audit import write_audit_log, get_user_region_code
from app.core.constants import AuditAction

router = APIRouter(prefix="/auth/admin", tags=["admin-auth"])


@router.post("/login")
async def admin_login(
    request: AdminLoginRequest,
    http_request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    set_bypass_rls(db, True)
    try:
        user = authenticate_admin(db, request.email, request.password, request.agency, http_request)
    except LoginThrottledError as exc:
        # Throttled after the 3rd/4th wrong password: return 429 with a real
        # retry_after_seconds field so the frontend can run the countdown.
        failed_user = db.query(User).filter(User.email == request.email).first()
        role_override = failed_user.role if failed_user else AGENCY_ROLE_MAP.get(request.agency)
        write_audit_log(
            db,
            user=failed_user,
            action=AuditAction.LOGIN_FAILED,
            target_table="users",
            target_reference=request.email,
            new_value={"reason": exc.message, "retry_after_seconds": exc.retry_after_seconds},
            request=http_request,
            region_code=get_user_region_code(db, failed_user) if failed_user else None,
            user_role_override=role_override,
        )
        raise HTTPException(
            status_code=429,
            detail={"message": exc.message, "retry_after_seconds": exc.retry_after_seconds},
        )
    except ValueError as exc:
        failed_user = db.query(User).filter(User.email == request.email).first()
        role_override = failed_user.role if failed_user else AGENCY_ROLE_MAP.get(request.agency)
        write_audit_log(
            db,
            user=failed_user,
            action=AuditAction.LOGIN_FAILED,
            target_table="users",
            target_reference=request.email,
            new_value={"reason": str(exc)},
            request=http_request,
            region_code=get_user_region_code(db, failed_user) if failed_user else None,
            user_role_override=role_override,
        )
        raise HTTPException(status_code=400, detail=str(exc))

    otp = create_otp_for_user(db, user)
    background_tasks.add_task(send_admin_otp_email, user.email, otp)

    return {"message": "OTP sent"}


@router.post("/verify-otp")
def verify_admin_otp(request: AdminOTPVerifyRequest, http_request: Request, db: Session = Depends(get_db)):
    set_bypass_rls(db, True)
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    try:
        otp_token = verify_otp_for_user(db, user, request.otp, http_request)
    except ValueError as exc:
        write_audit_log(
            db,
            user=user,
            action=AuditAction.LOGIN_FAILED,
            target_table="otp_tokens",
            target_reference=request.email,
            new_value={"reason": str(exc)},
            request=http_request,
            region_code=get_user_region_code(db, user),
        )
        raise HTTPException(status_code=400, detail=str(exc))

    otp_token.is_used = True
    db.commit()

    access_token = create_desktop_access_token({
        "sub": str(user.user_id),
        "role": user.role,
        "region_id": str(user.region_id),
    })

    refresh_token = generate_refresh_token()
    refresh_hash = hash_refresh_token(refresh_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    session = UserSession(
        user_id=user.user_id,
        refresh_token_hash=refresh_hash,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()

    write_audit_log(
        db,
        user=user,
        action=AuditAction.LOGIN,
        target_table="user_sessions",
        target_id=session.session_id,
        target_reference=request.email,
        request=http_request,
        region_code=get_user_region_code(db, user),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "refresh_token": refresh_token,
        "role": user.role,
        "force_password_change": user.force_password_change,
    }