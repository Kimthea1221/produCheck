 #### Cleaning of Registered Product to build BM25 index ####
import pandas as pd
import numpy as np
import re
import unicodedata
import pickle
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

datasets_dir = BASE_DIR.parent / "datasets"
asset_dir = BASE_DIR.parent / "assets"
asset_dir.mkdir(parents=True, exist_ok=True)


#-----Cleaning -------#
# Marketing words to remove
marketing_words = [
    'official',
    'authentic',
    'original',
    'bestseller',
    'best seller',
    'sale',
    'promo',
    'discount',
    'free shipping',
    'guaranteed'
]

# Abbreviations
abbreviations = {
    'pc': 'piece',
    'pcs': 'pieces',
    'ml': 'milliliter',
    'mg': 'milligram',
    'kg': 'kilogram',
    'g': 'gram'
}

# Brand aliases
brand_aliases = {
    'p&g': 'procter gamble',
    'pg': 'procter gamble',
    'unilvr': 'unilever'
}

# Precompile the word-boundary patterns once (faster on 90k+ rows)
alias_patterns = [
    (re.compile(rf'(?<!\w){re.escape(alias)}(?!\w)'), standard)
    for alias, standard in brand_aliases.items()
]
marketing_patterns = [
    re.compile(rf'\b{re.escape(word)}\b') for word in marketing_words
]
genuine_pattern = re.compile(r'\b100\s*%?\s*genuine\b')

unit_patterns = [
    (re.compile(r'(\d+)\s*ml\b'), r'\1 milliliter'),
    (re.compile(r'(\d+)\s*mg\b'), r'\1 milligram'),
    (re.compile(r'(\d+)\s*kg\b'), r'\1 kilogram'),
    (re.compile(r'(\d+)\s*g\b'),  r'\1 gram'),
]


def dedupe_tokens(text, sort_tokens=False):
    toks = text.split()
    toks = list(dict.fromkeys(toks))      # drop repeats, keep first-seen order
    if sort_tokens:
        toks = sorted(toks)
    return " ".join(toks)


def clean_title(text):

    if pd.isna(text):
        return ""

    text = str(text)

    # Unicode normalization
    text = unicodedata.normalize('NFKD', text)

    # Lowercase
    text = text.lower()

    # Remove emojis and unicode symbols
    text = text.encode('ascii', 'ignore').decode('ascii')

    # Handle brand aliases (whole words only)
    for pattern, standard in alias_patterns:
        text = pattern.sub(standard, text)

    # Remove marketing words (whole words only)
    text = genuine_pattern.sub(' ', text)
    for pattern in marketing_patterns:
        text = pattern.sub(' ', text)

    # Normalize units (unit must end at a word boundary)
    for pattern, repl in unit_patterns:
        text = pattern.sub(repl, text)

    # Expand abbreviations
    words = text.split()
    words = [abbreviations.get(word, word) for word in words]
    text = " ".join(words)

    # Remove special characters and punctuation
    text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)

    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    # Remove duplicated tokens
    text = dedupe_tokens(text)

    return text


def main():
    # Load CSV file of registered products
    file_path = datasets_dir / "registered.csv"
    df = pd.read_csv(file_path, low_memory=False)


    
    TITLE_COLUMN = "PRODUCT_NAME"
    BRAND_COLUMN = "BRAND_NAME"
    COMPANY_COLUMN = "COMPANY_NAME"

    
    df[TITLE_COLUMN] = df[TITLE_COLUMN].apply(clean_title)
    df[BRAND_COLUMN] = df[BRAND_COLUMN].apply(clean_title)
    df[COMPANY_COLUMN] = df[COMPANY_COLUMN].apply(clean_title)

    # Save cleaned dataset
    output_path = asset_dir / "Registered_cleaned.csv"
    df.to_csv(output_path, index=False)

    #Save the df as pickle
    with open(asset_dir / "Registered_cleaned.pkl", 'wb') as f:
        pickle.dump(df, f)


    #### Cleaning of Unregistered Product to build BM25 index ####

    # Load CSV file of unregistered products
    file_path = datasets_dir / "unregistered.csv"
    df = pd.read_csv(file_path)

    # Change this if needed after checking the output above
    UN_TITLE_COLUMN = "Product Title"

    # Apply the cleaning function to the specified column
    df[UN_TITLE_COLUMN] = df[UN_TITLE_COLUMN].apply(clean_title)


    # Save cleaned dataset
    output_path = asset_dir / "Unregistered_cleaned.csv"
    df.to_csv(output_path, index=False)

    with open(asset_dir / "Unregistered_cleaned.pkl", 'wb') as f:
        pickle.dump(df, f)

    print("\nCleaning completed!")



if __name__ == "__main__":  
    main()