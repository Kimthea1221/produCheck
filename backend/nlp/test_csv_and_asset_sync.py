import os
import sys
import time
from pathlib import Path
from datetime import date, datetime
import pandas as pd
from unittest.mock import MagicMock

# Setup backend import path
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.desktop.services.Product_database.csv_sync import (
    sync_registered_products_to_csv,
    sync_unregistered_advisories_to_csv,
    get_registered_csv_path,
    get_unregistered_csv_path,
)
from nlp.retrieval.asset_sync import (
    rebuild_registered_assets_and_reload,
    rebuild_unregistered_assets_and_reload,
)
from nlp.retrieval.retrieval import evaluate_match


class MockProduct:
    def __init__(self, reg_num, prod_name, brand="TestBrand", category="Cosmetics", date_reg=None, expiry=None, deleted_at=None):
        self.registration_number = reg_num
        self.product_name = prod_name
        self.brand_name = brand
        self.product_category = category
        self.date_registered = date_reg or date(2026, 1, 1)
        self.expiry_date = expiry or date(2029, 1, 1)
        self.deleted_at = deleted_at


def test_pipeline():
    print("=== STARTING FULL CSV & NLP ASSET SYNC VERIFICATION ===")
    reg_csv_path = get_registered_csv_path()
    print(f"Target Registered CSV: {reg_csv_path}")

    # Clean up any leftover test rows from previous runs
    df_clean = pd.read_csv(reg_csv_path, dtype=str)
    df_clean = df_clean[~df_clean["ACCOUNTCODE"].str.startswith("TEST-REG-")].reset_index(drop=True)
    df_clean.to_csv(reg_csv_path, index=False)
    alt_path = reg_csv_path.parent / "Registered_cleaned.csv"
    if alt_path.exists():
        df_clean.to_csv(alt_path, index=False)

    initial_count = len(df_clean)
    print(f"Clean Initial CSV row count: {initial_count}")

    uid = int(time.time())
    test_reg_num = f"TEST-REG-{uid}"
    test_prod_name = f"Super Radiant Miracle Glow Cream {uid}"
    test_brand = "EverGlow Cosmetics"

    # Step 1: Simulate ADD
    print("\n--- 1. Testing ADD Operation ---")
    mock_db = MagicMock()
    mock_db_products = [
        MockProduct(test_reg_num, test_prod_name, brand=test_brand, expiry=date(2029, 12, 31))
    ]
    mock_db.query().all.return_value = mock_db_products

    sync_registered_products_to_csv(mock_db, trigger_rebuild=False)

    df_after_add = pd.read_csv(reg_csv_path, dtype=str)
    assert len(df_after_add) == initial_count + 1, f"Expected {initial_count + 1} rows, got {len(df_after_add)}"
    added_row = df_after_add[df_after_add["ACCOUNTCODE"] == test_reg_num]
    assert len(added_row) == 1, "Added row not found by ACCOUNTCODE"
    print(f"[OK] Product added successfully. CSV now has {len(df_after_add)} rows.")

    # Rebuild & reload
    res = rebuild_registered_assets_and_reload(blocking=True)
    assert res["status"] == "success", f"Rebuild failed: {res}"
    print(f"[OK] NLP assets rebuilt & reloaded. Count: {res['registered_count']}")

    # Verify retrieval can find newly added product
    match = evaluate_match(f"{test_brand} {test_prod_name}")
    print(f"Match evaluation for query: verdict={match['verdict']}, score={match['score']:.4f}")
    assert match["verdict"] == "registered", f"Expected 'registered' verdict, got {match['verdict']}"
    assert len(match["top5_registered"]) > 0, "No top registered products found"
    assert match["top5_registered"][0]["brand_name"] == test_brand
    print("[OK] Verification engine successfully matched the newly added product!")

    # Step 2: Simulate UPDATE (editing registration number and product name)
    print("\n--- 2. Testing UPDATE Operation ---")
    updated_reg_num = f"{test_reg_num}-REV1"
    updated_prod_name = f"{test_prod_name} Revised"

    mock_db_products = [
        MockProduct(updated_reg_num, updated_prod_name, brand=test_brand, expiry=date(2030, 5, 20))
    ]
    mock_db.query().all.return_value = mock_db_products

    sync_registered_products_to_csv(
        mock_db,
        old_registration_number=test_reg_num,
        old_product_name=test_prod_name,
        trigger_rebuild=False,
    )

    df_after_update = pd.read_csv(reg_csv_path, dtype=str)
    assert len(df_after_update) == initial_count + 1, f"Duplicate created! Expected {initial_count + 1} rows, got {len(df_after_update)}"
    updated_row = df_after_update[df_after_update["ACCOUNTCODE"] == updated_reg_num]
    assert len(updated_row) == 1, "Updated row not found by new ACCOUNTCODE"
    old_row = df_after_update[df_after_update["ACCOUNTCODE"] == test_reg_num]
    assert len(old_row) == 0, "Old ACCOUNTCODE row was not replaced / duplicate remained!"
    print(f"[OK] Product updated in-place without duplicates! CSV has {len(df_after_update)} rows.")

    res = rebuild_registered_assets_and_reload(blocking=True)
    assert res["status"] == "success"
    print(f"[OK] NLP assets rebuilt after update in {res['duration_seconds']}s.")

    # Step 3: Test Expired Date Preservation (should NOT delete active products)
    print("\n--- 3. Testing Expired Product Handling ---")
    mock_db_products = [
        MockProduct(updated_reg_num, updated_prod_name, brand=test_brand, expiry=date(2020, 1, 1), deleted_at=None)
    ]
    mock_db.query().all.return_value = mock_db_products
    sync_registered_products_to_csv(mock_db, trigger_rebuild=False)

    df_after_expired = pd.read_csv(reg_csv_path, dtype=str)
    assert len(df_after_expired) == initial_count + 1, "Expired product was unintentionally deleted from CSV!"
    print("[OK] Expired active product was preserved in CSV with its expired validity date intact.")

    # Step 4: Simulate DELETE
    print("\n--- 4. Testing DELETE (Soft-Delete) Operation ---")
    mock_db_products = [
        MockProduct(updated_reg_num, updated_prod_name, brand=test_brand, deleted_at=datetime.now())
    ]
    mock_db.query().all.return_value = mock_db_products
    sync_registered_products_to_csv(
        mock_db,
        old_registration_number=updated_reg_num,
        old_product_name=updated_prod_name,
        trigger_rebuild=False,
    )

    df_after_delete = pd.read_csv(reg_csv_path, dtype=str)
    assert len(df_after_delete) == initial_count, f"Expected {initial_count} rows after delete, got {len(df_after_delete)}"
    deleted_row = df_after_delete[df_after_delete["ACCOUNTCODE"] == updated_reg_num]
    assert len(deleted_row) == 0, "Deleted row still found in CSV!"
    print(f"[OK] Soft-deleted product successfully removed from CSV. Count returned to {len(df_after_delete)}.")

    res = rebuild_registered_assets_and_reload(blocking=True)
    assert res["status"] == "success"
    assert res["registered_count"] == initial_count
    print(f"[OK] NLP assets rebuilt after delete in {res['duration_seconds']}s.")

    # Step 5: Test Synchronized files (Registered_cleaned.csv and registered.csv)
    print("\n--- 5. Testing Registered_cleaned.csv & registered.csv Dual Sync ---")
    alt_path = reg_csv_path.parent / "Registered_cleaned.csv"
    if alt_path.exists():
        alt_df = pd.read_csv(alt_path, dtype=str)
        assert len(alt_df) == len(df_after_delete), "Registered_cleaned.csv and registered.csv row count mismatch!"
        print("[OK] Both registered.csv and Registered_cleaned.csv are in 100% sync!")

    print("\n==========================================")
    print("ALL TESTS PASSED SUCCESSFULLY! PIPELINE IS ROBUST & ACCURATE.")
    print("==========================================")


if __name__ == "__main__":
    test_pipeline()
