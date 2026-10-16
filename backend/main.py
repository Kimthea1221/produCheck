# backend/main.py   
from fastapi import Depends, FastAPI, HTTPException, status
from typing import Annotated

from fastapi.middleware.cors import CORSMiddleware

""" from app.routers.auth.invite import router as invite_router
from app.routers.regions.regions import router as regions_router """

from app.desktop.routers.auth.national_admin_login import router as national_admin_login_router
from app.desktop.routers.auth.password_reset import router as password_reset_router
from app.desktop.routers.auth.sessions import router as sessions_router
from app.desktop.routers.auth import registration
from app.desktop.routers.regions.regions import router as regions_router

from app.desktop.routers.national_admin_management.management import router as national_admin_management_router
from app.desktop.routers.personnel_management.management import router as personnel_management_router
from app.desktop.routers.admin_management.management import router as admin_management_router  # NEW

from app.desktop.routers.auth.admin_login import router as admin_login_router
from app.desktop.routers.auth.personnel_login import router as personnel_login_router
from app.desktop.routers.auth.password_change import router as password_change_router
from app.desktop.routers.profile_setting import profile as profile_router
from app.desktop.routers.admin_notifications.admin_notifications import router as admin_notifications_router
from app.desktop.routers.audit_logs.audit_logs import router as audit_logs_router  
from app.desktop.routers.notifications.notifications import router as notifications_router  # ADDED     
from app.desktop.routers.workspace_locations.workspace_location import router as workspace_location_router 
from app.desktop.routers.auth.password_reset_request import router as password_reset_request_router 


from app.database.base import Base
from app.database.sessions import engine, get_db
from app.models import consumer_accounts
from app.extension.routers import consumer_acc as consumer_acc_router
from app.extension.routers import auth as auth_router
from app.core.security import get_current_user
from app.extension.routers import complaints

from app.extension.routers import status as status_router
from app.desktop.routers.Product_database.registered_product import router as registered_product_router
from app.desktop.routers.Product_database.unregistered_advisory import router as unregistered_advisory_router


# Saved Drafts feature
from app.desktop.routers.drafts.walkin_drafts import router as walkin_drafts_router
from app.desktop.routers.drafts.all_drafts import router as all_drafts_router
from app.desktop.routers.drafts.verification_drafts import router as verification_drafts_router

# Complainant and Complaint Creation feature
from app.desktop.routers.complaints.walkin_complaints import (
    draft_submit_router,
    direct_complaint_router,
)

# Verification Joined Detail feature
from app.desktop.routers.complaints.complaint_detail import router as complaint_detail_router
# Not used yet, but will be used in the future for shared files download
from app.desktop.routers.complaints.shared_files import router as shared_files_router

# Verificatiion Request feature
from app.desktop.routers.verification.verification_requests import (
    draft_submit_router as verification_draft_submit_router,
    direct_request_router as verification_direct_request_router,
)

# verification Ready to Send and Awaiting FDA tab
from app.desktop.routers.verification.verification_requests import (
    draft_submit_router as verification_draft_submit_router,
    direct_request_router as verification_direct_request_router,
    list_router as verification_list_router,
)

# FDA Verification Drafts and Confirmation FDA Response feature
from app.desktop.routers.drafts.fda_verification_drafts import router as fda_verification_draft_router
from app.desktop.routers.verification.verification_response import fda_response_router

# Title Extaction Retrieved from the Chrome Extension to NLP
#from app.extension.routers.retrieval import router as retrieval_router

#for verification history in extension
from app.extension.routers import verification
from app.extension.routers.marketplace_detection import router as marketplace_detection_router

#for update status in desktop
from app.desktop.routers.complaints import complaint_status

#rate limiting in extension
from app.core.extension_limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

#LLM/OCR
from app.extension.routers import screenshot
from dotenv import load_dotenv
load_dotenv()

app = FastAPI()
# Base.metadata.create_all(bind=engine) wag na iuuncomment this line, since we are using alembic for migrations

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(regions_router)
app.include_router(registration.router)
app.include_router(registered_product_router)
app.include_router(unregistered_advisory_router)


app.include_router(consumer_acc_router.router)
app.include_router(auth_router.router)
app.include_router(complaints.router)

app.include_router(status_router.router)

consumer_dependency = Annotated[dict, Depends(get_current_user)]

@app.get("/")
def root():
    return {"message": "Backend is running"}



app.include_router(national_admin_login_router)
app.include_router(password_reset_router)
app.include_router(sessions_router)

app.include_router(admin_login_router)
app.include_router(personnel_management_router)
app.include_router(national_admin_management_router)
app.include_router(admin_management_router)  # NEW

app.include_router(walkin_drafts_router)
app.include_router(all_drafts_router)
app.include_router(verification_drafts_router)
app.include_router(fda_verification_draft_router)


app.include_router(draft_submit_router)
app.include_router(direct_complaint_router)

app.include_router(complaint_detail_router)
app.include_router(shared_files_router)

app.include_router(verification_draft_submit_router)
app.include_router(verification_direct_request_router)
app.include_router(fda_response_router)

app.include_router(verification_list_router)

app.include_router(personnel_login_router)
app.include_router(password_change_router)
app.include_router(profile_router.router)
app.include_router(admin_notifications_router)
app.include_router(audit_logs_router)
app.include_router(notifications_router)  # ADDED
app.include_router(workspace_location_router)
app.include_router(password_reset_request_router)   

# @app.get("/", status_code=status.HTTP_200_OK)
# async def user(consumer: consumer_dependency):
#     if consumer is None:
#         raise HTTPException(status_code=401,
#                             detail = "Authentication Failed")
#     return {
#         "User": consumer
#     }

# app.include_router(retrieval_router)

app.include_router(verification.router)
app.include_router(marketplace_detection_router)

app.include_router(complaint_status.router)

app.include_router(screenshot.router)