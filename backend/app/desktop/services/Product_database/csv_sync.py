# backend/app/desktop/services/Product_database/csv_sync.py
from datetime import date, datetime, timezone
import logging
import os
from pathlib import Path
import sys
import pandas as pd
from sqlalchemy.orm import Session

from app.models.registered_products import RegisteredProduct
from app.models.unregistered_advisories import UnregisteredAdvisory

logger = logging.getLogger(__name__)


def clean_title(title: str) -> str:
    """Cleans and standardizes product titles."""
    if not title:
        return ""
    return " ".join(str(title).strip().split())


def is_date_expired(val) -> bool:
    """
    Checks if a given date string or date/datetime object is expired.
    Returns True if expired (date < date.today()), False otherwise (valid or not set).
    """
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return False

    today = date.today()

    if isinstance(val, (datetime, pd.Timestamp)):
        return val.date() < today
    if isinstance(val, date):
        return val < today

    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("", "nan", "none", "null", "nat"):
        return False

    try:
        parsed_dt = pd.to_datetime(val_str, errors="coerce")
        if pd.notna(parsed_dt):
            return parsed_dt.date() < today
    except Exception:
        pass

    return False


def get_datasets_dir() -> Path:
    """
    Resolves the datasets directory path based on docker-compose volume mapping
    or local repository structure.
    In docker-compose: /etc/dokploy/data/everifymo/datasets -> /everifymo/backend/nlp/datasets
    """
    # 1. Explicit environment variable if provided
    env_dir = os.environ.get("DATASETS_DIR")
    if env_dir:
        p = Path(env_dir)
        if p.exists():
            return p

    # 2. Container mount path as defined in docker-compose.yml
    container_mount = Path("/everifymo/backend/nlp/datasets")
    if container_mount.exists():
        return container_mount

    # 3. Relative to this source file (backend/app/desktop/services/Product_database/csv_sync.py)
    # parents[4] is backend/
    try:
        rel_path = Path(__file__).resolve().parents[4] / "nlp" / "datasets"
        if rel_path.exists():
            return rel_path
    except Exception:
        pass

    # 4. Current working directory fallback
    cwd_path = Path.cwd() / "backend" / "nlp" / "datasets"
    if cwd_path.exists():
        return cwd_path

    # Fallback default
    return Path(__file__).resolve().parents[4] / "nlp" / "datasets"


def get_registered_csv_path() -> Path:
    datasets_dir = get_datasets_dir()
    datasets_dir.mkdir(parents=True, exist_ok=True)
    return datasets_dir / "registered.csv"


def get_unregistered_csv_path() -> Path:
    datasets_dir = get_datasets_dir()
    datasets_dir.mkdir(parents=True, exist_ok=True)
    return datasets_dir / "unregistered.csv"


# Module-level paths for direct access / backwards compatibility
DATASETS_DIR = get_datasets_dir()
REGISTERED_CSV_PATH = get_registered_csv_path()
UNREGISTERED_CSV_PATH = get_unregistered_csv_path()


def sync_registered_products_to_csv(db: Session):
    """
    Syncs database registered products changes into registered.csv.
    Maintains existing rows while updating or appending new active products,
    and removing any deleted or expired products from the database.
    """
    target_path = get_registered_csv_path()
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)

        if target_path.exists():
            df = pd.read_csv(target_path, dtype=str, low_memory=False)
            df = df.fillna("")
        else:
            df = pd.DataFrame(columns=[
                "ACCOUNTCODE", "PRODUCT_NAME", "BRAND_NAME", "PROD_VARIANTS",
                "PRODUCT_INTENDED_USE", "COMPANY_NAME", "NOTIFICATION_DECISION_DATE",
                "NOTIFICATION_VALIDITY", "NOTIFICATION_DECISION"
            ])

        db_products = db.query(RegisteredProduct).all()
        if not db_products and not target_path.exists():
            return

        records = df.to_dict(orient="records")

        # Fast O(1) index lookup by ACCOUNTCODE
        code_to_idx = {}
        for i, r in enumerate(records):
            code = str(r.get("ACCOUNTCODE", "")).strip().upper()
            if code:
                code_to_idx[code] = i

        removed_indices = set()

        for p in db_products:
            reg_num = (p.registration_number or "").strip()
            if not reg_num:
                continue

            lookup_key = reg_num.upper()
            is_expired = is_date_expired(p.expiry_date)
            is_deleted = p.deleted_at is not None or is_expired

            if is_deleted:
                if lookup_key in code_to_idx:
                    removed_indices.add(code_to_idx[lookup_key])
            else:
                cleaned_name = clean_title(p.product_name)

                date_str = ""
                if p.date_registered:
                    if isinstance(p.date_registered, (datetime, date)):
                        date_str = p.date_registered.strftime("%d %B %Y")
                    else:
                        date_str = str(p.date_registered).strip()

                expiry_str = ""
                if p.expiry_date:
                    if isinstance(p.expiry_date, (datetime, date)):
                        expiry_str = p.expiry_date.strftime("%d %B %Y")
                    else:
                        expiry_str = str(p.expiry_date).strip()

                updated_record = {
                    "ACCOUNTCODE": reg_num,
                    "PRODUCT_NAME": cleaned_name,
                    "BRAND_NAME": p.brand_name or "",
                    "PROD_VARIANTS": "",
                    "PRODUCT_INTENDED_USE": p.product_category or "Cosmetics",
                    "COMPANY_NAME": "",
                    "NOTIFICATION_DECISION_DATE": date_str,
                    "NOTIFICATION_VALIDITY": expiry_str,
                    "NOTIFICATION_DECISION": "1",
                }

                if lookup_key in code_to_idx:
                    idx = code_to_idx[lookup_key]
                    records[idx].update(updated_record)
                else:
                    records.append(updated_record)
                    code_to_idx[lookup_key] = len(records) - 1

        if removed_indices:
            records = [r for idx, r in enumerate(records) if idx not in removed_indices]

        new_df = pd.DataFrame(records)
        new_df.to_csv(target_path, index=False)
        logger.info("Successfully synced database registered products to %s (total rows: %d)", target_path, len(new_df))
        print(f"Successfully synced database changes to {target_path}.", file=sys.stderr)
    except Exception as e:
        logger.error("Error syncing registered products to CSV: %s", e, exc_info=True)
        print(f"Warning: Error syncing registered products to CSV: {e}", file=sys.stderr)


