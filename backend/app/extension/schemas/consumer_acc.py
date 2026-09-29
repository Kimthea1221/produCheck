import re
from pydantic import BaseModel, Field, EmailStr, field_validator

PASSWORD_RULE_MSG = "Password must be at least 8 characters and include an uppercase letter and a special character."

def check_password_strength(v: str) -> str:
    if len(v) < 8 or not re.search(r"[A-Z]", v) or not re.search(r"[^A-Za-z0-9\s]", v):
        raise ValueError(PASSWORD_RULE_MSG)
    return v

class CreateConsumerAcc(BaseModel):
    email: EmailStr = Field(min_length=3, max_length=254)
    username: str = Field(min_length=1, max_length=100)
    password: str
    
    @field_validator("password")
    @classmethod
    def strong_password(cls, v):
        return check_password_strength(v)

class UpdateUsername(BaseModel):
    username: str = Field(min_length=1, max_length=100)

class ChangePendingUsername(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=100)

class DeleteAccountRequest(BaseModel):
    password: str

class RequestOTP(BaseModel):
    email: EmailStr

class VerifyOTP(BaseModel):
    email: EmailStr
    otp_code: str

class GoogleLoginRequest(BaseModel):
    token: str
    
class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class VerifyResetOtp(BaseModel):
    email: EmailStr
    otp_code: str
    
class ResetPassword(BaseModel):
    email: EmailStr
    reset_token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v