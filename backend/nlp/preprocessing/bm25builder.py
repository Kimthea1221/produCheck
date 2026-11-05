from pathlib import Path
import pickle
import pandas as pd
from rank_bm25 import BM25Okapi

BASE_DIR = Path(__file__).resolve().parent
WORK = BASE_DIR.parent / "assets"
WORK.mkdir(parents=True, exist_ok=True)

registered_df = pd.read_pickle(WORK / "registered_cleaned.pkl" if (WORK / "registered_cleaned.pkl").exists() else WORK / "Registered_cleaned.pkl")
unregistered_df = pd.read_pickle(WORK / "unregistered_cleaned.pkl" if (WORK / "unregistered_cleaned.pkl").exists() else WORK / "Unregistered_cleaned.pkl")

bm25_registered = BM25Okapi([[str(w).lower() for w in doc] for doc in registered_df['filtered'].tolist()])
with open(WORK / 'reg_bm25.pkl', 'wb') as f:
    pickle.dump(bm25_registered, f)
try:
    with open(WORK / 'bm25_registered.pkl', 'wb') as f:
        pickle.dump(bm25_registered, f)
except Exception:
    pass

bm25_unregistered = BM25Okapi([[str(w).lower() for w in doc] for doc in unregistered_df['filtered'].tolist()])
with open(WORK / 'unreg_bm25.pkl', 'wb') as f:
    pickle.dump(bm25_unregistered, f)
try:
    with open(WORK / 'bm25_unregistered.pkl', 'wb') as f:
        pickle.dump(bm25_unregistered, f)
except Exception:
    pass