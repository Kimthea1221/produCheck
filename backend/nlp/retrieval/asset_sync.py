import logging
import os
import pickle
import re
import sys
import threading
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, Optional

import faiss
import numpy as np
import pandas as pd
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from rank_bm25 import BM25Okapi

from nlp.retrieval.retrieval import (
    clean_productTitle,
    finetuned_model,
    reload_retrieval_assets,
    registered_df,
)

logger = logging.getLogger(__name__)

_SYNC_LOCK = threading.Lock()
_REG_SYNC_LOCK = threading.Lock()

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent


def get_paths():
    """Resolve datasets and assets directories dynamically."""
    custom_datasets = os.getenv("DATASETS_DIR")
    if custom_datasets and Path(custom_datasets).exists():
        datasets_dir = Path(custom_datasets)
    elif Path("/everifymo/backend/nlp/datasets").exists():
        datasets_dir = Path("/everifymo/backend/nlp/datasets")
    elif (BASE_DIR.parent / "datasets").exists():
        datasets_dir = BASE_DIR.parent / "datasets"
    else:
        datasets_dir = BASE_DIR.parent / "datasets"

    custom_assets = os.getenv("ASSET_DIR") or os.getenv("NLP_ASSETS_DIR")
    if custom_assets and Path(custom_assets).exists():
        assets_dir = Path(custom_assets)
    elif Path("/everifymo/backend/nlp/assets").exists():
        assets_dir = Path("/everifymo/backend/nlp/assets")
    elif (BASE_DIR.parent / "assets").exists():
        assets_dir = BASE_DIR.parent / "assets"
    else:
        assets_dir = BASE_DIR.parent / "assets"

    assets_dir.mkdir(parents=True, exist_ok=True)
    return datasets_dir, assets_dir


