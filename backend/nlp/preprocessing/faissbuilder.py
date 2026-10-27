from pathlib import Path
import faiss
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
WORK = BASE_DIR.parent / "assets"
WORK.mkdir(parents=True, exist_ok=True)

sbert_registered_embeddings_finetuned = np.load(WORK / "sbert_registered_embeddings_finetuned.npy")
sbert_unregistered_embeddings_finetuned = np.load(WORK / "sbert_unregistered_embeddings_finetuned.npy")

d = sbert_registered_embeddings_finetuned.shape[1]

registered_index = faiss.IndexFlatIP(d)
registered_index.add(sbert_registered_embeddings_finetuned)
faiss.write_index(registered_index, str(WORK / "faiss_registered.index"))

unregistered_index = faiss.IndexFlatIP(d)
unregistered_index.add(sbert_unregistered_embeddings_finetuned)
faiss.write_index(unregistered_index, str(WORK / "faiss_unregistered.index"))

print("FAISS indexes built and saved successfully in:", WORK)