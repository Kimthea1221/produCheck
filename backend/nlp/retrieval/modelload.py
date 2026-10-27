import pickle
from pathlib import Path
import pandas as pd
import numpy as np
from rank_bm25 import BM25Okapi
import faiss
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).resolve().parent
ASSET_DIR = BASE_DIR.parent / "assets"
ASSET_DIR.mkdir(parents=True, exist_ok=True)


def _find_asset(*candidate_names: str) -> Path:
    """Find the first matching asset file among candidate names."""
    for name in candidate_names:
        file_path = ASSET_DIR / name
        if file_path.exists():
            return file_path
    raise FileNotFoundError(
        f"None of the candidate asset files exist in {ASSET_DIR}: {candidate_names}"
    )


def LoadDfAsset(primary_name: str, *fallbacks: str) -> pd.DataFrame:
    file_path = _find_asset(primary_name, *fallbacks)
    return pd.read_pickle(file_path)


def LoadBM25Asset(primary_name: str, *fallbacks: str) -> BM25Okapi:
    file_path = _find_asset(primary_name, *fallbacks)
    with open(file_path, "rb") as file:
        bm25_obj = pickle.load(file)

    if not isinstance(bm25_obj, BM25Okapi):
        raise TypeError(f"Expected BM25Okapi object, but got {type(bm25_obj)}")

    return bm25_obj


def LoadEmbedAsset(primary_name: str, *fallbacks: str) -> np.ndarray:
    file_path = _find_asset(primary_name, *fallbacks)
    with open(file_path, "rb") as file:
        embeddings = np.load(file)
    return embeddings


def LoadFaissIndex(primary_name: str, *fallbacks: str):
    file_path = _find_asset(primary_name, *fallbacks)
    return faiss.read_index(str(file_path))


# Aliases for backwards compatibility
def LoadRegAsset(asset_file: str = "Registered_cleaned.pkl"):
    return LoadDfAsset(asset_file, "registered_cleaned.pkl")


def BM25RegAsset(asset_file: str = "reg_bm25.pkl"):
    return LoadBM25Asset(asset_file, "bm25_registered.pkl")


def LoadRegEmbedAsset(asset_file: str = "sbert_registered_embeddings_finetuned.npy"):
    return LoadEmbedAsset(asset_file, "registered_embeddings.npy")


def LoadRegFaissIndex(asset_file: str = "faiss_registered.index"):
    return LoadFaissIndex(asset_file, "registered.index")


def load_model():
    """Load the local fine-tuned model or fall back to base SentenceTransformer."""
    for local_dir in [BASE_DIR.parent / "sbertmodel4", BASE_DIR.parent / "finetuned_sbert"]:
        if local_dir.exists():
            print(f"Loading local model from: {local_dir}")
            return SentenceTransformer(str(local_dir))

    print("Loading model 'all-MiniLM-L6-v2'...")
    return SentenceTransformer("all-MiniLM-L6-v2")


def load_all_assets():
    print("Running NLP Load Assets pipeline...")

    registeredCleanedDf = LoadDfAsset("Registered_cleaned.pkl", "registered_cleaned.pkl")
    unregisteredCleanedDf = LoadDfAsset("Unregistered_cleaned.pkl", "unregistered_cleaned.pkl")

    bm25RegisteredObj = LoadBM25Asset("reg_bm25.pkl", "bm25_registered.pkl")
    bm25UnregisteredObj = LoadBM25Asset("unreg_bm25.pkl", "bm25_unregistered.pkl")

    registeredEmbeddingsArray = LoadEmbedAsset(
        "sbert_registered_embeddings_finetuned.npy", "registered_embeddings.npy"
    )
    unregisteredEmbeddingsArray = LoadEmbedAsset(
        "sbert_unregistered_embeddings_finetuned.npy", "unregistered_embeddings.npy"
    )

    faissRegIndexObj = LoadFaissIndex("faiss_registered.index", "registered.index")
    faissUnregIndexObj = LoadFaissIndex("faiss_unregistered.index", "unregistered.index")

    model = load_model()

    print("Successfully loaded all NLP assets.")
    return {
        "registeredCleanedDf": registeredCleanedDf,
        "unregisteredCleanedDf": unregisteredCleanedDf,
        "bm25RegisteredObj": bm25RegisteredObj,
        "bm25UnregisteredObj": bm25UnregisteredObj,
        "registeredEmbeddingsArray": registeredEmbeddingsArray,
        "unregisteredEmbeddingsArray": unregisteredEmbeddingsArray,
        "faissRegIndexObj": faissRegIndexObj,
        "faissUnregIndexObj": faissUnregIndexObj,
        "model": model,
    }


if __name__ == "__main__":
    assets = load_all_assets()
    print("Asset verification summary:")
    for k, v in assets.items():
        if hasattr(v, "shape"):
            print(f"  {k}: shape {v.shape}")
        elif isinstance(v, pd.DataFrame):
            print(f"  {k}: DataFrame with {len(v)} rows")
        else:
            print(f"  {k}: {type(v).__name__}")
