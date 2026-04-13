"""Weekly auto-generated district health bulletin via Groq + gTTS."""

import io
import json
import logging
import os
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

from database import get_reports_for_bulletin
from tts_reply import generate_voice_reply

logger = logging.getLogger(__name__)

_groq = Groq(api_key=os.getenv("GROQ_API_KEY"))
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
BULLETIN_CHANNEL = os.getenv("BULLETIN_CHANNEL", "")  # Telegram channel @username


def generate_bulletin(days: int = 7) -> dict:
    """Generate weekly health bulletin in English and Malayalam."""
    reports = get_reports_for_bulletin(days=days)

    # Aggregate stats
    by_city: dict[str, dict] = {}
    for r in reports:
        city = r.get("city") or "Unknown"
        if city not in by_city:
            by_city[city] = {"total": 0, "high": 0, "medium": 0, "symptoms": {}}
        by_city[city]["total"] += 1
        if r["urgency"] == "high":
            by_city[city]["high"] += 1
        elif r["urgency"] == "medium":
            by_city[city]["medium"] += 1
        sym = r.get("symptoms_summary", "other")
        by_city[city]["symptoms"][sym] = by_city[city]["symptoms"].get(sym, 0) + 1

    stats_text = "\n".join(
        f"{city}: {v['total']} reports ({v['high']} high urgency)"
        for city, v in sorted(by_city.items(), key=lambda x: -x[1]["total"])
    ) or "No reports this week."

    prompt = f"""
You are a public health officer writing a weekly disease bulletin for Kerala, India.
Based on this week's anonymous community reports, write a brief bulletin in both English AND Malayalam.

Report Summary:
{stats_text}

Total reports: {len(reports)}
Week: {datetime.now().strftime('%B %d, %Y')}

Write:
1. English bulletin (3-4 sentences): district highlights, dominant symptoms, public advice
2. Malayalam bulletin (translation of the same)

Format as JSON: {{"english": "...", "malayalam": "..."}}
"""

    try:
        response = _groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=1000,
        )
        raw = response.choices[0].message.content or "{}"
        import re
        match = re.search(r"\{[\s\S]*\}", raw)
        bulletin = json.loads(match.group()) if match else {}
    except Exception as e:
        logger.error(f"Groq bulletin generation error: {e}")
        bulletin = {
            "english": f"Weekly health bulletin for Kerala — {len(reports)} community reports received.",
            "malayalam": "കേരളത്തിന്റെ ആഴ്ചയിലെ ആരോഗ്യ ബുള്ളറ്റിൻ.",
        }

    return {
        "english": bulletin.get("english", ""),
        "malayalam": bulletin.get("malayalam", ""),
        "stats": by_city,
        "total_reports": len(reports),
        "week": datetime.now().strftime("%Y-%m-%d"),
    }


def post_to_telegram(bulletin: dict) -> bool:
    """Post bulletin text + audio to Telegram channel."""
    if not TELEGRAM_TOKEN or not BULLETIN_CHANNEL:
        logger.warning("Telegram channel not configured for bulletin")
        return False

    import httpx

    base_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"
    text = (
        f"📊 *ArogyaMap Weekly Health Bulletin*\n"
        f"Week of {bulletin['week']}\n\n"
        f"🇬🇧 *English:*\n{bulletin['english']}\n\n"
        f"🇮🇳 *Malayalam:*\n{bulletin['malayalam']}\n\n"
        f"_Total community reports: {bulletin['total_reports']}_"
    )

    try:
        # Send text
        httpx.post(
            f"{base_url}/sendMessage",
            json={
                "chat_id": BULLETIN_CHANNEL,
                "text": text,
                "parse_mode": "Markdown",
            },
            timeout=10,
        )

        # Send English audio
        audio_en = generate_voice_reply(bulletin["english"], "en")
        if audio_en:
            httpx.post(
                f"{base_url}/sendAudio",
                data={"chat_id": BULLETIN_CHANNEL, "caption": "Weekly bulletin (English)"},
                files={"audio": ("bulletin_en.mp3", audio_en, "audio/mpeg")},
                timeout=30,
            )

        # Send Malayalam audio
        audio_ml = generate_voice_reply(bulletin["malayalam"], "ml")
        if audio_ml:
            httpx.post(
                f"{base_url}/sendAudio",
                data={"chat_id": BULLETIN_CHANNEL, "caption": "Weekly bulletin (Malayalam)"},
                files={"audio": ("bulletin_ml.mp3", audio_ml, "audio/mpeg")},
                timeout=30,
            )

        return True
    except Exception as e:
        logger.error(f"Telegram bulletin post error: {e}")
        return False


def run_bulletin():
    """Generate and post the weekly bulletin."""
    logger.info("Generating weekly health bulletin…")
    bulletin = generate_bulletin()
    success = post_to_telegram(bulletin)
    logger.info(f"Bulletin posted: {success}")
    return bulletin
