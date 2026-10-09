# /backend/app/extension/routers/screenshot.py
from fastapi import APIRouter
from pydantic import BaseModel
from app.core.llm import extract_listing

router = APIRouter()

class ScreenshotIn(BaseModel):
    image: str
    url: str
    platform: str

@router.post("/verify-screenshot")
def verify_screenshot(body: ScreenshotIn):
    return extract_listing(body.image)