import os
import pickle
import re
from pathlib import Path
from typing import Any, Dict, List
from bs4 import BeautifulSoup
import faiss
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "assets"
if not DATA_DIR.exists():
    DATA_DIR = Path("./data")

MODEL_DIR = BASE_DIR.parent / "sbertmodel4"
if not MODEL_DIR.exists():
    MODEL_DIR = BASE_DIR.parent / "finetuned_sbert"
if not MODEL_DIR.exists():
    MODEL_DIR = Path("./models/sbertmodel8")
MODEL_PATH = str(MODEL_DIR)

COSINE_THR = 0.85

MARKETING_PATTERNS = [
    r'\bbuy\s*(?:\d+|one|two)\s*(?:take|get)\s*(?:\d+|one|two)(?:\s*free)?\b',
    r'\bb\d+\s*t\d+\b',
    r'\bbuy\s*\d+\s*(?:and|&)?\s*get\s*\d+\s*(?:free)?\b',
    r'\b\d+\s*for\s*\d+\b',
    r'\b\d+\s*%\s*off\b',
    r'\b(?:up\s*to\s*)?\d+\s*%\s*(?:off|discount)\b',
]
MARKETING_RE = re.compile('|'.join(MARKETING_PATTERNS), flags=re.IGNORECASE)


