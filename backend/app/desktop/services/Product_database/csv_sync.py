from datetime import date, datetime, timezone
import csv
import sys
from pathlib import Path
import pandas as pd
from sqlalchemy.orm import Session
from app.models.registered_products import RegisteredProduct
from app.models.unregistered_advisories import UnregisteredAdvisory
from app.models.users import User

def clean_title(title: str) -> str:
    """Cleans and standardizes product titles."""
    if not title:
        return ""
    return " ".join(str(title).strip().split())

def is_date_expired(val) -> bool:
    """
    Checks if a given date string or date/datetime object is expired.
    Returns True if expired (date <= date.today()), False otherwise (valid or not set).
    """
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return False
    
    today = date.today()
    
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.date() <= today
    if isinstance(val, date):
        return val <= today
        
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("", "nan", "none", "null", "nat"):
        return False
        
    try:
        parsed_dt = pd.to_datetime(val_str, errors="coerce")
        if pd.notna(parsed_dt):
            return parsed_dt.date() <= today
    except Exception:
        pass
        
    return False

# Get backend folder root relative to this file
# __file__ is backend/app/desktop/services/Product_database/csv_sync.py
BACKEND_DIR = Path(__file__).resolve().parents[4]
REGISTERED_CSV_PATH = BACKEND_DIR / "nlp" / "datasets" / "Registered_cleaned.csv"
UNREGISTERED_CSV_PATH = BACKEND_DIR / "nlp" / "datasets" / "unregistered.csv"

def sync_registered_products_to_csv(db: Session):
    """
    Syncs the database's registered products changes into Registered_cleaned.csv.
    Maintains the existing rows while updating or appending new active products,
    and removing any deleted or expired products.
    """
    try:
        REGISTERED_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        # 1. Read existing Registered_cleaned.csv if it exists
        if REGISTERED_CSV_PATH.exists():
            df = pd.read_csv(REGISTERED_CSV_PATH, dtype=str)
            df = df.fillna("")
        else:
            df = pd.DataFrame(columns=[
                "ACCOUNTCODE", "PRODUCT_NAME", "BRAND_NAME", "PROD_VARIANTS",
                "PRODUCT_INTENDED_USE", "COMPANY_NAME", "NOTIFICATION_DECISION_DATE",
                "NOTIFICATION_VALIDITY", "NOTIFICATION_DECISION"
            ])

        # 2. Query all products from database (both active and deleted)
        db_products = db.query(RegisteredProduct).all()

        records = df.to_dict(orient="records")
        
        # Helper to find index of a record by ACCOUNTCODE
        def find_record_idx(account_code):
            for i, r in enumerate(records):
                if str(r.get("ACCOUNTCODE", "")).strip().upper() == str(account_code).strip().upper():
                    return i
            return -1

        db_modified = False
        if db_products:
            for p in db_products:
                reg_num = p.registration_number
                if not reg_num:
                    continue

                idx = find_record_idx(reg_num)
                is_expired = is_date_expired(p.expiry_date)

                if p.deleted_at is not None or is_expired:
                    # If deleted in system or expired, remove from records if exists
                    if idx != -1:
                        records.pop(idx)
                    
                    # If expired but not yet soft-deleted in DB, soft-delete it
                    if is_expired and p.deleted_at is None:
                        p.deleted_at = datetime.now(timezone.utc)
                        fallback_user = db.query(User.user_id).first()
                        fallback_user_id = fallback_user[0] if fallback_user else None
                        p.deleted_by = p.updated_by or p.added_by or fallback_user_id
                        db_modified = True
                else:
                    # If active and not expired, clean product name and upsert
                    cleaned_name = clean_title(p.product_name)
                    date_str = p.date_registered.strftime("%d %B %Y") if p.date_registered else ""
                    expiry_str = p.expiry_date.strftime("%d %B %Y") if p.expiry_date else ""
                    
                    updated_record = {
                        "ACCOUNTCODE": reg_num,
                        "PRODUCT_NAME": cleaned_name,
                        "BRAND_NAME": p.brand_name or "",
                        "PROD_VARIANTS": "",
                        "PRODUCT_INTENDED_USE": p.product_category or "Cosmetics",
                        "COMPANY_NAME": "",
                        "NOTIFICATION_DECISION_DATE": date_str,
                        "NOTIFICATION_VALIDITY": expiry_str,
                        "NOTIFICATION_DECISION": "1"
                    }

                    if idx != -1:
                        # Update existing record, preserving other columns that might exist
                        for k, v in updated_record.items():
                            records[idx][k] = v
                    else:
                        # Append new record
                        records.append(updated_record)

        if db_modified:
            db.commit()

        # 3. Also filter out any existing CSV rows whose NOTIFICATION_VALIDITY is expired
        records = [
            r for r in records
            if not is_date_expired(r.get("NOTIFICATION_VALIDITY", ""))
        ]

        # 4. Save back to CSV
        new_df = pd.DataFrame(records)
        new_df.to_csv(REGISTERED_CSV_PATH, index=False)
        print(f"Successfully synced database changes to {REGISTERED_CSV_PATH}.", file=sys.stderr)
    except Exception as e:
        print(f"Warning: Error syncing registered products to CSV: {e}", file=sys.stderr)