def _norm_key(s: Any) -> str:
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode()
    s = s.lower()
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def rebuild_unregistered_assets_and_reload(blocking: bool = False) -> Dict[str, Any]:
    """
    Rebuilds unregistered NLP assets (cleaned dataframe, BM25, embeddings, FAISS index)
    and hot-reloads them in memory in the running FastAPI process.
    Thread-safe and uses incremental vector caching to complete in ~2-3 seconds.
    """
    if not _SYNC_LOCK.acquire(blocking=blocking):
        logger.info("An asset sync is already in progress, skipping duplicate trigger.")
        return {"status": "skipped", "message": "Sync already in progress"}

    start_time = time.time()
    try:
        datasets_dir, assets_dir = get_paths()
        unreg_csv_path = datasets_dir / "unregistered.csv"
        if not unreg_csv_path.exists():
            for fallback_name in ("Unregistered_cleaned.csv", "unregistered_cleaned.csv"):
                fb = datasets_dir / fallback_name
                if fb.exists():
                    unreg_csv_path = fb
                    break

        if not unreg_csv_path.exists():
            logger.warning("Unregistered CSV not found at %s", unreg_csv_path)
            return {"status": "error", "message": f"CSV not found: {unreg_csv_path}"}

        logger.info("Starting fast rebuild of unregistered NLP assets from %s...", unreg_csv_path)
        print(f"[NLP-Sync] Starting fast rebuild of unregistered NLP assets from {unreg_csv_path.name}...", file=sys.stderr, flush=True)

        # 1. Read raw unregistered CSV
        try:
            raw_df = pd.read_csv(unreg_csv_path, dtype=str, low_memory=False)
            raw_df = raw_df.fillna("")
        except pd.errors.EmptyDataError:
            raw_df = pd.DataFrame(columns=["Date Published", "Product Title", "Advisory Title", "Category", "Post Link"])

        raw_df.columns = [c.strip() for c in raw_df.columns]
        col_map = {c.upper(): c for c in raw_df.columns}
        if "PRODUCT TITLE" not in col_map:
            logger.error("'Product Title' column missing from %s", unreg_csv_path)
            return {"status": "error", "message": "Missing 'Product Title' column in CSV"}
        title_col = col_map["PRODUCT TITLE"]

        # 2. Filter overlap against registered products
        try:
            reg_keys = set(registered_df['cleaned_title'].apply(_norm_key))
        except Exception:
            reg_keys = set()

        raw_df['norm_key'] = raw_df[title_col].apply(_norm_key)
        overlap_mask = raw_df['norm_key'].isin(reg_keys)
        cleaned_df = raw_df[~overlap_mask].reset_index(drop=True)
        cleaned_df = cleaned_df.drop(columns='norm_key')

        # 3. Clean product titles and drop duplicates
        cleaned_df['cleaned_title'] = cleaned_df[title_col].apply(clean_productTitle)
        cleaned_df = cleaned_df[cleaned_df['cleaned_title'].str.strip() != ""]
        cleaned_df = cleaned_df.drop_duplicates(subset='cleaned_title', keep='first')
        cleaned_df = cleaned_df.reset_index(drop=True)

        # 4. Tokenize for BM25 with caching
        prev_pkl_path = assets_dir / "unregistered_cleaned.pkl"
        if not prev_pkl_path.exists():
            prev_pkl_path = assets_dir / "Unregistered_cleaned.pkl"

        cached_tokens: Dict[str, list] = {}
        cached_filtered: Dict[str, list] = {}
        if prev_pkl_path.exists():
            try:
                prev_df_tok = pd.read_pickle(prev_pkl_path)
                if 'cleaned_title' in prev_df_tok.columns and 'tokens' in prev_df_tok.columns and 'filtered' in prev_df_tok.columns:
                    for info, tok, filt in zip(prev_df_tok['cleaned_title'], prev_df_tok['tokens'], prev_df_tok['filtered']):
                        norm_info = re.sub(r'\s+', ' ', str(info)).strip()
                        if norm_info and norm_info not in cached_tokens:
                            cached_tokens[norm_info] = tok
                            cached_filtered[norm_info] = filt
            except Exception as e:
                logger.warning("Could not load unregistered tokens cache: %s", e)

        try:
            stop_words = set(stopwords.words("english"))
        except Exception:
            stop_words = set()

        all_tokens = []
        all_filtered = []
        for raw_info in cleaned_df['cleaned_title']:
            norm_info = re.sub(r'\s+', ' ', str(raw_info)).strip()
            if norm_info in cached_tokens:
                all_tokens.append(cached_tokens[norm_info])
                all_filtered.append(cached_filtered[norm_info])
            else:
                tok = word_tokenize(norm_info)
                filt = [w for w in tok if w not in stop_words]
                cached_tokens[norm_info] = tok
                cached_filtered[norm_info] = filt
                all_tokens.append(tok)
                all_filtered.append(filt)

        cleaned_df['tokens'] = all_tokens
        cleaned_df['filtered'] = all_filtered

        n_rows = len(cleaned_df)
        logger.info("Cleaned %d unregistered rows (took %.2fs)", n_rows, time.time() - start_time)

        # 5. Smart Vector Caching: Reuse existing vectors where available
        emb_path = assets_dir / "sbert_unregistered_embeddings_finetuned.npy"
        if not emb_path.exists():
            emb_path = assets_dir / "unregistered_embeddings.npy"

        cached_vecs: Dict[str, np.ndarray] = {}
        if prev_pkl_path.exists() and emb_path.exists():
            try:
                prev_df = pd.read_pickle(prev_pkl_path)
                prev_emb = np.load(emb_path)
                min_len = min(len(prev_df), prev_emb.shape[0])
                for idx in range(min_len):
                    title = re.sub(r'\s+', ' ', str(prev_df['cleaned_title'].iloc[idx])).strip()
                    if title and title not in cached_vecs:
                        cached_vecs[title] = prev_emb[idx]
            except Exception as cache_err:
                logger.warning("Could not load previous vector cache: %s", cache_err)

        # Determine which titles genuinely need encoding
        titles_to_encode = []
        title_to_idx = {}
        for raw_title in cleaned_df['cleaned_title']:
            title = re.sub(r'\s+', ' ', str(raw_title)).strip()
            if title not in cached_vecs and title not in title_to_idx:
                title_to_idx[title] = len(titles_to_encode)
                titles_to_encode.append(title)

        if titles_to_encode:
            logger.info("Encoding %d newly added titles with SentenceTransformer...", len(titles_to_encode))
            print(f"[NLP-Sync] Encoding {len(titles_to_encode)} new titles with SentenceTransformer...", file=sys.stderr, flush=True)
            new_vecs = finetuned_model.encode(
                titles_to_encode,
                batch_size=128,
                show_progress_bar=False,
                convert_to_numpy=True,
            ).astype("float32")
            faiss.normalize_L2(new_vecs)
            for title, enc_idx in title_to_idx.items():
                cached_vecs[title] = new_vecs[enc_idx]
        else:
            logger.info("All %d titles already have cached embeddings.", n_rows)
            print(f"[NLP-Sync] All {n_rows} titles have cached embeddings.", file=sys.stderr, flush=True)

        if n_rows > 0:
            final_embeddings = np.array([
                cached_vecs[re.sub(r'\s+', ' ', str(t)).strip()]
                for t in cleaned_df['cleaned_title']
            ], dtype="float32")
            d = final_embeddings.shape[1]
            unreg_index = faiss.IndexFlatIP(d)
            unreg_index.add(final_embeddings)
            bm25_unreg = BM25Okapi([[str(w).lower() for w in doc] for doc in cleaned_df['filtered'].tolist()])
        else:
            final_embeddings = np.empty((0, 768), dtype="float32")
            unreg_index = faiss.IndexFlatIP(768)
            bm25_unreg = BM25Okapi([['empty']])

        # 8. Save primary files then aliases
        cleaned_df.to_pickle(assets_dir / "unregistered_cleaned.pkl")
        with open(assets_dir / "unreg_bm25.pkl", "wb") as f:
            pickle.dump(bm25_unreg, f)
        np.save(assets_dir / "sbert_unregistered_embeddings_finetuned.npy", final_embeddings)
        faiss.write_index(unreg_index, str(assets_dir / "faiss_unregistered.index"))

        for pkl_name in ("Unregistered_cleaned.pkl",):
            try:
                cleaned_df.to_pickle(assets_dir / pkl_name)
            except Exception:
                pass

        for bm25_name in ("bm25_unregistered.pkl",):
            try:
                with open(assets_dir / bm25_name, "wb") as f:
                    pickle.dump(bm25_unreg, f)
            except Exception:
                pass

        for emb_name in ("unregistered_embeddings.npy",):
            try:
                np.save(assets_dir / emb_name, final_embeddings)
            except Exception:
                pass

        for idx_name in ("unregistered.index",):
            try:
                faiss.write_index(unreg_index, str(assets_dir / idx_name))
            except Exception:
                pass

        # 9. Hot reload in-memory globals (unregistered only)
        reload_result = reload_retrieval_assets(reload_registered=False, reload_unregistered=True)

        total_duration = time.time() - start_time
        logger.info(
            "Unregistered NLP assets successfully rebuilt & reloaded in %.2fs! Total rows: %d",
            total_duration,
            n_rows,
        )
        print(f"[NLP-Sync] Hot-reload complete in {total_duration:.2f}s! In-memory unregistered count: {n_rows}", file=sys.stderr, flush=True)
        return {
            "status": "success",
            "unregistered_count": n_rows,
            "duration_seconds": round(total_duration, 2),
            "reload_result": reload_result,
        }

    except Exception as exc:
        logger.error("Error rebuilding unregistered NLP assets: %s", exc, exc_info=True)
        print(f"[NLP-Sync] ERROR rebuilding unregistered NLP assets: {exc}", file=sys.stderr, flush=True)
        return {"status": "error", "message": str(exc)}
    finally:
        _SYNC_LOCK.release()


