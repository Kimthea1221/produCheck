from pathlib import Path
import pickle
import faiss
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR.parent.parent))

from nlp.common.clean import clean_productTitle, clean_title
NLP_DIR = BASE_DIR.parent
WORK = NLP_DIR / "assets"
MODEL_PATH = str(NLP_DIR / "sbertmodel4" if (NLP_DIR / "sbertmodel4").exists() else NLP_DIR / "finetuned_sbert")

# Decision rule tuned on validation set
THR, LO, MARGIN = 0.79, 0.64, 0.10

# Initialize NLTK stopwords
nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)
nltk.download("stopwords", quiet=True)
stop_words = set(stopwords.words("english"))


def tokenize_for_bm25(cleaned_text):
    return [w for w in word_tokenize(cleaned_text) if w not in stop_words]


def _get_path(*names):
    for name in names:
        p = WORK / name
        if p.exists():
            return p
    return WORK / names[0]


if "finetuned_model" not in globals():
    finetuned_model = SentenceTransformer(MODEL_PATH)

registered_df = pd.read_pickle(_get_path("Registered_cleaned.pkl", "registered_cleaned.pkl")).reset_index(drop=True)
unregistered_df = pd.read_pickle(_get_path("Unregistered_cleaned.pkl", "unregistered_cleaned.pkl")).reset_index(drop=True)

with open(_get_path("reg_bm25.pkl", "bm25_registered.pkl"), "rb") as f:
    bm25_registered = pickle.load(f)
with open(_get_path("unreg_bm25.pkl", "bm25_unregistered.pkl"), "rb") as f:
    bm25_unregistered = pickle.load(f)

registered_index = faiss.read_index(str(_get_path("faiss_registered.index", "registered.index")))
unregistered_index = faiss.read_index(str(_get_path("faiss_unregistered.index", "unregistered.index")))

sbert_registered_embeddings_finetuned = np.load(_get_path("sbert_registered_embeddings_finetuned.npy", "registered_embeddings.npy"))
sbert_unregistered_embeddings_finetuned = np.load(_get_path("sbert_unregistered_embeddings_finetuned.npy", "unregistered_embeddings.npy"))


import re

GENERIC_BRAND_WORDS = {
    "the", "and", "inc", "corp", "corporation", "co", "ltd", "limited",
    "beauty", "care", "skin", "cosmetics", "hair", "natural", "pure",
    "spa", "new", "organic", "philippines", "essential", "essentials",
    "lab", "laboratories", "formula", "wellness", "products", "international",
}


def check_brand_match(query: str, text: str) -> bool:
    """Check if any distinct non-generic brand word from text appears in the query."""
    if not text or pd.isna(text):
        return False
    b_words = [
        w for w in re.findall(r"\b[a-zA-Z0-9]{3,}\b", str(text).lower())
        if w not in GENERIC_BRAND_WORDS
    ]
    if not b_words:
        return False
    q_words = set(re.findall(r"\b[a-zA-Z0-9]{3,}\b", query.lower()))
    return any(w in q_words for w in b_words)


def add_missing_cosine_scores(combined, embeddings, query_vec):
    """Fill in cosine similarity for candidates that BM25 found but FAISS didn't surface."""
    q = query_vec[0]
    for idx, scores in combined.items():
        if "faiss_score" not in scores:
            scores["faiss_score"] = float(np.dot(q, embeddings[idx]))
    return combined


def _candidates(query, query_tokens, query_vec, bm25, index, embeddings, df, title_col, is_registered=True, k=50):
    k = min(k, index.ntotal)
    bm25_scores = bm25.get_scores(query_tokens)
    bm25_top = np.argpartition(bm25_scores, -k)[-k:]
    faiss_scores, faiss_idx = index.search(query_vec, k)

    combined = {int(i): {} for i in bm25_top}
    for i, s in zip(faiss_idx[0], faiss_scores[0]):
        if i >= 0:
            combined.setdefault(int(i), {})["faiss_score"] = float(s)
    combined = add_missing_cosine_scores(combined, embeddings, query_vec)

    results = []
    for i, sc in combined.items():
        row = df.iloc[i]
        c_score = sc["faiss_score"]
        bm_score = float(bm25_scores[i])
        bm_norm = min(1.0, max(0.0, bm_score / 30.0))

        if is_registered:
            brand = str(row.get("BRAND_NAME", "")).strip() if pd.notna(row.get("BRAND_NAME")) else ""
            pname = str(row.get("PRODUCT_NAME", row.get(title_col, ""))).strip()
            display_title = f"[{brand}] {pname}" if brand else pname
            brand_matched = check_brand_match(query, brand)
        else:
            brand = ""
            pname = str(row.get(title_col, "")).strip()
            display_title = pname
            brand_matched = check_brand_match(query, display_title)

        results.append({
            "index": i,
            "title": display_title,
            "brand": brand,
            "product_name": pname,
            "faiss_score": c_score,
            "bm25_score": bm_score,
            "bm25_norm": bm_norm,
            "brand_match": brand_matched,
        })
    return results


