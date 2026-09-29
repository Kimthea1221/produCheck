# backend/app/desktop/schemas/auth/password_reset_request.py
from pydantic import BaseModel, EmailStr


class PasswordResetRequestPayload(BaseModel):
    email: EmailStr
    agency: str