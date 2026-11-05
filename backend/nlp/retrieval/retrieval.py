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

MODEL_DIR = BASE_DIR.parent / "sbertmodel8"
MODEL_PATH = str(MODEL_DIR)

COSINE_THR = 0.85

MARKETING_PATTERNS = [
    r'\bbuy\s*(?:\d+|one|two)\s*(?:take|get)\s*(?:\d+|one|two)(?:\s*free)?\b',
    r'\bb\d+\s*t\d+\b',
    r'\bbuy\s*\d+\s*(?:and|&)?\s*get\s*\d+\s*(?:free)?\b',
    r'\b\d+\s*for\s*\d+\b',
    r'\b\d+\s*%\s*off\b',
    r'\b(?:up\s*to\s*)?\d+\s*%\s*(?:off|discount)\b',
    r'\b(?:free\s*(?:shipping|gift|delivery)|freebie|best\s*seller|bestseller)\b',
    r'\b(?:hot\s*(?:deal|sale)|flash\s*sale|big\s*sale|on\s*sale|sale|promo|bundle|set\s*of)\b',
    r'\b(?:brand\s*new|new\s*arrival|new\s*stock|ready\s*stock|in\s*stock)\b',
    r'\b(?:authentic|original|legit|official\s*(?:store|shop)|genuine)\b',
    r'\b(?:limited\s*edition|while\s*supplies\s*last|must\s*have|trending|viral)\b',
    r'\b(?:cod|cash\s*on\s*delivery|lowest\s*price|cheap|affordable|sulit)\b',
    r'\b(?:(?:free|fast|express|worldwide|international|global|same\s*day)\s*)?(?:shipping|delivery)\b',
    r'\bships?\s+(?:from|to)\s+\w+\b',
    r'\bfrom\s+(?:korea|japan|usa|thailand)\b',
    r'\bmade\s+(?:in|from)\s+\w+\b',
    r'\bsold\s+per\s+(?:piece|pc|pcs|item)\b',
    r'^\s*(?:new|hot|sale)\b[\s:!-]*',
    r'\(?\s*\d+\s*(?:box|boxes|pcs|pc|pieces|sachets?|sets?)\s*\)?',
    r'\b(?:oil[- ]control|oil[- ]controlling|shine[- ]control|sebum[- ]control)\b',
    r'\b(?:waterproof|water[- ]resistant|sweatproof|sweat[- ]resistant|smudgeproof|transferproof)\b',
    r'\b(?:long[- ]lasting|all[- ]day|24[- ]?h(?:ours?|r)?|12[- ]?h(?:ours?|r)?|48[- ]?h(?:ours?|r)?)\b',
    r'\b(?:high[- ]coverage|full[- ]coverage|medium[- ]coverage|light[- ]coverage|sheer[- ]coverage)\b',
    r'\b(?:flawless|ultra[- ]matte|glow|dewy|natural[- ]finish|radiant|shimmer)\b',
    r'\b(?:blurring|poreless|anti[- ]aging|brightening|whitening)\b',
    r'\b(?:setting)\s+(?=powder\b)',
    r'\b(?:premium|pure|natural|organic|advanced|miracle|effective|proven|maximum\s*strength)\b',
    r'\b(?:clinical(?:ly)?\s*tested|dermatologist\s*tested|hypoallergenic|gentle|mild)\b',
    r'\b(?:for\s*(?:men|women|unisex|adults?|kids?|teens?|baby|babies))\b',
    r'\b(?:daily\s*(?:use|care|routine)|everyday|day\s*(?:and|&)\s*night|morning|night)\b',
    r'\b(?:pump\s*bottle|refill(?:able)?|travel\s*size|family\s*pack|container)\b',
    r'\b(?:with|help|helps|soothe|protect)\b',
]
MARKETING_RE = re.compile('|'.join(MARKETING_PATTERNS), flags=re.IGNORECASE)


