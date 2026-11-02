import re
import warnings
import unicodedata
from pathlib import Path
import pandas as pd
from bs4 import BeautifulSoup, MarkupResemblesLocatorWarning
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
import nltk

warnings.filterwarnings("ignore", category=MarkupResemblesLocatorWarning)

NLTK_RESOURCES = [
    ('punkt', 'tokenizers/punkt'),
    ('punkt_tab', 'tokenizers/punkt_tab'),
    ('stopwords', 'corpora/stopwords'),
]

for pkg, path in NLTK_RESOURCES:
    try:
        nltk.data.find(path)
    except LookupError:
        try:
            nltk.download(pkg, quiet=True)
        except Exception:
            pass

BASE_DIR = Path(__file__).resolve().parent
DATASETS_DIR = BASE_DIR.parent / "datasets"
ASSET_DIR = BASE_DIR.parent / "assets"
ASSET_DIR.mkdir(parents=True, exist_ok=True)
WORK = ASSET_DIR

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

]

MARKETING_RE = re.compile('|'.join(MARKETING_PATTERNS), flags=re.IGNORECASE)


def clean_productTitle(text):
    if pd.isna(text):
        return ""

    text = str(text).lower()
    text = re.sub(r'[®©™]', '', text)
    text = re.sub(r'\bmake[\s-]?up\b', 'makeup', text)
    text = BeautifulSoup(text, "html.parser").get_text()
    text = re.sub(r'http\S+|www\S+', '', text)

    text = MARKETING_RE.sub(' ', text)

    text = re.sub(
        r'\b\d+\s*(?:h|hours?)\b'
        r'(?:\s+(?:(?:sweat|odor|odour|wetness)\s*(?:&|and)?\s*)?'
        r'(?:protection|freshness|control))?',
        ' ',
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(
        r'(?<![a-z0-9])\d+(?:[.,]\d+)?\s*'
        r'(?:fl\s?oz|ml|mg|mcg|kg|g|l|oz|iu|pcs|pc)\b',
        ' ',
        text
    )

    text = re.sub(
        r'(?<![a-z0-9])\d+(?:[.,]\d+)?%?(?![a-z0-9+])',
        ' ',
        text
    )

    text = text.replace('_', ' ')
    text = re.sub(
        r"(\d+\+|\bpa\++)|[^\w\s.'&]",
        lambda m: m.group(1) or ' ',
        text
    )
    text = re.sub(r"(?<![^\W_])[.'&]|[.'&](?![^\W_])", ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()

    return text

stop_words = set(stopwords.words("english"))

def tokenize_for_bm25(cleaned_text):
    return [w for w in word_tokenize(cleaned_text) if w not in stop_words]

def norm_key(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode()  
    s = s.lower()
    s = re.sub(r'[^a-z0-9\s]', ' ', s)      
    return re.sub(r'\s+', ' ', s).strip()    

registered_df = pd.read_csv(DATASETS_DIR / "registered.csv", low_memory=False)
unregistered_df = pd.read_csv(DATASETS_DIR / "unregistered.csv", low_memory=False)

registered_df['norm_key'] = registered_df['PRODUCT_NAME'].apply(norm_key)
unregistered_df['norm_key'] = unregistered_df['Product Title'].apply(norm_key)

reg_keys = set(registered_df['norm_key'])

before = len(unregistered_df)
overlap_mask = unregistered_df['norm_key'].isin(reg_keys)
print(f"Unregistered rows also in registered: {overlap_mask.sum()}")

unregistered_df[overlap_mask].to_csv(WORK / 'removed_unregistered_duplicates.csv', index=False)

unregistered_df = unregistered_df[~overlap_mask].reset_index(drop=True)
print(f"Unregistered: {before} -> {len(unregistered_df)}")

registered_df = registered_df.drop(columns='norm_key')
unregistered_df = unregistered_df.drop(columns='norm_key')

registered_df['cleaned_title'] = registered_df['PRODUCT_NAME'].apply(clean_productTitle)
registered_df = registered_df[registered_df['cleaned_title'].str.strip() != ""]
registered_df = registered_df.drop_duplicates(subset='cleaned_title', keep='first')
registered_df = registered_df.reset_index(drop=True)         

registered_df['full_product_info'] = (
    registered_df['BRAND_NAME'].fillna('') + ' ' +
    registered_df['cleaned_title'].fillna('')
)
     
registered_df['tokens']   = registered_df['full_product_info'].apply(word_tokenize)
registered_df['filtered'] = registered_df['full_product_info'].apply(tokenize_for_bm25)

registered_df.to_pickle(WORK / 'Registered_cleaned.pkl')
if not (WORK / 'registered_cleaned.pkl').exists():
    try:
        registered_df.to_pickle(WORK / 'registered_cleaned.pkl')
    except Exception:
        pass


unregistered_df['cleaned_title'] = unregistered_df['Product Title'].apply(clean_productTitle)
unregistered_df = unregistered_df[unregistered_df['cleaned_title'].str.strip() != ""]
unregistered_df = unregistered_df.drop_duplicates(subset='cleaned_title', keep='first')
unregistered_df = unregistered_df.reset_index(drop=True)

unregistered_df['tokens']   = unregistered_df['cleaned_title'].apply(word_tokenize)
unregistered_df['filtered'] = unregistered_df['cleaned_title'].apply(tokenize_for_bm25)

unregistered_df.to_pickle(WORK / 'Unregistered_cleaned.pkl')
if not (WORK / 'unregistered_cleaned.pkl').exists():
    try:
        unregistered_df.to_pickle(WORK / 'unregistered_cleaned.pkl')
    except Exception:
        pass

print("Registered:  ", registered_df.shape,
      "| index consecutive:", registered_df.index.equals(pd.RangeIndex(len(registered_df))))
print("Unregistered:", unregistered_df.shape,
      "| index consecutive:", unregistered_df.index.equals(pd.RangeIndex(len(unregistered_df))))