def trigger_unregistered_rebuild_async():
    """Triggers unregistered asset rebuild in a background daemon thread."""
    thread = threading.Thread(
        target=rebuild_unregistered_assets_and_reload,
        name="NLP-Unreg-AssetSync",
        daemon=True,
    )
    thread.start()
    return thread


def rebuild_registered_assets_and_reload(blocking: bool = False) -> Dict[str, Any]:
    """
    Rebuilds registered NLP assets (cleaned dataframe, BM25, embeddings, FAISS index)
    and hot-reloads them in memory in the running FastAPI process.
    Thread-safe and uses incremental token & vector caching to complete in ~1-3 seconds.
    """
    if not _REG_SYNC_LOCK.acquire(blocking=blocking):
        logger.info("A registered asset sync is already in progress, skipping duplicate trigger.")
        return {"status": "skipped", "message": "Registered sync already in progress"}

    start_time = time.time()
    try:
        datasets_dir, assets_dir = get_paths()
        reg_csv_path = datasets_dir / "registered.csv"
        if not reg_csv_path.exists():
            for fallback_name in ("Registered_cleaned.csv", "registered_cleaned.csv"):
                fb = datasets_dir / fallback_name
                if fb.exists():
                    reg_csv_path = fb
                    break

        if not reg_csv_path.exists():
            logger.warning("Registered CSV not found at %s", reg_csv_path)
            return {"status": "error", "message": f"CSV not found: {reg_csv_path}"}

        logger.info("Starting fast rebuild of registered NLP assets from %s...", reg_csv_path)
        print(f"[NLP-Sync] Starting fast rebuild of registered NLP assets from {reg_csv_path.name}...", file=sys.stderr, flush=True)

        # 1. Read raw registered CSV
        try:
            raw_df = pd.read_csv(reg_csv_path, dtype=str, low_memory=False)
            raw_df = raw_df.fillna("")
        except pd.errors.EmptyDataError:
            raw_df = pd.DataFrame(columns=[
                "ACCOUNTCODE", "PRODUCT_NAME", "BRAND_NAME", "PROD_VARIANTS",
                "PRODUCT_INTENDED_USE", "COMPANY_NAME", "NOTIFICATION_DECISION_DATE",
                "NOTIFICATION_VALIDITY", "NOTIFICATION_DECISION"
            ])

        raw_df.columns = [c.strip() for c in raw_df.columns]
        col_map = {c.upper(): c for c in raw_df.columns}
        if "PRODUCT_NAME" not in col_map:
            logger.error("'PRODUCT_NAME' column missing from %s", reg_csv_path)
            return {"status": "error", "message": "Missing 'PRODUCT_NAME' column in CSV"}
        prod_col = col_map["PRODUCT_NAME"]
        brand_col = col_map.get("BRAND_NAME")

        # 2. Clean product titles and drop duplicates
        raw_df['cleaned_title'] = raw_df[prod_col].apply(clean_productTitle)
        cleaned_df = raw_df[raw_df['cleaned_title'].str.strip() != ""]
        cleaned_df = cleaned_df.drop_duplicates(subset='cleaned_title', keep='first')
        cleaned_df = cleaned_df.reset_index(drop=True)

        if brand_col:
            cleaned_df['full_product_info'] = (
                cleaned_df[brand_col].fillna('') + ' ' + cleaned_df['cleaned_title'].fillna('')
            ).str.strip()
        else:
            cleaned_df['full_product_info'] = cleaned_df['cleaned_title'].str.strip()

        # 3. Tokenize for BM25 with caching to prevent re-tokenizing 94k rows on each update
        prev_pkl_path = assets_dir / "registered_cleaned.pkl"
        if not prev_pkl_path.exists():
            prev_pkl_path = assets_dir / "Registered_cleaned.pkl"

        cached_tokens: Dict[str, list] = {}
        cached_filtered: Dict[str, list] = {}
        if prev_pkl_path.exists():
            try:
                prev_df_tok = pd.read_pickle(prev_pkl_path)
                if 'full_product_info' in prev_df_tok.columns and 'tokens' in prev_df_tok.columns and 'filtered' in prev_df_tok.columns:
                    for info, tok, filt in zip(prev_df_tok['full_product_info'], prev_df_tok['tokens'], prev_df_tok['filtered']):
                        norm_info = re.sub(r'\s+', ' ', str(info)).strip()
                        if norm_info and norm_info not in cached_tokens:
                            cached_tokens[norm_info] = tok
                            cached_filtered[norm_info] = filt
            except Exception as e:
                logger.warning("Could not load registered tokens cache: %s", e)

        try:
            stop_words = set(stopwords.words("english"))
        except Exception:
            stop_words = set()

        all_tokens = []
        all_filtered = []
        for raw_info in cleaned_df['full_product_info']:
            norm_info = re.sub(r'\s+', ' ', str(raw_info)).strip()
            if norm_info in cached_tokens:
                all_tokens.append(cached_tokens[norm_info])
                all_filtered.append(cached_filtered[norm_info])
            else:
                tok = word_tokenize(norm_info)
                filt = [w for w in tok if w not in stop_words]
                cached_tokens[norm_info] = tok
                cached_filtered[norm_info] = filt
                all_tokens.append(tok)
                all_filtered.append(filt)

        cleaned_df['tokens'] = all_tokens
        cleaned_df['filtered'] = all_filtered

        n_rows = len(cleaned_df)
        logger.info("Cleaned %d registered rows (took %.2fs)", n_rows, time.time() - start_time)
        print(f"[NLP-Sync] Cleaned {n_rows} registered rows (took {time.time() - start_time:.2f}s)", file=sys.stderr, flush=True)

        # 4. Smart Vector Caching: Reuse existing vectors where available
        emb_path = assets_dir / "sbert_registered_embeddings_finetuned.npy"
        if not emb_path.exists():
            emb_path = assets_dir / "registered_embeddings.npy"

        cached_vecs: Dict[str, np.ndarray] = {}
        if prev_pkl_path.exists() and emb_path.exists():
            try:
                prev_df = pd.read_pickle(prev_pkl_path)
                prev_emb = np.load(emb_path)
                min_len = min(len(prev_df), prev_emb.shape[0])
                for idx in range(min_len):
                    info = re.sub(r'\s+', ' ', str(prev_df['full_product_info'].iloc[idx])).strip()
                    if info and info not in cached_vecs:
                        cached_vecs[info] = prev_emb[idx]
            except Exception as cache_err:
                logger.warning("Could not load previous registered vector cache: %s", cache_err)

        # Determine which full_product_info texts need encoding
        texts_to_encode = []
        text_to_idx = {}
        for raw_info in cleaned_df['full_product_info']:
            info = re.sub(r'\s+', ' ', str(raw_info)).strip()
            if info not in cached_vecs and info not in text_to_idx:
                text_to_idx[info] = len(texts_to_encode)
                texts_to_encode.append(info)

        if texts_to_encode:
            logger.info("Encoding %d newly added registered texts with SentenceTransformer...", len(texts_to_encode))
            print(f"[NLP-Sync] Encoding {len(texts_to_encode)} new registered texts with SentenceTransformer...", file=sys.stderr, flush=True)
            new_vecs = finetuned_model.encode(
                texts_to_encode,
                batch_size=128,
                show_progress_bar=False,
                convert_to_numpy=True,
            ).astype("float32")
            faiss.normalize_L2(new_vecs)
            for info, enc_idx in text_to_idx.items():
                cached_vecs[info] = new_vecs[enc_idx]
        else:
            logger.info("All %d registered texts already have cached embeddings.", n_rows)
            print(f"[NLP-Sync] All {n_rows} registered texts have cached embeddings.", file=sys.stderr, flush=True)

        if n_rows > 0:
            final_embeddings = np.array([
                cached_vecs[re.sub(r'\s+', ' ', str(t)).strip()]
                for t in cleaned_df['full_product_info']
            ], dtype="float32")
            d = final_embeddings.shape[1]
            reg_index = faiss.IndexFlatIP(d)
            reg_index.add(final_embeddings)
            bm25_reg = BM25Okapi([[str(w).lower() for w in doc] for doc in cleaned_df['filtered'].tolist()])
        else:
            final_embeddings = np.empty((0, 768), dtype="float32")
            reg_index = faiss.IndexFlatIP(768)
            bm25_reg = BM25Okapi([['empty']])

        # 7. Save primary files then aliases
        cleaned_df.to_pickle(assets_dir / "registered_cleaned.pkl")
        with open(assets_dir / "reg_bm25.pkl", "wb") as f:
            pickle.dump(bm25_reg, f)
        np.save(assets_dir / "sbert_registered_embeddings_finetuned.npy", final_embeddings)
        faiss.write_index(reg_index, str(assets_dir / "faiss_registered.index"))

        for pkl_name in ("Registered_cleaned.pkl",):
            try:
                cleaned_df.to_pickle(assets_dir / pkl_name)
            except Exception:
                pass

        for bm25_name in ("bm25_registered.pkl",):
            try:
                with open(assets_dir / bm25_name, "wb") as f:
                    pickle.dump(bm25_reg, f)
            except Exception:
                pass

        for emb_name in ("registered_embeddings.npy",):
            try:
                np.save(assets_dir / emb_name, final_embeddings)
            except Exception:
                pass

        for idx_name in ("registered.index",):
            try:
                faiss.write_index(reg_index, str(assets_dir / idx_name))
            except Exception:
                pass

        # 8. Hot reload in-memory globals (registered only)
        reload_result = reload_retrieval_assets(reload_registered=True, reload_unregistered=False)

        total_duration = time.time() - start_time
        logger.info(
            "Registered NLP assets successfully rebuilt & reloaded in %.2fs! Total rows: %d",
            total_duration,
            n_rows,
        )
        print(f"[NLP-Sync] Hot-reload complete in {total_duration:.2f}s! In-memory registered count: {n_rows}", file=sys.stderr, flush=True)
        return {
            "status": "success",
            "registered_count": n_rows,
            "duration_seconds": round(total_duration, 2),
            "reload_result": reload_result,
        }

    except Exception as exc:
        logger.error("Error rebuilding registered NLP assets: %s", exc, exc_info=True)
        print(f"[NLP-Sync] ERROR rebuilding registered NLP assets: {exc}", file=sys.stderr, flush=True)
        return {"status": "error", "message": str(exc)}
    finally:
        _REG_SYNC_LOCK.release()


def trigger_registered_rebuild_async():
    """Triggers registered asset rebuild in a background daemon thread."""
    thread = threading.Thread(
        target=rebuild_registered_assets_and_reload,
        name="NLP-Reg-AssetSync",
        daemon=True,
    )
    thread.start()
    return thread

