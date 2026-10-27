# /backend/app/core/llm.py
import os, json, re
import httpx
import io, base64
from PIL import Image
from concurrent.futures import ThreadPoolExecutor

client = httpx.Client(timeout=30)

BRAND_MODEL = os.getenv("BRAND_MODEL", "claude-sonnet-5-5")

PROMPT = (
    "From this marketplace product page screenshot, reply only with JSON with these keys: "
    "\"title\" (the listing title shown on the page), "
    "\"store\" (the store or seller name). "
    "Ignore promotional overlays and banners (sale tags, buy-1-take-1, prices, shop badges). "
    "Use null for anything not clearly visible. Do not guess."
)

BRAND_PROMPT = (
    "This is a photo of a cosmetic product. Reply with only the manufacturer's brand name "
    "exactly as printed, or the word null. Flavor, shade, or product type is not a brand. "
    "If the text is not clearly legible, reply null. Do not guess."
)

def read_brand(crop_b64):
    with ThreadPoolExecutor(2) as pool:
        fa = pool.submit(call_claude, crop_b64, "image/png", BRAND_PROMPT, 30, BRAND_MODEL)
        fb = pool.submit(call_claude, crop_b64, "image/png", BRAND_PROMPT, 30, BRAND_MODEL)
        a = fa.result().strip().strip('"\'. ')
        b = fb.result().strip().strip('"\'. ')
    if a.lower() == "null" or a.lower() != b.lower():
        return None
    if len(a) > 40 or len(a.split()) > 4:
        return None
    return a

def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())

def crop_data_url(image_data_url, rect, dpr):
    _, b64 = image_data_url.split(",", 1)
    img = Image.open(io.BytesIO(base64.b64decode(b64)))
    box = (rect["x"]*dpr, rect["y"]*dpr, (rect["x"]+rect["w"])*dpr, (rect["y"]+rect["h"])*dpr)
    out = io.BytesIO()

    crop = img.crop(box)
    crop.thumbnail((1568, 1568))
    crop.save(out, format="PNG", compress_level=1)

    return base64.b64encode(out.getvalue()).decode()

def call_claude(b64, media_type, prompt, max_tokens=200, model="claude-haiku-4-5-20251001"):
    res = client.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": os.getenv("LLM_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": model, "max_tokens": max_tokens,
              "messages": [{"role": "user", "content": [
                  {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                  {"type": "text", "text": prompt}]}]},
        timeout=30,
    )
    res.raise_for_status()
    return res.json()["content"][0]["text"]

def extract_listing(image_data_url: str, rect=None, dpr=1) -> dict:
    pool = ThreadPoolExecutor(1)
    try:
        brand_f = pool.submit(lambda: read_brand(crop_data_url(image_data_url, rect, dpr))) if rect else None

        header, b64 = image_data_url.split(",", 1)
        media_type = header.split(";")[0].replace("data:", "") 

        img = Image.open(io.BytesIO(base64.b64decode(b64)))
        if max(img.size) > 1568:
            img.thumbnail((1568, 1568))
            out = io.BytesIO()
            img.convert("RGB").save(out, format="JPEG", quality=92)
            b64, media_type = base64.b64encode(out.getvalue()).decode(), "image/jpeg"

        text = call_claude(b64, media_type, PROMPT)

        match = re.search(r"\{.*\}", text, re.S)   
        if not match:
            return {"title": None, "store": None, "brand": None, "search_text": None, "error": "unreadable"}
        
        data = json.loads(match.group(0))
        title = data.get("title")

        brand = None
        if brand_f and title:
            try:
                brand = brand_f.result()
            except Exception as e:
                print("brand read failed:", e)

        if brand and norm(brand) not in norm(title):
            search_text = f"{brand} {title}"
        else:
            search_text = title

        print("title:", title, "| brand:", brand, "| search_text:", search_text)

        return {
            "title": title,
            "store": data.get("store"),
            "brand": brand,
            "search_text": search_text,
            "error": None if title else "unreadable",
        }
    except httpx.HTTPStatusError as e:
        print("LLM HTTP error:", e.response.status_code, e.response.text)
        return {
            "title": None, 
            "store": None, 
            "brand": None, 
            "search_text": None, 
            "error": "service_error"
        }
    except Exception as e:
        print("LLM error:", e)
        return {
            "title": None, 
            "store": None, 
            "brand": None, 
            "search_text": None, 
            "error": "service_error"
        }
    finally:
        pool.shutdown(wait=False)