def sync_unregistered_advisories_to_csv(db: Session):
    """
    Syncs database unregistered advisories changes into unregistered.csv.
    Maintains existing rows while updating or appending new active advisories,
    and removing any deleted advisories from the database.
    """
    target_path = get_unregistered_csv_path()
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)

        if target_path.exists():
            df = pd.read_csv(target_path, dtype=str, low_memory=False)
            df = df.fillna("")
        else:
            df = pd.DataFrame(columns=[
                "Date Published", "Product Title", "Advisory Title", "Category", "Post Link"
            ])

        db_advisories = db.query(UnregisteredAdvisory).all()
        if not db_advisories and not target_path.exists():
            return

        records = df.to_dict(orient="records")

        # Fast O(1) index lookup by Product Title
        title_to_idx = {}
        for i, r in enumerate(records):
            title = str(r.get("Product Title", "")).strip().upper()
            if title:
                title_to_idx[title] = i

        removed_indices = set()

        for a in db_advisories:
            product_title = (a.product_name or "").strip()
            if not product_title:
                continue

            lookup_key = product_title.upper()
            is_deleted = a.deleted_at is not None

            if is_deleted:
                if lookup_key in title_to_idx:
                    removed_indices.add(title_to_idx[lookup_key])
            else:
                cleaned_title_str = clean_title(product_title)

                date_str = ""
                if a.advisory_date:
                    if isinstance(a.advisory_date, (datetime, date)):
                        date_str = f"{a.advisory_date.day} {a.advisory_date.strftime('%B %Y')}"
                    else:
                        try:
                            parsed_dt = pd.to_datetime(a.advisory_date)
                            date_str = f"{parsed_dt.day} {parsed_dt.strftime('%B %Y')}"
                        except Exception:
                            date_str = str(a.advisory_date).strip()

                updated_record = {
                    "Date Published": date_str,
                    "Product Title": cleaned_title_str,
                    "Advisory Title": a.advisory_details or "",
                    "Category": "Cosmetic Advisories",
                    "Post Link": a.source_url or "",
                }

                if lookup_key in title_to_idx:
                    idx = title_to_idx[lookup_key]
                    records[idx].update(updated_record)
                else:
                    records.append(updated_record)
                    title_to_idx[lookup_key] = len(records) - 1

        if removed_indices:
            records = [r for idx, r in enumerate(records) if idx not in removed_indices]

        new_df = pd.DataFrame(records)
        new_df.to_csv(target_path, index=False)
        logger.info("Successfully synced database unregistered advisories to %s (total rows: %d)", target_path, len(new_df))
        print(f"Successfully synced database changes to {target_path}.", file=sys.stderr)

        # Trigger hot rebuild & reload of NLP vector assets in background
        try:
            from nlp.retrieval.asset_sync import trigger_unregistered_rebuild_async
            trigger_unregistered_rebuild_async()
            logger.info("Triggered async NLP asset rebuild and hot-reload for unregistered advisories.")
        except Exception as sync_err:
            logger.warning("Could not trigger NLP asset rebuild: %s", sync_err)
    except Exception as e:
        logger.error("Error syncing unregistered advisories to CSV: %s", e, exc_info=True)
        print(f"Warning: Error syncing unregistered advisories to CSV: {e}", file=sys.stderr)
