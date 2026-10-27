from pathlib import Path
import subprocess
import sys

BASE_DIR = Path(__file__).resolve().parent
ASSET_DIR = BASE_DIR.parent / "assets"
ASSET_DIR.mkdir(parents=True, exist_ok=True)

SCRIPTS = [
    ("clean.py", "[1/4] Cleaning datasets and tokenizing"),
    ("bm25builder.py", "[2/4] Building BM25 index"),
    ("embeddingbuilder.py", "[3/4] Generating SBERT embeddings"),
    ("faissbuilder.py", "[4/4] Building FAISS index"),
]


def run_script(script_name: str, description: str):
    script_path = BASE_DIR / script_name
    if not script_path.exists():
        raise FileNotFoundError(f"Script not found: {script_path}")

    print(f"\n==========================================")
    print(f"{description} ({script_name})...")
    print(f"==========================================")

    result = subprocess.run([sys.executable, str(script_path)], check=True)
    return result


def main():
    print("Starting NLP preprocessing pipeline...")
    for script_name, description in SCRIPTS:
        run_script(script_name, description)

    print(f"\nAll assets successfully generated in: {ASSET_DIR}")


if __name__ == "__main__":
    main()
