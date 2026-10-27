# backend/app/extension/services/send_email.py
import logging
from pathlib import Path
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from fastapi_mail.schemas import MultipartSubtypeEnum
from app.core.config import settings

logger = logging.getLogger(__name__)

TEMPLATE_PATH = Path(__file__).parent / "templates" / "otp_email.html"
LOGO_PATH = Path(__file__).parent.parent.parent.parent.parent / "extension" / "assets" / "images" / "extension_icon.png"

extension_mail_conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_EXTENSION_USERNAME,
    MAIL_PASSWORD=settings.MAIL_EXTENSION_PASSWORD,
    MAIL_FROM=settings.MAIL_EXTENSION_FROM,
    MAIL_FROM_NAME=settings.MAIL_EXTENSION_FROM_NAME,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_SERVER=settings.MAIL_HOST,
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
)

DEFAULT_PURPOSE_TEXT = "Enter this code to verify your email and continue."
RESET_PASSWORD_PURPOSE_TEXT = "Enter this code to verify your identity and reset your password."

def render_otp_email(otp_code: str, expire_minutes: int, purpose_text: str = DEFAULT_PURPOSE_TEXT) -> str:
    html = TEMPLATE_PATH.read_text(encoding="utf-8")
    html = html.replace("{{OTP_CODE}}", otp_code)
    html = html.replace("{{EXPIRE_MINUTES}}", str(expire_minutes))
    html = html.replace("{{PURPOSE_TEXT}}", purpose_text)
    return html

def render_otp_text(otp_code: str, expire_minutes: int, purpose_text: str) -> str:
    return (
        f"ProduCheck\n\n"
        f"{purpose_text}\n\n"
        f"Your verification code: {otp_code}\n\n"
        f"This code expires in {expire_minutes} minutes.\n\n"
        f"If you didn't request this code, you can safely ignore this email.\n"
    )

async def send_otp_email(
    to_email: str,
    otp_code: str,
    expire_minutes: int = None,
    purpose_text: str = DEFAULT_PURPOSE_TEXT,
    subject: str = "ProduCheck verification code",
):
    if expire_minutes is None:
        expire_minutes = settings.OTP_EXTENSION_MIN_EXPIRE

    html_body = render_otp_email(otp_code, expire_minutes, purpose_text)
    
    message = MessageSchema(
        subject=subject,
        recipients=[to_email],
        body=html_body,                  # plain-text part
        subtype=MessageType.html,
        multipart_subtype=MultipartSubtypeEnum.related,
        attachments=[
            {
                "file": str(LOGO_PATH),
                "headers": {
                    "Content-ID": "<extension_logo>",
                    "Content-Disposition": "inline; filename=\"extension_icon.png\"",
                },
                "mime_type": "image",
                "mime_subtype": "png",
            }
        ],
    )

    mail = FastMail(extension_mail_conf)
    try:
        await mail.send_message(message)
    except Exception:
        logger.exception("Failed to send OTP email to %s", to_email)