def sync_unregistered_advisories_to_csv(db: Session):
    """
    Syncs the database's unregistered advisories changes into Unregistered_cleaned.csv.
    Maintains the existing 6k+ rows while updating or appending new active advisories,
    and removing any deleted advisories.
    """
    try:
        UNREGISTERED_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        # 1. Read existing Unregistered_cleaned.csv if it exists
        if UNREGISTERED_CSV_PATH.exists():
            df = pd.read_csv(UNREGISTERED_CSV_PATH, dtype=str)
            df = df.fillna("")
        else:
            df = pd.DataFrame(columns=[
                "Date Published", "Product Title", "Advisory Title", "Category", "Post Link"
            ])

        # 2. Query all advisories from database (both active and deleted)
        db_advisories = db.query(UnregisteredAdvisory).all()
        if not db_advisories:
            return

        records = df.to_dict(orient="records")

        # Helper to find index of a record by Product Title (case-insensitive)
        def find_record_idx(product_title):
            for i, r in enumerate(records):
                if str(r.get("Product Title", "")).strip().upper() == str(product_title).strip().upper():
                    return i
            return -1

        for a in db_advisories:
            product_title = a.product_name
            if not product_title:
                continue

            idx = find_record_idx(product_title)

            if a.deleted_at is not None:
                # If deleted in system, remove all matching records
                records = [r for r in records if str(r.get("Product Title", "")).strip().upper() != str(product_title).strip().upper()]
            else:
                # If active, clean product title and upsert
                cleaned_title_str = clean_title(product_title)
                
                # Date format without leading zero on day, e.g. "9 November 2021"
                if a.advisory_date:
                    date_str = f"{a.advisory_date.day} {a.advisory_date.strftime('%B %Y')}"
                else:
                    date_str = ""

                updated_record = {
                    "Date Published": date_str,
                    "Product Title": cleaned_title_str,
                    "Advisory Title": a.advisory_details or "",
                    "Category": "Cosmetic Advisories",
                    "Post Link": a.source_url or ""
                }

                if idx != -1:
                    # Update existing record
                    for k, v in updated_record.items():
                        records[idx][k] = v
                else:
                    # Append new record
                    records.append(updated_record)

        # 3. Save back to CSV
        new_df = pd.DataFrame(records)
        new_df.to_csv(UNREGISTERED_CSV_PATH, index=False)
        print(f"Successfully synced database changes to {UNREGISTERED_CSV_PATH}.", file=sys.stderr)
    except Exception as e:
        print(f"Warning: Error syncing unregistered advisories to CSV: {e}", file=sys.stderr)
