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
    for name in ("registered.csv", "Registered_cleaned.csv", "registered_cleaned.csv"):
        p = datasets_dir / name
        if p.exists():
            return p
    return datasets_dir / "registered.csv"


def get_unregistered_csv_path() -> Path:
    datasets_dir = get_datasets_dir()
    datasets_dir.mkdir(parents=True, exist_ok=True)
    for name in ("unregistered.csv", "Unregistered_cleaned.csv", "unregistered_cleaned.csv"):
        p = datasets_dir / name
        if p.exists():
            return p
    return datasets_dir / "unregistered.csv"


# Module-level paths for direct access / backwards compatibility
DATASETS_DIR = get_datasets_dir()
REGISTERED_CSV_PATH = get_registered_csv_path()
UNREGISTERED_CSV_PATH = get_unregistered_csv_path()

REGISTERED_COLUMNS = [
    "ACCOUNTCODE", "PRODUCT_NAME", "BRAND_NAME", "PROD_VARIANTS",
    "PRODUCT_INTENDED_USE", "COMPANY_NAME", "NOTIFICATION_DECISION_DATE",
    "NOTIFICATION_VALIDITY", "NOTIFICATION_DECISION"
]

UNREGISTERED_COLUMNS = [
    "Date Published", "Product Title", "Advisory Title", "Category", "Post Link"
]


