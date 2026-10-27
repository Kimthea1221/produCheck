from pathlib import Path
import pandas as pd
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).resolve().parent
BASE = BASE_DIR.parent
WORK = BASE / "assets"
WORK.mkdir(parents=True, exist_ok=True)

# Load cleaned datasets
registered_df = pd.read_pickle(WORK / "Registered_cleaned.pkl")
unregistered_df = pd.read_pickle(WORK / "Unregistered_cleaned.pkl")

# Load model
MODEL_PATH = str(BASE / "sbertmodel4")
finetuned_model = SentenceTransformer(MODEL_PATH)

USE_CLEANED_DOCS = True

reg_texts = (registered_df['full_product_info'] if USE_CLEANED_DOCS
             else registered_df['cleaned_title'].fillna('')).tolist()
unreg_texts = (unregistered_df['cleaned_title'] if USE_CLEANED_DOCS
               else unregistered_df['Product Title'].fillna('')).tolist()

def embed(texts):
    vecs = finetuned_model.encode(texts, batch_size=128, show_progress_bar=True,
                                  convert_to_numpy=True).astype("float32")
    faiss.normalize_L2(vecs)
    return vecs

sbert_registered_embeddings_finetuned   = embed(reg_texts)
sbert_unregistered_embeddings_finetuned = embed(unreg_texts)

np.save(f'{WORK}/sbert_registered_embeddings_finetuned.npy', sbert_registered_embeddings_finetuned)
np.save(f'{WORK}/sbert_unregistered_embeddings_finetuned.npy', sbert_unregistered_embeddings_finetuned)

print(sbert_registered_embeddings_finetuned.shape, sbert_unregistered_embeddings_finetuned.shape)