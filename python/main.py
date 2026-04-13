"""
FastAPI server — main entry point for Python backend.
Starts background threads: Telegram bot, email poller, outbreak detector.
"""

import asyncio
import io
import logging
import os
import sys
import threading
import time
from contextlib import asynccontextmanager
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, Form, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

load_dotenv()

# Add python/ dir to sys.path
sys.path.insert(0, os.path.dirname(__file__))

from channel_router import from_web_form
from triage import triage_audio, triage_text
from acoustic import analyse_audio
from photo import analyse_photo_sync
from clinic_finder import find_nearest_clinics
from tts_reply import generate_voice_reply
from database import insert_report
from outbreak_detector import run_outbreak_detection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("arogyamap")

# ── Background scheduler ────────────────────────────────────────────────────
scheduler = BackgroundScheduler()


def _outbreak_job():
    try:
        clusters = run_outbreak_detection()
        if clusters:
            logger.info(f"Outbreak detection: {len(clusters)} cluster(s) found")
    except Exception as e:
        logger.error(f"Outbreak job error: {e}")


def _bulletin_job():
    try:
        from bulletin import run_bulletin
        run_bulletin()
    except Exception as e:
        logger.error(f"Bulletin job error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("ArogyaMap Python backend starting…")

    # Outbreak check every 15 minutes
    scheduler.add_job(_outbreak_job, "interval", minutes=15, id="outbreak")

    # Weekly bulletin every Sunday at midnight
    scheduler.add_job(
        _bulletin_job,
        "cron",
        day_of_week="sun",
        hour=0,
        minute=0,
        id="bulletin",
    )

    scheduler.start()
    logger.info("APScheduler started")

    # Start Telegram bot in background thread
    _start_telegram_thread()

    # Start email poller in background thread
    _start_email_thread()

    yield

    # Shutdown
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


def _start_telegram_thread():
    """Run Telegram bot in a background thread with its own event loop."""
    token = os.getenv("TELEGRAM_TOKEN", "")
    if not token:
        logger.warning("TELEGRAM_TOKEN not set — bot not started")
        return

    def _run():
        try:
            from telegram_bot import build_app
            bot_app = build_app()
            # Disable signal handlers because we are in a background thread
            bot_app.run_polling(drop_pending_updates=True, stop_signals=False)
        except Exception as e:
            logger.error(f"Telegram thread error: {e}")

    t = threading.Thread(target=_run, daemon=True, name="telegram-bot")
    t.start()
    logger.info("Telegram bot thread started")


def _start_email_thread():
    """Run email poller in background thread."""
    gmail_user = os.getenv("GMAIL_USER", "")
    if not gmail_user:
        logger.warning("GMAIL_USER not set — email poller not started")
        return

    def _run():
        from email_poller import run_forever
        run_forever()

    t = threading.Thread(target=_run, daemon=True, name="email-poller")
    t.start()
    logger.info("Email poller thread started")


# ── FastAPI app ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="ArogyaMap API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "arogyamap-python"}


@app.post("/process")
async def process_report(
    audio: Optional[UploadFile] = File(None),
    photo: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    channel: str = Form("web"),
):
    """
    Main processing endpoint — receives multipart form from Next.js API route.
    Returns triage result + saves to Supabase.
    """
    if not audio and not text:
        raise HTTPException(status_code=400, detail="audio or text required")

    audio_bytes = None
    audio_filename = "audio.webm"
    if audio:
        audio_bytes = await audio.read()
        audio_filename = audio.filename or "audio.webm"

    photo_bytes = None
    photo_mime = "image/jpeg"
    if photo:
        photo_bytes = await photo.read()
        photo_mime = photo.content_type or "image/jpeg"

    # 1. Acoustic analysis
    acoustic = {}
    if audio_bytes:
        try:
            acoustic = analyse_audio(audio_bytes, audio_filename)
        except Exception as e:
            logger.warning(f"Acoustic analysis failed: {e}")

    # 2. Triage (audio or text)
    if audio_bytes:
        triage = triage_audio(audio_bytes, audio_filename)
        if text:
            # Append any extra text
            triage["transcription"] = f"{triage.get('transcription', '')} {text}".strip()
    else:
        triage = triage_text(text)

    # 3. Photo analysis
    photo_analysis = ""
    if photo_bytes:
        try:
            photo_analysis = analyse_photo_sync(photo_bytes, photo_mime)
        except Exception as e:
            logger.warning(f"Photo analysis failed: {e}")

    # 4. Find nearest clinics
    clinics = []
    if lat and lng:
        try:
            clinics = find_nearest_clinics(lat, lng)
        except Exception:
            pass

    # 5. Generate voice reply
    advice = triage.get("advice", "Please consult a doctor if symptoms persist.")
    language = triage.get("detected_language", "en")
    audio_reply_bytes = b""
    try:
        audio_reply_bytes = generate_voice_reply(advice, language)
    except Exception:
        pass

    # 6. Save to Supabase
    urgency = triage.get("urgency", "low")
    symptoms_summary = triage.get("symptoms_summary", "unspecified symptoms")

    try:
        insert_report(
            channel=channel,
            symptoms_raw=triage.get("transcription", text or "")[:500],
            symptoms_summary=symptoms_summary,
            urgency=urgency,
            advice=advice,
            lat=lat,
            lng=lng,
            has_cough=acoustic.get("has_cough", False),
            voice_stress=acoustic.get("voice_stress", 0.0),
            cough_type=acoustic.get("cough_type", "none"),
            photo_analysis=photo_analysis,
            language=language,
        )
    except Exception as e:
        logger.error(f"DB insert error: {e}")

    # 7. Build response
    result = {
        "symptoms_summary": symptoms_summary,
        "urgency": urgency,
        "advice": advice,
        "see_doctor": triage.get("see_doctor", False),
        "detected_language": language,
        "symptom_category": triage.get("symptom_category", "other"),
        "photo_analysis": photo_analysis or None,
        "has_cough": acoustic.get("has_cough", False),
        "cough_type": acoustic.get("cough_type", "none"),
        "voice_stress": acoustic.get("voice_stress", 0.0),
        "clinics": clinics,
        "channel": channel,
    }

    # Include base64 audio reply if generated
    if audio_reply_bytes:
        import base64
        result["audio_reply_b64"] = base64.b64encode(audio_reply_bytes).decode()
        result["audio_reply_mime"] = "audio/mpeg"

    return JSONResponse(content=result)


@app.get("/outbreak")
async def get_outbreak():
    """Run outbreak detection and return clusters."""
    clusters = run_outbreak_detection()
    return {"clusters": clusters}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