def clean_productTitle(text: Any) -> str:
    if pd.isna(text) or text is None:
        return ""
    text = str(text).lower()
    text = re.sub(r'[®©™]', '', text)
    text = re.sub(r'\bmake[\s-]?up\b', 'makeup', text)
    text = BeautifulSoup(text, "html.parser").get_text()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = MARKETING_RE.sub(' ', text)
    text = re.sub(
        r'\b\d+\s*(?:h|hours?)\b(?:\s+(?:(?:sweat|odor|odour|wetness)\s*(?:&|and)?\s*)?(?:protection|freshness|control))?',
        ' ',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'(?<![a-z0-9])\d+(?:[.,]\d+)?\s*(?:fl\s?oz|ml|mg|mcg|kg|g|l|oz|iu|pcs|pc)\b',
        ' ',
        text,
    )
    text = re.sub(r'(?<![a-z0-9])\d+(?:[.,]\d+)?%?(?![a-z0-9+])', ' ', text)
    text = text.replace('_', ' ')
    text = re.sub(
        r"(\d+\+|\bpa\++)|[^\w\s.'&]",
        lambda m: m.group(1) or ' ',
        text,
    )
    text = re.sub(r"(?<![^\W_])[.'&]|[.'&](?![^\W_])", ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _find_file(filename: str, *fallbacks: str) -> str:
    for name in (filename, *fallbacks):
        p = DATA_DIR / name
        if p.exists():
            return str(p)
    return str(DATA_DIR / filename)


finetuned_model = SentenceTransformer(MODEL_PATH)

registered_df = pd.read_pickle(_find_file('registered_cleaned.pkl', 'Registered_cleaned.pkl')).reset_index(drop=True)
unregistered_df = pd.read_pickle(_find_file('unregistered_cleaned.pkl', 'Unregistered_cleaned.pkl')).reset_index(drop=True)

with open(_find_file('reg_bm25.pkl', 'bm25_registered.pkl'), 'rb') as f:
    bm25_registered = pickle.load(f)
with open(_find_file('unreg_bm25.pkl', 'bm25_unregistered.pkl'), 'rb') as f:
    bm25_unregistered = pickle.load(f)

registered_index = faiss.read_index(_find_file('faiss_registered.index', 'registered.index'))
unregistered_index = faiss.read_index(_find_file('faiss_unregistered.index', 'unregistered.index'))

sbert_registered_embeddings_finetuned = np.load(_find_file('sbert_registered_embeddings_finetuned.npy', 'registered_embeddings.npy'))
sbert_unregistered_embeddings_finetuned = np.load(_find_file('sbert_unregistered_embeddings_finetuned.npy', 'unregistered_embeddings.npy'))

for name, df, idx, bm25, emb in [
    ("Registered", registered_df, registered_index, bm25_registered, sbert_registered_embeddings_finetuned),
    ("Unregistered", unregistered_df, unregistered_index, bm25_unregistered, sbert_unregistered_embeddings_finetuned),
]:
    n = len(df)
    assert n == idx.ntotal == len(bm25.doc_freqs) == emb.shape[0], f"{name}: size mismatch"
    assert df.index.equals(pd.RangeIndex(n)), f"{name}: index not consecutive"


def evaluate_match(query: str, threshold: float = COSINE_THR, verbose: bool = False) -> Dict[str, Any]:
    cleaned_query = clean_productTitle(query)
    if not cleaned_query:
        return {
            "query": query,
            "cleaned_query": "",
            "verdict": "no_match",
            "score": 0.0,
            "reg_cos": 0.0,
            "unreg_cos": 0.0,
            "top5_registered": [],
        }

    query_vec = finetuned_model.encode([cleaned_query], convert_to_numpy=True).astype("float32")
    faiss.normalize_L2(query_vec)

    reg_scores, reg_indices = registered_index.search(query_vec, 5)
    r1 = float(reg_scores[0][0]) if len(reg_scores[0]) > 0 else -1.0

    top5_registered: List[Dict[str, Any]] = []
    for rank, (idx_val, cos_val) in enumerate(zip(reg_indices[0], reg_scores[0]), start=1):
        if idx_val < 0:
            continue
        row = registered_df.iloc[int(idx_val)]
        brand = str(row.get("BRAND_NAME", "")).strip() if pd.notna(row.get("BRAND_NAME")) else ""
        product_name = str(row.get("PRODUCT_NAME", row.get("full_product_info", ""))).strip()
        full_info = str(row.get("full_product_info", f"{brand} {product_name}")).strip()
        display_title = full_info if full_info else (f"[{brand}] {product_name}" if brand else product_name)

        top5_registered.append({
            "rank": rank,
            "index": int(idx_val),
            "cosine_score": round(float(cos_val), 4),
            "brand_name": brand,
            "product_name": product_name,
            "full_product_info": full_info,
            "title": display_title,
            "score": round(float(cos_val), 4),
            "faiss_score": round(float(cos_val), 4),
        })

    unreg_scores, _ = unregistered_index.search(query_vec, 1)
    u1 = float(unreg_scores[0][0]) if len(unreg_scores[0]) > 0 else -1.0

    if max(r1, u1) < threshold:
        verdict = "no_match"
        score = max(r1, u1)
    elif r1 >= u1:
        verdict = "registered"
        score = r1
    else:
        verdict = "unregistered"
        score = u1

    if verbose:
        print(f"Query               : {query}")
        print(f"Cleaned Query       : {cleaned_query}")
        print(f"Registered Cosine   : {r1:.4f}")
        print(f"Unregistered Cosine : {u1:.4f}")
        print(f"Verdict             : {verdict.upper()} (threshold: {threshold:.4f})")
        print("\nTop 5 Registered Candidates:")
        for item in top5_registered:
            print(f"  [{item['rank']}] Cosine: {item['cosine_score']:.4f} | {item['full_product_info']}")
        print("-" * 70)

    return {
        "query": query,
        "cleaned_query": cleaned_query,
        "verdict": verdict,
        "score": score,
        "reg_cos": r1,
        "unreg_cos": u1,
        "top5_registered": top5_registered,
    }


def get_top_5_registered(query: str, k: int = 5) -> List[Dict[str, Any]]:
    """Retrieve the top 5 registered products for a given query."""
    res = evaluate_match(query)
    return res.get("top5_registered", [])[:k]


top_5_registered = get_top_5_registered
get_top_registered_products = get_top_5_registered


if __name__ == "__main__":
    import sys
    test_query = " ".join(sys.argv[1:]).strip() if len(sys.argv) > 1 else "Biore UV Aqua Rich Watery Essence Sunscreen Face"
    res = evaluate_match(test_query, verbose=True)
    print("Result:", res["verdict"], f"(score: {res['score']:.4f})")



def get_top_5_registered(query: str, k: int = 5) -> List[Dict[str, Any]]:
    """Retrieve the top 5 registered products for a given query."""
    res = evaluate_match(query)
    return res.get("top5_registered", [])[:k]


top_5_registered = get_top_5_registered
get_top_registered_products = get_top_5_registered


if __name__ == "__main__":
    import sys
    test_query = " ".join(sys.argv[1:]).strip() if len(sys.argv) > 1 else "Biore UV Aqua Rich Watery Essence Sunscreen Face"
    res = evaluate_match(test_query, verbose=True)
    print("Result:", res["verdict"], f"(score: {res['score']:.4f})")