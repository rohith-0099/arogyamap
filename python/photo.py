"""HuggingFace LLaVA photo symptom analysis."""

import base64
import os
from typing import Optional

import httpx

_HF_API_KEY = os.getenv("HF_API_KEY", "")
_MODEL = "llava-hf/llava-1.5-7b-hf"
_API_URL = f"https://api-inference.huggingface.co/models/{_MODEL}"

_PROMPT = (
    "You are a medical image analyst for a rural health app in India. "
    "Look at this image and describe any visible symptoms or health conditions in 1-2 sentences. "
    "Focus on: skin conditions (rash, redness, swelling, wound), visible illness signs, "
    "or any health concern visible in the photo. "
    "If no health concern is visible, say 'No visible health concern detected.' "
    "Be concise and clinical."
)


async def analyse_photo(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """
    Send image to HuggingFace LLaVA for medical visual analysis.
    Returns a short description string.
    """
    if not _HF_API_KEY:
        return "Photo analysis unavailable (no API key)."

    try:
        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64_image}"

        payload = {
            "inputs": {
                "image": data_url,
                "text": _PROMPT,
            }
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {_HF_API_KEY}",
                    "Content-Type": "application/json",
                },
            )

        if resp.status_code == 200:
            result = resp.json()
            # HF inference API returns list or dict depending on model
            if isinstance(result, list) and result:
                text = result[0].get("generated_text", "")
            elif isinstance(result, dict):
                text = result.get("generated_text", "")
            else:
                text = str(result)

            # Clean up — remove the prompt echo if present
            if _PROMPT[:20] in text:
                text = text.split(_PROMPT)[-1].strip()

            return text[:500] if text else "No visual findings."
        else:
            print(f"[photo] HF API error {resp.status_code}: {resp.text[:200]}")
            return "Photo analysis temporarily unavailable."

    except Exception as e:
        print(f"[photo] Analysis error: {e}")
        return "Photo analysis failed."


def analyse_photo_sync(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Synchronous wrapper for photo analysis."""
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(
                    asyncio.run, analyse_photo(image_bytes, mime_type)
                )
                return future.result(timeout=35)
        else:
            return loop.run_until_complete(analyse_photo(image_bytes, mime_type))
    except Exception as e:
        print(f"[photo] Sync wrapper error: {e}")
        return "Photo analysis failed."
