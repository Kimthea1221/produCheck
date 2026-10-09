from pydantic import BaseModel, ConfigDict, HttpUrl, Field
from datetime import datetime
from uuid import UUID
from typing import Optional

class CreateComplaint(BaseModel):
    product_title: str = Field(max_length=150)
    store_name: str = Field(max_length=100)
    product_url: HttpUrl
    consumer_description: str = Field(max_length=500)
    platform: str
    verification_result: str 
    attachment_data: Optional[str] = None
    attachment_name: Optional[str] = None

class ToPrintComplaint(BaseModel):
    model_config = ConfigDict(from_attribute=True)

    complaint_id: UUID
    case_reference: str
    product_title:  str
    product_url: Optional[str] = None
    store_name: Optional[str] = None
    consumer_description: str
    platform: str
    verification_result: str
    status: str
    created_at: datetime
    changed_at: datetime
    history_id: Optional[UUID] = None
    change_note: Optional[str] = None