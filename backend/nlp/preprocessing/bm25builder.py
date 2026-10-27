from pathlib import Path
import pickle
import pandas as pd
from rank_bm25 import BM25Okapi

BASE_DIR = Path(__file__).resolve().parent
WORK = BASE_DIR.parent / "assets"
WORK.mkdir(parents=True, exist_ok=True)

registered_df = pd.read_pickle(WORK / "Registered_cleaned.pkl")
unregistered_df = pd.read_pickle(WORK / "Unregistered_cleaned.pkl")

bm25_registered = BM25Okapi([[str(w).lower() for w in doc] for doc in registered_df['filtered'].tolist()])
with open(f'{WORK}/reg_bm25.pkl', 'wb') as f:
    pickle.dump(bm25_registered, f)

bm25_unregistered = BM25Okapi([[str(w).lower() for w in doc] for doc in unregistered_df['filtered'].tolist()])
with open(f'{WORK}/unreg_bm25.pkl', 'wb') as f:
    pickle.dump(bm25_unregistered, f)