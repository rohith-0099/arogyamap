"""Groq Whisper STT + Llama 3.3 medical triage."""

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Optional

from groq import Groq

_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SYSTEM_PROMPT = (
    "You are a medical triage assistant for rural India. "
    "Respond ONLY in JSON with no extra text: "
    '{"symptoms_summary":"string","urgency":"low|medium|high",'
    '"advice":"string","see_doctor":true|false,'
    '"detected_language":"en|hi|ml|ta|te|kn|mr|gu|bn|pa",'
    '"symptom_category":"fever|cough|respiratory|stomach|headache|skin|injury|other"}. '
    "urgency: low=rest at home, medium=see doctor this week, high=go to emergency now. "
    "Write advice in the same language the patient spoke. "
    "symptoms_summary must be a short English phrase (3-6 words)."
)


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio bytes using Groq Whisper."""
    with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        with open(tmp_path, "rb") as f:
            transcription = _client.audio.transcriptions.create(
                file=(filename, f, "audio/webm"),
                model="whisper-large-v3",
                response_format="text",
            )
        return str(transcription).strip()
    finally:
        os.unlink(tmp_path)


def triage_text(text: str, language_hint: str = "en") -> dict:
    """Run Llama 3.3 triage on symptom text."""
    prompt = f"Patient symptoms (language hint: {language_hint}): {text}"

    response = _client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=512,
    )

    raw = response.choices[0].message.content or "{}"

    # Extract JSON from response
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return _default_triage()

    try:
        result = json.loads(match.group())
    except json.JSONDecodeError:
        return _default_triage()

    # Validate urgency
    if result.get("urgency") not in ("low", "medium", "high"):
        result["urgency"] = "low"

    return result


def triage_audio(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    """Transcribe then triage audio. Returns merged result."""
    transcription = transcribe_audio(audio_bytes, filename)
    if not transcription:
        return _default_triage()

    result = triage_text(transcription)
    result["transcription"] = transcription
    return result


def _default_triage() -> dict:
    return {
        "symptoms_summary": "unspecified symptoms",
        "urgency": "low",
        "advice": "Please consult a doctor if symptoms persist.",
        "see_doctor": False,
        "detected_language": "en",
        "symptom_category": "other",
        "transcription": "",
    }