def retrieve(query):
    cleaned_query = clean_productTitle(query)
    query_tokens = [w.lower() for w in tokenize_for_bm25(cleaned_query)]

    query_vec = finetuned_model.encode([cleaned_query], convert_to_numpy=True).astype("float32")
    faiss.normalize_L2(query_vec)

    title_reg_col = "PRODUCT_NAME" if "PRODUCT_NAME" in registered_df.columns else "full_product_info"
    title_unreg_col = "Product Title" if "Product Title" in unregistered_df.columns else "cleaned_title"

    return {
        "query": query,
        "query_tokens": query_tokens,
        "registered_df": _candidates(
            query,
            query_tokens,
            query_vec,
            bm25_registered,
            registered_index,
            sbert_registered_embeddings_finetuned,
            registered_df,
            title_reg_col,
            is_registered=True,
        ),
        "unregistered_df": _candidates(
            query,
            query_tokens,
            query_vec,
            bm25_unregistered,
            unregistered_index,
            sbert_unregistered_embeddings_finetuned,
            unregistered_df,
            title_unreg_col,
            is_registered=False,
        ),
    }


def decide(top1, top2=None, use_margin=True):
    """True = confident match. Same rule family tuned on validation set:
    - top1 >= THR, or
    - (margin rule) top1 >= LO and top1 - top2 >= MARGIN
    """
    if top1 >= THR:
        return True
    return bool(use_margin and top2 is not None and top1 >= LO and (top1 - top2) >= MARGIN)


def assign_verdict(scores, use_margin=True):
    """scores: DataFrame from predict_batch(). Returns a Series of
    'registered' / 'unregistered' / 'no_match'.
    """
    out = []
    for r1, r2, u1, u2 in zip(scores.reg_top1, scores.reg_top2, scores.unreg_top1, scores.unreg_top2):
        reg_hit, unreg_hit = decide(r1, r2, use_margin), decide(u1, u2, use_margin)
        if not (reg_hit or unreg_hit):
            out.append("no_match")
        elif reg_hit and (not unreg_hit or r1 >= u1):
            out.append("registered")
        else:
            out.append("unregistered")
    return pd.Series(out, index=scores.index)


def evaluate_match(query, use_margin=True, verbose=True):
    result = retrieve(query)

    has_registered_brand_in_query = any(c["brand_match"] for c in result["registered_df"])

    for c in result["registered_df"]:
        base_score = 0.70 * c["faiss_score"] + 0.30 * c["bm25_norm"]
        if has_registered_brand_in_query:
            c["final_score"] = base_score + 0.08 if c["brand_match"] else base_score - 0.20
        else:
            c["final_score"] = base_score

    for c in result["unregistered_df"]:
        base_score = 0.70 * c["faiss_score"] + 0.30 * c["bm25_norm"]
        if has_registered_brand_in_query:
            c["final_score"] = base_score + 0.08 if c["brand_match"] else base_score - 0.20
        else:
            c["final_score"] = base_score

    reg = sorted(result["registered_df"], key=lambda x: x["final_score"], reverse=True)
    unreg = sorted(result["unregistered_df"], key=lambda x: x["final_score"], reverse=True)

    r1, r2 = (reg[0]["final_score"], reg[1]["final_score"]) if len(reg) >= 2 else (reg[0]["final_score"] if reg else -1.0, -1.0)
    u1, u2 = (unreg[0]["final_score"], unreg[1]["final_score"]) if len(unreg) >= 2 else (unreg[0]["final_score"] if unreg else -1.0, -1.0)

    verdict = assign_verdict(
        pd.DataFrame({"reg_top1": [r1], "reg_top2": [r2], "unreg_top1": [u1], "unreg_top2": [u2]}),
        use_margin,
    ).iloc[0]
    winning_score = r1 if verdict == "registered" else u1 if verdict == "unregistered" else max(r1, u1)

    if verbose:
        print(f"Query: {query}")
        print("\n  Top 5 REGISTERED candidates:")
        for i, c in enumerate(reg[:5], 1):
            print(f"    {i}. {c['title']} (score: {c['final_score']:.4f} | cos: {c['faiss_score']:.4f} | bm25: {c['bm25_score']:.2f})")
        if unreg:
            print(f"\n  Top UNREGISTERED: {unreg[0]['title']} (score: {u1:.4f} | cos: {unreg[0]['faiss_score']:.4f})")
        print(f"\n  -> VERDICT: {verdict.upper()} (score: {winning_score:.4f}, thr={THR}, lo={LO}, margin={MARGIN})")

    top_reg = reg[0] if reg else None
    top_unreg = unreg[0] if unreg else None
    return {
        "query": query,
        "verdict": verdict,
        "score": winning_score,
        "top_registered": top_reg,
        "top_unregistered": top_unreg,
        "top5_registered": reg[:5],
    }


if __name__ == "__main__":
    import sys
    test_query = " ".join(sys.argv[1:]).strip() if len(sys.argv) > 1 else "Biore UV Aqua Rich Watery Essence Sunscreen Face"
    evaluate_match(test_query)
