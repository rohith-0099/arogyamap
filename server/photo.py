"""Groq vision photo symptom analysis (Llama-4 Scout)."""

import base64
import logging
import os

logger = logging.getLogger(__name__)

_GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")

_PROMPT = (
    "You are a medical image analyst for a rural health app in India. "
    "Look at this image and describe any visible symptoms or health conditions in 1-2 sentences. "
    "Focus on: skin conditions (rash, redness, swelling, wound), visible illness signs, "
    "or any health concern visible in the photo. "
    "If no health concern is visible, say 'No visible health concern detected.' "
    "Be concise and clinical."
)


def analyse_photo_sync(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Send image to Groq vision model and return a short description string."""
    if not _GROQ_API_KEY:
        return "Photo analysis unavailable (no API key)."

    try:
        from groq import Groq
    except ImportError:
        logger.warning("[photo] groq package not installed")
        return "Photo analysis unavailable."

    try:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64}"

        client = Groq(api_key=_GROQ_API_KEY)
        resp = client.chat.completions.create(
            model=_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _PROMPT},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            temperature=0.2,
            max_tokens=180,
        )
        text = (resp.choices[0].message.content or "").strip()
        return text[:500] if text else "No visual findings."

    except Exception as e:
        logger.warning(f"[photo] Groq vision error: {e}")
        return "Photo analysis failed."


async def analyse_photo(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Async wrapper — Groq SDK is sync, so we run it in a thread."""
    import asyncio
    return await asyncio.to_thread(analyse_photo_sync, image_bytes, mime_type)
