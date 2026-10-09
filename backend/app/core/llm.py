# /backend/app/core/llm.py
import os, json, re
import httpx

PROMPT = (
    "From this marketplace product page screenshot, extract the product title "
    "and the store name. Reply only with JSON: {\"title\": ..., \"store\": ...}. "
    "If either is not clearly visible, use null. Do not guess."
)

def extract_listing(image_data_url: str) -> dict:
    api_key = os.getenv("LLM_API_KEY")
    try:
        header, b64 = image_data_url.split(",", 1)
        media_type = header.split(";")[0].replace("data:", "") 

        res = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 200,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                        {"type": "text", "text": PROMPT},
                    ],
                }],
            },
            timeout=30,
        )
        res.raise_for_status()
        text = res.json()["content"][0]["text"]

        match = re.search(r"\{.*\}", text, re.S)   
        data = json.loads(match.group(0))
        return {"title": data.get("title"), "store": data.get("store")}
    except httpx.HTTPStatusError as e:
        print("LLM HTTP error:", e.response.status_code, e.response.text)
        return {"title": None, "store": None}
    except Exception as e:
        print("LLM error:", e)
        return {"title": None, "store": None}
