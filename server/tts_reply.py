"""gTTS voice response generation."""

import io
import os
from typing import Optional

from gtts import gTTS

# Language code mapping for common Indian languages
LANGUAGE_MAP = {
    "en": "en",
    "hi": "hi",
    "ml": "ml",
    "ta": "ta",
    "te": "te",
    "kn": "kn",
    "mr": "mr",
    "gu": "gu",
    "bn": "bn",
    "pa": "pa",
}


def generate_voice_reply(
    text: str,
    language: str = "en",
    slow: bool = False,
) -> bytes:
    """
    Convert advice text to MP3 audio bytes using gTTS.
    Returns raw MP3 bytes.
    """
    lang_code = LANGUAGE_MAP.get(language, "en")

    try:
        tts = gTTS(text=text, lang=lang_code, slow=slow)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        print(f"[tts] gTTS error (lang={lang_code}): {e}")
        # Fallback to English
        if lang_code != "en":
            try:
                tts = gTTS(text=text, lang="en", slow=False)
                buf = io.BytesIO()
                tts.write_to_fp(buf)
                buf.seek(0)
                return buf.read()
            except Exception as e2:
                print(f"[tts] English fallback also failed: {e2}")
        return b""


def save_voice_reply(
    text: str,
    language: str = "en",
    output_path: str = "/tmp/reply.mp3",
) -> Optional[str]:
    """Save voice reply to file and return path."""
    audio_bytes = generate_voice_reply(text, language)
    if not audio_bytes:
        return None
    with open(output_path, "wb") as f:
        f.write(audio_bytes)
    return output_path
