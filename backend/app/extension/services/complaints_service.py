import base64, binascii
import re
import uuid
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.complaints import Complaint
from app.models.complaints_status_history import ComplaintStatusHistory
from app.extension.schemas.complaints import CreateComplaint
from app.models.regions import Region

from pathlib import Path
from app.core.config import settings

UPLOAD_DIR = Path(settings.UPLOAD_DIR)  
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

def decode_and_check_image(data_url: str) -> tuple[bytes, str]:
    _, _, b64 = data_url.partition(",")
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Invalid image data.")
    if len(raw) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large. Maximum is 5 MB.")
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return raw, "png"
    if raw.startswith(b"\xff\xd8\xff"):
        return raw, "jpg"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return raw, "webp"
    raise HTTPException(status_code=400, detail="Only PNG, JPG, or WEBP images are allowed.")
    
def save_attachment(attachment_data: str, original_name: str) -> tuple[str, str]:
    match = re.match(r"data:(image/\w+);base64,(.+)", attachment_data)
    if not match:
        raise ValueError("Invalid attachment format")

    mime_type, b64_data = match.groups()
    ext = mime_type.split("/")[-1]  # "png", "jpeg", etc.

    filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = UPLOAD_DIR / filename

    file_path.write_bytes(base64.b64decode(b64_data))

    return str(file_path), original_name


def create_complaints(db: Session, create_consumer_request: CreateComplaint, consumer_id: str) -> Complaint:
    attachment_path = None
    attachment_name = None
    
    if create_consumer_request.attachment_data:
        attachment_path, attachment_name = save_attachment(
            create_consumer_request.attachment_data,
            create_consumer_request.attachment_name or "screenshot"
        )

    complaint = Complaint(
        case_reference=f"CMP-{uuid.uuid4().hex[:8].upper()}",
        source="extension",
        region_id = get_region(db).region_id,
        product_title = create_consumer_request.product_title,
        store_name = create_consumer_request.store_name,
        product_url = str(create_consumer_request.product_url),
        consumer_description = create_consumer_request.consumer_description,
        platform = create_consumer_request.platform,
        verification_result = create_consumer_request.verification_result,
        consumer_id = consumer_id,
        attachment_path = attachment_path,
        attachment_name = attachment_name,
    ) 
    db.add(complaint)
    db.commit()
    db.refresh(complaint)
    return complaint

def get_region(db: Session) -> Region:
    region = db.query(Region).filter(Region.region_code == "RO3").first()

    if not region:
        raise ValueError("No region found.")
    return region
