from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime

class CreateVerification(BaseModel):
    product_title: str = Field(max_length=150)
    platform: str
    verification_result: str 

class ToPrintVerification(BaseModel):
    history_id: UUID
    product_title: str
    platform: str
    verification_result: str 
    checked_at: datetime