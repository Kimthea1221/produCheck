import re
import pandas as pd
from bs4 import BeautifulSoup

MARKETING_PATTERNS = [
    # Promotions
    r'\bbuy\s*(?:\d+|one|two)\s*(?:take|get)\s*(?:\d+|one|two)(?:\s*free)?\b',
    r'\bb\d+\s*t\d+\b',
    r'\bbuy\s*\d+\s*(?:and|&)?\s*get\s*\d+\s*(?:free)?\b',
    r'\b\d+\s*for\s*\d+\b',
    r'\b\d+\s*%\s*off\b',
    r'\b(?:up\s*to\s*)?\d+\s*%\s*(?:off|discount)\b',

    # General marketing words
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

    # Remove marketing phrases
    text = MARKETING_RE.sub(' ', text)

    # Remove duration-based claims, e.g.:
    # 48H Sweat & Odor Protection
    # 24 hours sweat protection
    # 72H Freshness
    text = re.sub(
        r'\b\d+\s*(?:h|hours?)\b'
        r'(?:\s+(?:(?:sweat|odor|odour|wetness)\s*(?:&|and)?\s*)?'
        r'(?:protection|freshness|control))?',
        ' ',
        text,
        flags=re.IGNORECASE
    )

    # Remove measurements such as 150ml, 500mg, 2kg, 1.5oz
    text = re.sub(
        r'(?<![a-z0-9])\d+(?:[.,]\d+)?\s*'
        r'(?:fl\s?oz|ml|mg|mcg|kg|g|l|oz|iu|pcs|pc)\b',
        ' ',
        text
    )

    # Remove remaining standalone numbers and percentages
    # (the + in the lookahead keeps "50+" intact)
    text = re.sub(
        r'(?<![a-z0-9])\d+(?:[.,]\d+)?%?(?![a-z0-9+])',
        ' ',
        text
    )

    # Normalize punctuation, but keep "50+" and "PA+ / PA++ / PA+++ / PA++++"
    text = text.replace('_', ' ')
    text = re.sub(
        r"(\d+\+|\bpa\++)|[^\w\s.'&]",
        lambda m: m.group(1) or ' ',
        text
    )
    text = re.sub(r"(?<![^\W_])[.'&]|[.'&](?![^\W_])", ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()

    return text


clean_title = clean_productTitle