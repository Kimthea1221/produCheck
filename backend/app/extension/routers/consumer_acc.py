from typing import Annotated
from datetime import datetime, timezone

from fastapi import BackgroundTasks
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.database.sessions import get_db
from app.extension.schemas import consumer_acc #CreateConsumerAcc, UpdateUsername, VerifyOTP, RequestOTP
from app.extension.services import consumer_acc_service
from app.core.security import get_current_user

from app.extension.services.send_email import send_otp_email, RESET_PASSWORD_PURPOSE_TEXT
from app.extension.services import consumer_otp_service

from app.core.extension_limiter import limiter

router = APIRouter(
    prefix="/accounts",
    tags=["Consumer Accounts"]
)

db_dependency = Annotated[Session, Depends(get_db)]
user_dependency = Annotated[dict, Depends(get_current_user)]

@router .post("/", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def create_user(
    request: Request,
    db: db_dependency, 
    payload: consumer_acc.CreateConsumerAcc, 
    background_tasks: BackgroundTasks
):

    consumer, code = consumer_acc_service.create_user(db, payload)
    print(f"[OTP] route reached for {consumer.email}", flush=True)
    background_tasks.add_task(send_otp_email, consumer.email, code)

    return {"detail": "Account created successfully"}

@router .put("/username", status_code=status.HTTP_200_OK)
async def update_username(
    db: db_dependency, 
    current_user: user_dependency, 
    payload: consumer_acc.UpdateUsername
):

    updated_user = consumer_acc_service.update_username(
        db, current_user["id"], payload.username)

    return {
        "detail": "Username updated succesfully",
        "username": updated_user.username
    }

@router .put("/change-pending-username", status_code=status.HTTP_200_OK)
async def change_pending_username(db: db_dependency, payload: consumer_acc.ChangePendingUsername):
    updated_user = consumer_acc_service.change_pending_username(
        db, payload.email, payload.username)

    return {
        "detail": "Username updated succesfully",
        "username": updated_user.username
    }

@router .delete("/delete-account", status_code=status.HTTP_204_NO_CONTENT)
def soft_delete_account(
    db: db_dependency, 
    current_user: user_dependency, 
    payload: consumer_acc.DeleteAccountRequest
):

    consumer_acc_service.delete_account(db, current_user["id"], payload)

@router .post("/verify-otp", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def verify_otp(
    request: Request,
    db: db_dependency, 
    verify_request: consumer_acc.VerifyOTP
):

    consumer_acc_service.verify_signup_otp(db, verify_request.email, verify_request.otp_code)
    return {"detail": "Account verified successfully"}

@router .post("/resend-otp", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def resend_otp(
    request: Request,
    payload: consumer_acc.RequestOTP, 
    db: db_dependency, 
    background_tasks: BackgroundTasks
):

    code = consumer_acc_service.resend_signup_otp(db, payload.email)
    background_tasks.add_task(send_otp_email, payload.email, code)
    
    return {"detail": "OTP resent"}

@router .post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    db: db_dependency, 
    payload: consumer_acc.ForgotPasswordRequest, 
    background_tasks: BackgroundTasks
):

    result = consumer_acc_service.request_password_reset(db, payload.email)

    if result:
        email, otp_code = result
        background_tasks.add_task(send_otp_email, email, otp_code, None, RESET_PASSWORD_PURPOSE_TEXT)

    return { "detail": "A reset code has been sent to your email." }

@router .post("/verify-reset-otp", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def verify_reset_otp(
    request: Request,
    db: db_dependency, 
    payload: consumer_acc.VerifyResetOtp
):

    reset_token = consumer_otp_service.verify_reset_otp(db, payload.email, payload.otp_code)
    return { "reset_token": reset_token }

@router .post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(db: db_dependency, payload: consumer_acc.ResetPassword):
    consumer_acc_service.reset_password(db, payload.email, payload.reset_token, payload.new_password)
    return { "detail": "Password reset successfully" }