def sync_registered_products_to_csv(
    db: Session,
    old_registration_number: str | None = None,
    old_product_name: str | None = None,
    trigger_rebuild: bool = True,
):
    """
    Syncs database registered products changes into registered.csv.
    Maintains existing rows while updating or appending new active products,
    and removing any deleted products from the database.
    Preserves original columns, formats, and non-DB metadata like COMPANY_NAME.
    """
    target_path = get_registered_csv_path()
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)

        df = None
        if target_path.exists():
            try:
                df = pd.read_csv(target_path, dtype=str, low_memory=False).fillna("")
            except pd.errors.EmptyDataError:
                df = None

        if df is None or len(df) == 0:
            for fallback_name in ("Registered_cleaned.csv", "registered_cleaned.csv", "registered.csv"):
                fb = target_path.parent / fallback_name
                if fb.exists() and fb != target_path:
                    try:
                        fb_df = pd.read_csv(fb, dtype=str, low_memory=False).fillna("")
                        if len(fb_df) > 0:
                            df = fb_df
                            break
                    except Exception:
                        pass

        if df is None:
            df = pd.DataFrame(columns=REGISTERED_COLUMNS)

        db_products = db.query(RegisteredProduct).all()
        if not db_products and len(df) == 0:
            return

        records = df.to_dict(orient="records")

        # Fast O(1) multi-index lookups by ACCOUNTCODE and normalized PRODUCT_NAME
        code_to_indices = {}
        title_to_indices = {}

        for i, r in enumerate(records):
            code = str(r.get("ACCOUNTCODE", "")).strip().upper()
            if code:
                code_to_indices.setdefault(code, []).append(i)

            title = clean_title(str(r.get("PRODUCT_NAME", ""))).strip().upper()
            if title:
                title_to_indices.setdefault(title, []).append(i)

        removed_indices = set()

        for p in db_products:
            reg_num = (p.registration_number or "").strip()
            prod_name = (p.product_name or "").strip()
            if not reg_num and not prod_name:
                continue

            lookup_code = reg_num.upper() if reg_num else ""
            lookup_title = clean_title(prod_name).upper() if prod_name else ""

            # Check for matches
            matching_idxs = []
            if lookup_code and lookup_code in code_to_indices:
                matching_idxs.extend(code_to_indices[lookup_code])
            if lookup_title and lookup_title in title_to_indices:
                matching_idxs.extend(title_to_indices[lookup_title])

            # Also check old values if this product was updated
            if old_registration_number:
                old_c = str(old_registration_number).strip().upper()
                if old_c and old_c in code_to_indices:
                    matching_idxs.extend(code_to_indices[old_c])
            if old_product_name:
                old_t = clean_title(str(old_product_name)).strip().upper()
                if old_t and old_t in title_to_indices:
                    matching_idxs.extend(title_to_indices[old_t])

            seen = set()
            unique_matches = []
            for m in matching_idxs:
                if m not in seen and m not in removed_indices:
                    seen.add(m)
                    unique_matches.append(m)

            # Soft delete check: only deleted_at determines deletion
            is_deleted = p.deleted_at is not None

            if is_deleted:
                for m in unique_matches:
                    removed_indices.add(m)
            else:
                cleaned_name = clean_title(prod_name)

                date_str = ""
                if p.date_registered:
                    if isinstance(p.date_registered, (datetime, date)):
                        date_str = p.date_registered.strftime("%d %B %Y")
                    else:
                        try:
                            parsed_dt = pd.to_datetime(p.date_registered)
                            date_str = parsed_dt.strftime("%d %B %Y")
                        except Exception:
                            date_str = str(p.date_registered).strip()

                expiry_str = ""
                if p.expiry_date:
                    if isinstance(p.expiry_date, (datetime, date)):
                        expiry_str = p.expiry_date.strftime("%d %B %Y")
                    else:
                        try:
                            parsed_dt = pd.to_datetime(p.expiry_date)
                            expiry_str = parsed_dt.strftime("%d %B %Y")
                        except Exception:
                            expiry_str = str(p.expiry_date).strip()

                if unique_matches:
                    # Update first matching record, preserving any extra columns/metadata
                    idx = unique_matches[0]
                    records[idx]["ACCOUNTCODE"] = reg_num
                    records[idx]["PRODUCT_NAME"] = cleaned_name
                    if p.brand_name is not None:
                        records[idx]["BRAND_NAME"] = p.brand_name
                    records[idx]["PRODUCT_INTENDED_USE"] = p.product_category or records[idx].get("PRODUCT_INTENDED_USE", "Cosmetics")
                    if date_str:
                        records[idx]["NOTIFICATION_DECISION_DATE"] = date_str
                    if expiry_str:
                        records[idx]["NOTIFICATION_VALIDITY"] = expiry_str
                    if not records[idx].get("NOTIFICATION_DECISION"):
                        records[idx]["NOTIFICATION_DECISION"] = "1"

                    # Deduplicate any extra duplicate matches in CSV
                    for extra_idx in unique_matches[1:]:
                        removed_indices.add(extra_idx)
                else:
                    new_rec = {
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
                    records.append(new_rec)
                    new_idx = len(records) - 1
                    if lookup_code:
                        code_to_indices.setdefault(lookup_code, []).append(new_idx)
                    if lookup_title:
                        title_to_indices.setdefault(lookup_title, []).append(new_idx)

        if removed_indices:
            records = [r for idx, r in enumerate(records) if idx not in removed_indices]

        new_df = pd.DataFrame(records)

        # Preserve original column order
        col_order = [c for c in df.columns if c in new_df.columns]
        for c in REGISTERED_COLUMNS:
            if c not in col_order and c in new_df.columns:
                col_order.append(c)
        for c in new_df.columns:
            if c not in col_order:
                col_order.append(c)
        new_df = new_df[col_order]

        new_df.to_csv(target_path, index=False)
        logger.info("Successfully synced database registered products to %s (total rows: %d)", target_path, len(new_df))
        print(f"Successfully synced database changes to {target_path}.", file=sys.stderr)

        # Keep alternate registered filename in sync if present
        for alt_name in ("registered.csv", "Registered_cleaned.csv"):
            alt_path = target_path.parent / alt_name
            if alt_path != target_path:
                try:
                    new_df.to_csv(alt_path, index=False)
                except Exception:
                    pass

        # Trigger hot rebuild & reload of registered NLP vector assets in background
        if trigger_rebuild:
            try:
                from nlp.retrieval.asset_sync import trigger_registered_rebuild_async
                trigger_registered_rebuild_async()
                logger.info("Triggered async NLP asset rebuild and hot-reload for registered products.")
                print("[NLP-Sync] Triggered background rebuild and hot-reload of registered assets.", file=sys.stderr, flush=True)
            except Exception as sync_err:
                logger.warning("Could not trigger NLP registered asset rebuild: %s", sync_err)
                print(f"[NLP-Sync] Warning: Could not trigger NLP registered asset rebuild: {sync_err}", file=sys.stderr, flush=True)
    except Exception as e:
        logger.error("Error syncing registered products to CSV: %s", e, exc_info=True)
        print(f"Warning: Error syncing registered products to CSV: {e}", file=sys.stderr)


def sync_unregistered_advisories_to_csv(
    db: Session,
    old_product_name: str | None = None,
    trigger_rebuild: bool = True,
):
    """
    Syncs database unregistered advisories changes into unregistered.csv.
    Maintains existing rows while updating or appending new active advisories,
    and removing any deleted advisories from the database.
    """
    target_path = get_unregistered_csv_path()
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)

        df = None
        if target_path.exists():
            try:
                df = pd.read_csv(target_path, dtype=str, low_memory=False).fillna("")
            except pd.errors.EmptyDataError:
                df = None

        if df is None or len(df) == 0:
            for fallback_name in ("Unregistered_cleaned.csv", "unregistered_cleaned.csv", "unregistered.csv"):
                fb = target_path.parent / fallback_name
                if fb.exists() and fb != target_path:
                    try:
                        fb_df = pd.read_csv(fb, dtype=str, low_memory=False).fillna("")
                        if len(fb_df) > 0:
                            df = fb_df
                            break
                    except Exception:
                        pass

        if df is None:
            df = pd.DataFrame(columns=UNREGISTERED_COLUMNS)

        db_advisories = db.query(UnregisteredAdvisory).all()
        if not db_advisories and len(df) == 0:
            return

        records = df.to_dict(orient="records")

        # Fast O(1) multi-index lookup by Product Title
        title_to_indices = {}
        for i, r in enumerate(records):
            title = clean_title(str(r.get("Product Title", ""))).strip().upper()
            if title:
                title_to_indices.setdefault(title, []).append(i)

        removed_indices = set()

        for a in db_advisories:
            product_title = (a.product_name or "").strip()
            if not product_title:
                continue

            lookup_title = clean_title(product_title).upper()

            matching_idxs = []
            if lookup_title in title_to_indices:
                matching_idxs.extend(title_to_indices[lookup_title])

            if old_product_name:
                old_t = clean_title(str(old_product_name)).strip().upper()
                if old_t and old_t in title_to_indices:
                    matching_idxs.extend(title_to_indices[old_t])

            seen = set()
            unique_matches = []
            for m in matching_idxs:
                if m not in seen and m not in removed_indices:
                    seen.add(m)
                    unique_matches.append(m)

            is_deleted = a.deleted_at is not None

            if is_deleted:
                for m in unique_matches:
                    removed_indices.add(m)
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

                if unique_matches:
                    idx = unique_matches[0]
                    records[idx].update(updated_record)
                    for extra_idx in unique_matches[1:]:
                        removed_indices.add(extra_idx)
                else:
                    records.append(updated_record)
                    new_idx = len(records) - 1
                    title_to_indices.setdefault(lookup_title, []).append(new_idx)

        if removed_indices:
            records = [r for idx, r in enumerate(records) if idx not in removed_indices]

        new_df = pd.DataFrame(records)

        col_order = [c for c in df.columns if c in new_df.columns]
        for c in UNREGISTERED_COLUMNS:
            if c not in col_order and c in new_df.columns:
                col_order.append(c)
        for c in new_df.columns:
            if c not in col_order:
                col_order.append(c)
        new_df = new_df[col_order]

        new_df.to_csv(target_path, index=False)
        logger.info("Successfully synced database unregistered advisories to %s (total rows: %d)", target_path, len(new_df))
        print(f"Successfully synced database changes to {target_path}.", file=sys.stderr)

        for alt_name in ("unregistered.csv", "Unregistered_cleaned.csv"):
            alt_path = target_path.parent / alt_name
            if alt_path != target_path:
                try:
                    new_df.to_csv(alt_path, index=False)
                except Exception:
                    pass

        # Trigger hot rebuild & reload of NLP vector assets in background
        if trigger_rebuild:
            try:
                from nlp.retrieval.asset_sync import trigger_unregistered_rebuild_async
                trigger_unregistered_rebuild_async()
                logger.info("Triggered async NLP asset rebuild and hot-reload for unregistered advisories.")
                print("[NLP-Sync] Triggered background rebuild and hot-reload of unregistered assets.", file=sys.stderr, flush=True)
            except Exception as sync_err:
                logger.warning("Could not trigger NLP asset rebuild: %s", sync_err)
                print(f"[NLP-Sync] Warning: Could not trigger NLP asset rebuild: {sync_err}", file=sys.stderr, flush=True)
    except Exception as e:
        logger.error("Error syncing unregistered advisories to CSV: %s", e, exc_info=True)
        print(f"Warning: Error syncing unregistered advisories to CSV: {e}", file=sys.stderr)
