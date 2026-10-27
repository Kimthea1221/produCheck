from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.consumer_accounts import ConsumerAccount

import secrets 
from datetime import datetime, timedelta, timezone
from app.models.consumer_otp_tokens import ConsumerOTPToken
from app.core.security import pwd_context

OTP_EXPIRATION_MINS = 5
MAX_OTP_ATTEMPTS = 5
OTP_COOLDOWN_SECONDS = 60

def generate_otp_code(length: int = 6) -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(length))

def create_otp(db: Session, consumer_id, purpose: str) -> str:
    latest = (db.query(ConsumerOTPToken)
        .filter(ConsumerOTPToken.consumer_id == consumer_id,
                ConsumerOTPToken.purpose == purpose)
        .order_by(ConsumerOTPToken.created_at.desc())
        .first())

    if latest:
        age = (datetime.now(timezone.utc) - latest.created_at).total_seconds()
        if age < OTP_COOLDOWN_SECONDS:
            wait = int(OTP_COOLDOWN_SECONDS - age) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {wait}s before requesting another code.",
                headers={"Retry-After": str(wait)},
            )

    db.query(ConsumerOTPToken).filter(
        ConsumerOTPToken.consumer_id == consumer_id,
        ConsumerOTPToken.purpose == purpose,
        ConsumerOTPToken.is_used == False,
    ).update({ "is_used": True })
        
    code = generate_otp_code()
    otp = ConsumerOTPToken(
        consumer_id = consumer_id,
        otp_hash = pwd_context.hash(code),
        expires_at = datetime.now(timezone.utc) + timedelta(minutes = OTP_EXPIRATION_MINS),
        purpose = purpose
    )

    db.add(otp)
    db.commit()
    return code

def verify_otp(db: Session, consumer_id, submitted_code: str, purpose: str) -> None:
    otp = (db.query(ConsumerOTPToken).filter(
            ConsumerOTPToken.consumer_id == consumer_id,
            ConsumerOTPToken.purpose == purpose,
            ConsumerOTPToken.is_used == False,
        ).order_by(ConsumerOTPToken.created_at.desc()).first()
    )

    if not otp: 
        raise HTTPException(status_code=400, detail="No OTP found, please request a new one")
    if otp.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP expired, please request a new one")
    if otp.attempt_count >= MAX_OTP_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many attempts, please request a new one")

    if not pwd_context.verify(submitted_code, otp.otp_hash):
        otp.attempt_count += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    otp.is_used = True
    db.commit()

def create_reset_token(db: Session, consumer_id) -> str:
    db.query(ConsumerOTPToken).filter(
        ConsumerOTPToken.consumer_id == consumer_id,
        ConsumerOTPToken.purpose == "password_reset_token",
        ConsumerOTPToken.is_used == False,
    ).update({"is_used": True})
    
    token = secrets.token_urlsafe(32)
    reset_row = ConsumerOTPToken(
        consumer_id=consumer_id,
        otp_hash=pwd_context.hash(token),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        purpose="password_reset_token",
    )
    db.add(reset_row)
    db.commit()
    return token

def verify_reset_otp(db: Session, email: str, otp_code: str) -> str:
    consumer = db.query(ConsumerAccount).filter(ConsumerAccount.email == email).first()

    if not consumer:
        raise HTTPException(status_code=400, detail="Invalid request")

    verify_otp(db, consumer.consumer_id, otp_code, purpose="password_reset")
    return create_reset_token(db, consumer.consumer_id)