def clean_productTitle(text: Any, deduplicate: bool = True) -> str:
    if pd.isna(text) or text is None:
        return ""
    text = str(text).lower()
    text = re.sub(r'[®©™]', '', text)
    text = re.sub(r'\bmake[\s-]?up\b', 'makeup', text)
    text = BeautifulSoup(text, "html.parser").get_text()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = MARKETING_RE.sub(' ', text)
    text = re.sub(
        r'\b\d+\s*(?:h|hours?|hr|hrs)\b(?:\s+(?:(?:sweat|odor|odour|wetness)\s*(?:&|and)?\s*)?(?:protection|freshness|control))?',
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

    if deduplicate:
        seen = set()
        dedup_words = []
        for w in text.split():
            if w not in seen:
                seen.add(w)
                dedup_words.append(w)
        text = " ".join(dedup_words)

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


def reload_retrieval_assets() -> Dict[str, Any]:
    global registered_df, unregistered_df
    global bm25_registered, bm25_unregistered
    global registered_index, unregistered_index
    global sbert_registered_embeddings_finetuned, sbert_unregistered_embeddings_finetuned

    new_reg_df = pd.read_pickle(_find_file('registered_cleaned.pkl', 'Registered_cleaned.pkl')).reset_index(drop=True)
    new_unreg_df = pd.read_pickle(_find_file('unregistered_cleaned.pkl', 'Unregistered_cleaned.pkl')).reset_index(drop=True)

    with open(_find_file('reg_bm25.pkl', 'bm25_registered.pkl'), 'rb') as f:
        new_bm25_reg = pickle.load(f)
    with open(_find_file('unreg_bm25.pkl', 'bm25_unregistered.pkl'), 'rb') as f:
        new_bm25_unreg = pickle.load(f)

    new_reg_idx = faiss.read_index(_find_file('faiss_registered.index', 'registered.index'))
    new_unreg_idx = faiss.read_index(_find_file('faiss_unregistered.index', 'unregistered.index'))

    new_reg_emb = np.load(_find_file('sbert_registered_embeddings_finetuned.npy', 'registered_embeddings.npy'))
    new_unreg_emb = np.load(_find_file('sbert_unregistered_embeddings_finetuned.npy', 'unregistered_embeddings.npy'))

    for name, df, idx, bm25, emb in [
        ("Registered", new_reg_df, new_reg_idx, new_bm25_reg, new_reg_emb),
        ("Unregistered", new_unreg_df, new_unreg_idx, new_bm25_unreg, new_unreg_emb),
    ]:
        n = len(df)
        assert n == idx.ntotal == len(bm25.doc_freqs) == emb.shape[0], (
            f"{name}: size mismatch (df: {n}, index: {idx.ntotal}, bm25: {len(bm25.doc_freqs)}, emb: {emb.shape[0]})"
        )
        assert df.index.equals(pd.RangeIndex(n)), f"{name}: index not consecutive"

    registered_df = new_reg_df
    unregistered_df = new_unreg_df
    bm25_registered = new_bm25_reg
    bm25_unregistered = new_bm25_unreg
    registered_index = new_reg_idx
    unregistered_index = new_unreg_idx
    sbert_registered_embeddings_finetuned = new_reg_emb
    sbert_unregistered_embeddings_finetuned = new_unreg_emb

    return {
        "status": "success",
        "registered_count": len(registered_df),
        "unregistered_count": len(unregistered_df),
    }


def evaluate_match(query: str, threshold: float = COSINE_THR, verbose: bool = False) -> Dict[str, Any]:
    cleaned_query = clean_productTitle(query, deduplicate=True)
    if not cleaned_query:
        return {
            "query": query,
            "cleaned_query": "",
            "verdict": "no_match",
            "score": 0.0,
            "reg_cos": 0.0,
            "unreg_cos": 0.0,
            "top5_registered": [],
            "matched_unregistered": None,
        }

    q_tokens = cleaned_query.split()
    cand_queries = [cleaned_query]
    if len(q_tokens) > 5:
        window_size = 5
        step = 2
        for i in range(0, len(q_tokens), step):
            window = q_tokens[i:i + window_size]
            if len(window) >= 3:
                chunk = " ".join(window)
                if chunk not in cand_queries:
                    cand_queries.append(chunk)

    q_vecs = finetuned_model.encode(cand_queries, convert_to_numpy=True).astype("float32")
    faiss.normalize_L2(q_vecs)

    r_scores_all, r_indices_all = registered_index.search(q_vecs, 5)
    u_scores_all, u_indices_all = unregistered_index.search(q_vecs, 1)

    best_r_idx = int(np.argmax(r_scores_all[:, 0]))
    best_u_idx = int(np.argmax(u_scores_all[:, 0]))

    r1 = float(r_scores_all[best_r_idx, 0]) if len(r_scores_all) > 0 else -1.0
    u1 = float(u_scores_all[best_u_idx, 0]) if len(u_scores_all) > 0 else -1.0

    best_reg_scores = r_scores_all[best_r_idx:best_r_idx + 1]
    best_reg_indices = r_indices_all[best_r_idx:best_r_idx + 1]

    best_unreg_indices = u_indices_all[best_u_idx:best_u_idx + 1]

    top5_registered: List[Dict[str, Any]] = []
    if best_reg_indices is not None and len(best_reg_indices[0]) > 0:
        for rank, (idx_val, cos_val) in enumerate(zip(best_reg_indices[0], best_reg_scores[0]), start=1):
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

    matched_unregistered: Dict[str, Any] | None = None
    if best_unreg_indices is not None and len(best_unreg_indices[0]) > 0 and best_unreg_indices[0][0] >= 0:
        u_idx = int(best_unreg_indices[0][0])
        u_row = unregistered_df.iloc[u_idx]
        u_title = str(u_row.get("Product Title", u_row.get("cleaned_title", ""))).strip()
        advisory_title = str(u_row.get("Advisory Title", "")).strip()
        category = str(u_row.get("Category", "")).strip()
        post_link = str(u_row.get("Post Link", "")).strip()
        matched_unregistered = {
            "index": u_idx,
            "title": u_title,
            "product_name": u_title,
            "advisory_title": advisory_title,
            "category": category,
            "post_link": post_link,
            "score": round(float(u1), 4),
            "cosine_score": round(float(u1), 4),
        }

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
        try:
            print(f"Query               : {query}")
        except Exception:
            print(f"Query               : {query.encode('ascii', 'replace').decode()}")
        print(f"Cleaned Query       : {cleaned_query}")
        print(f"Candidate Windows   : {cand_queries}")
        print(f"Registered Cosine   : {r1:.4f}")
        print(f"Unregistered Cosine : {u1:.4f}")
        print(f"Verdict             : {verdict.upper()} (threshold: {threshold:.4f})")
        if verdict == "unregistered" and matched_unregistered:
            print(f"Matched Unregistered: {matched_unregistered['title']} (Cosine: {matched_unregistered['cosine_score']:.4f})")
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
        "matched_unregistered": matched_unregistered if verdict == "unregistered" else None,
    }


def get_top_5_registered(query: str, k: int = 5) -> List[Dict[str, Any]]:
    res = evaluate_match(query)
    return res.get("top5_registered", [])[:k]


top_5_registered = get_top_5_registered
get_top_registered_products = get_top_5_registered