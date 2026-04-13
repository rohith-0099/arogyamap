"""
FastAPI server — main entry point for Python backend.
Starts background threads: Telegram bot, email poller, outbreak detector.
"""

import asyncio
import io
import json
import logging
import os
import sys
import threading
import time
from contextlib import asynccontextmanager
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, Form, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv()

# Add python/ dir to sys.path
sys.path.insert(0, os.path.dirname(__file__))

from channel_router import from_web_form
from triage import triage_audio, triage_text
from acoustic import analyse_audio
from photo import analyse_photo_sync
from clinic_finder import find_nearest_clinics
from tts_reply import generate_voice_reply
from database import insert_report, get_recent_reports
from outbreak_detector import run_outbreak_detection
from utils.location import resolve_location, preload as preload_location
from utils.validation import is_duplicate, compute_confidence, anonymise_location, build_user_hash

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

    # Pre-warm location index at startup to avoid cold-start latency
    try:
        preload_location()
    except Exception as e:
        logger.warning(f"Location preload failed (non-fatal): {e}")

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
            # Ensure a new event loop exists for this background thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
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
# ── Rate Limiter Configuration ──────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="ArogyaMap API",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
@limiter.limit("5/minute")
async def process_report(
    request: Request,
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

    # 0. Location resolution (GPS → fuzzy → LLM → unassigned)
    location = resolve_location(raw_lat=lat, raw_lng=lng, text=text)

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
            lat=location.get("lat", lat),
            lng=location.get("lng", lng),
            city=location.get("city") or "",
            zone_name=location.get("zone_name"),
            district=location.get("district"),
            state=location.get("state"),
            country=location.get("country"),
            resolution_method=location.get("resolution_method", "unassigned"),
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
@limiter.limit("30/minute")
async def get_outbreak(request: Request):
    """Run outbreak detection and return clusters."""
    clusters = run_outbreak_detection()
    return {"clusters": clusters}


# ── Channel-specific report endpoints ───────────────────────────────────────

async def _process_and_save(
    *,
    audio_bytes: Optional[bytes] = None,
    audio_filename: str = "audio.webm",
    photo_bytes: Optional[bytes] = None,
    photo_mime: str = "image/jpeg",
    text: Optional[str] = None,
    raw_lat: Optional[float] = None,
    raw_lng: Optional[float] = None,
    channel: str,
    user_seed: str = "",
) -> dict:
    """Shared processing pipeline used by all channel endpoints."""
    # 1. Location resolution (GPS → fuzzy → LLM → unassigned)
    location = resolve_location(raw_lat=raw_lat, raw_lng=raw_lng, text=text)

    # 2. Acoustic analysis
    acoustic: dict = {}
    if audio_bytes:
        try:
            acoustic = analyse_audio(audio_bytes, audio_filename)
        except Exception as e:
            logger.warning(f"Acoustic analysis failed: {e}")

    # 3. Triage
    if audio_bytes:
        triage = triage_audio(audio_bytes, audio_filename)
        if text:
            triage["transcription"] = f"{triage.get('transcription', '')} {text}".strip()
    else:
        triage = triage_text(text or "")

    # 4. Photo analysis
    photo_analysis = ""
    if photo_bytes:
        try:
            photo_analysis = analyse_photo_sync(photo_bytes, photo_mime)
        except Exception as e:
            logger.warning(f"Photo analysis failed: {e}")

    # 5. Confidence scoring
    confidence = compute_confidence(location["resolution_method"], triage, acoustic)

    # 6. Deduplication check (last 30 min in same zone)
    recent = get_recent_reports(hours=1)
    candidate = {
        "symptoms_summary": triage.get("symptoms_summary", ""),
        "zone_name": location.get("zone_name"),
    }
    dedup, dup_id = is_duplicate(candidate, recent)
    if dedup:
        logger.info(f"[{channel}] Duplicate suppressed (matches report {dup_id})")
        return {
            "duplicate": True,
            "duplicate_of": dup_id,
            "symptoms_summary": triage.get("symptoms_summary", ""),
            "urgency": triage.get("urgency", "low"),
            "advice": triage.get("advice", ""),
            "confidence": confidence,
            "resolution_method": location["resolution_method"],
        }

    # 7. Anonymise GPS for storage (500m grid)
    anon_lat, anon_lng = anonymise_location(location.get("lat"), location.get("lng"))

    # 8. Find nearest clinics
    clinics = []
    if anon_lat and anon_lng:
        try:
            clinics = find_nearest_clinics(anon_lat, anon_lng)
        except Exception:
            pass

    # 9. Voice reply
    advice = triage.get("advice", "Please consult a doctor if symptoms persist.")
    language = triage.get("detected_language", "en")
    audio_reply_bytes = b""
    try:
        audio_reply_bytes = generate_voice_reply(advice, language)
    except Exception:
        pass

    # 10. Persist to Supabase
    urgency = triage.get("urgency", "low")
    symptoms_summary = triage.get("symptoms_summary", "unspecified symptoms")
    user_hash = build_user_hash(channel, user_seed)

    saved_id = None
    try:
        row = insert_report(
            channel=channel,
            symptoms_raw=triage.get("transcription", text or "")[:500],
            symptoms_summary=symptoms_summary,
            urgency=urgency,
            advice=advice,
            lat=anon_lat,
            lng=anon_lng,
            city=location.get("city") or "",
            zone_name=location.get("zone_name"),
            district=location.get("district"),
            state=location.get("state"),
            country=location.get("country"),
            resolution_method=location["resolution_method"],
            has_cough=acoustic.get("has_cough", False),
            voice_stress=acoustic.get("voice_stress", 0.0),
            cough_type=acoustic.get("cough_type", "none"),
            photo_analysis=photo_analysis,
            language=language,
            user_seed=user_hash,
        )
        saved_id = row.get("id") if isinstance(row, dict) else None
    except Exception as e:
        logger.error(f"DB insert error [{channel}]: {e}")

    result: dict = {
        "id": saved_id,
        "duplicate": False,
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
        "zone_name": location.get("zone_name"),
        "district": location.get("district"),
        "resolution_method": location["resolution_method"],
        "confidence": confidence,
    }

    if audio_reply_bytes:
        import base64
        result["audio_reply_b64"] = base64.b64encode(audio_reply_bytes).decode()
        result["audio_reply_mime"] = "audio/mpeg"

    return result


@app.post("/report/web")
@limiter.limit("5/minute")
async def report_web(
    request: Request,
    audio: Optional[UploadFile] = File(None),
    photo: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
):
    """
    Web channel report endpoint.
    GPS coordinates take priority for location resolution.
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

    return JSONResponse(
        content=await _process_and_save(
            audio_bytes=audio_bytes,
            audio_filename=audio_filename,
            photo_bytes=photo_bytes,
            photo_mime=photo_mime,
            text=text,
            raw_lat=lat,
            raw_lng=lng,
            channel="web",
        )
    )


@app.post("/report/telegram")
@limiter.limit("10/minute")
async def report_telegram(
    request: Request,
    audio: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    telegram_user_id: Optional[str] = Form(None),
):
    """
    Telegram channel report endpoint.
    Location is shared via Telegram's native location pin.
    User identity hashed from Telegram user ID (never stored raw).
    """
    if not audio and not text:
        raise HTTPException(status_code=400, detail="audio or text required")

    audio_bytes = None
    audio_filename = "audio.ogg"
    if audio:
        audio_bytes = await audio.read()
        audio_filename = audio.filename or "audio.ogg"

    return JSONResponse(
        content=await _process_and_save(
            audio_bytes=audio_bytes,
            audio_filename=audio_filename,
            text=text,
            raw_lat=lat,
            raw_lng=lng,
            channel="telegram",
            user_seed=telegram_user_id or "",
        )
    )


@app.post("/report/email")
@limiter.limit("10/minute")
async def report_email(
    request: Request,
    audio: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    sender_hash: Optional[str] = Form(None),
):
    """
    Email channel report endpoint.
    No GPS available — location extracted from email text via fuzzy match → LLM.
    Sender identity must be pre-hashed by the email poller (never sent raw).
    """
    if not audio and not text:
        raise HTTPException(status_code=400, detail="audio or text required")

    audio_bytes = None
    audio_filename = "audio.mp3"
    if audio:
        audio_bytes = await audio.read()
        audio_filename = audio.filename or "audio.mp3"

    return JSONResponse(
        content=await _process_and_save(
            audio_bytes=audio_bytes,
            audio_filename=audio_filename,
            text=text,
            raw_lat=None,
            raw_lng=None,
            channel="email",
            user_seed=sender_hash or "",
        )
    )


# ── Role-aware dashboard API ─────────────────────────────────────────────────

# Role scope:
#   asha_worker  → see only own zone (zone_name filter)
#   supervisor   → see own district (district filter)
#   admin        → see everything

_VALID_ROLES = {"asha_worker", "supervisor", "admin"}
_VALID_URGENCIES = {"high", "medium", "low"}
_VALID_CHANNELS = {"web", "telegram", "email"}
_VALID_SORT = {"timestamp", "urgency", "confidence"}
_VALID_ORDER = {"asc", "desc"}


@app.get("/dashboard/reports")
@limiter.limit("60/minute")
async def dashboard_reports(
    request: Request,
    role: str = "admin",
    city: Optional[str] = None,       # city key from city_lookup (most granular)
    zone: Optional[str] = None,       # internal zone code (derived from city if not supplied)
    district: Optional[str] = None,
    state: Optional[str] = None,
    country: Optional[str] = None,
    urgency: Optional[str] = None,
    channel: Optional[str] = None,
    outbreak_only: bool = False,
    hours: int = 48,
    page: int = 1,
    page_size: int = 25,
    sort_by: str = "timestamp",
    order: str = "desc",
):
    """
    Paginated, role-aware report listing for the ASHA dashboard.

    Role scoping:
      - asha_worker: must supply zone param; only sees that zone
      - supervisor:  must supply district param; only sees that district
      - admin:       sees everything (zone/district params optional filters)

    Query params:
      urgency       — filter by urgency level (high/medium/low)
      channel       — filter by report channel (web/telegram/email)
      outbreak_only — return only reports with outbreak_flag=true
      hours         — lookback window (default 48)
      page          — 1-based page number
      page_size     — results per page (max 100)
      sort_by       — timestamp | urgency | confidence
      order         — asc | desc
    """
    # Input validation
    if role not in _VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {_VALID_ROLES}")
    if urgency and urgency not in _VALID_URGENCIES:
        raise HTTPException(status_code=400, detail=f"urgency must be one of {_VALID_URGENCIES}")
    if channel and channel not in _VALID_CHANNELS:
        raise HTTPException(status_code=400, detail=f"channel must be one of {_VALID_CHANNELS}")
    if sort_by not in _VALID_SORT:
        raise HTTPException(status_code=400, detail=f"sort_by must be one of {_VALID_SORT}")
    if order not in _VALID_ORDER:
        raise HTTPException(status_code=400, detail=f"order must be one of {_VALID_ORDER}")
    if page < 1:
        raise HTTPException(status_code=400, detail="page must be >= 1")
    page_size = min(max(page_size, 1), 100)

    # If city provided, resolve to district/state/country via city_lookup.
    # NOTE: we deliberately do NOT inherit `zone` from city_lookup, because the
    # reports table stores zone_name from the GPS polygon pipeline (district-level
    # in zones.geojson), while city_lookup has finer sub-zones. Filter by district
    # instead and narrow further via the `city` column if available.
    city_raw_name = None
    if city:
        from utils.location import CITY_LOOKUP_PATH
        try:
            with open(CITY_LOOKUP_PATH, encoding="utf-8") as f:
                _lookup = json.load(f)
            city_info = _lookup.get(city.lower())
            if city_info:
                district = district or city_info.get("district")
                state    = state    or city_info.get("state")
                country  = country  or city_info.get("country")
                city_raw_name = city.lower()
        except Exception:
            pass

    # Role-based scope — asha_worker must at least pick a district (city optional).
    if role == "asha_worker" and not district and not zone:
        return {
            "reports": [],
            "pagination": {"page": 1, "page_size": page_size, "total": 0, "pages": 1},
            "stats": {"total": 0, "by_urgency": {"high": 0, "medium": 0, "low": 0}, "outbreak_count": 0},
            "filters": {"role": role, "city": city, "zone": zone, "district": district,
                        "state": state, "country": country,
                        "urgency": urgency, "channel": channel, "outbreak_only": outbreak_only, "hours": hours},
            "zone_required": True,
        }

    # Fetch from DB
    from datetime import timedelta
    from database import _get_client

    client = _get_client()

    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    query = (
        client.table("reports")
        .select(
            "id, timestamp, channel, symptoms_summary, urgency, advice, "
            "zone_name, district, state, country, resolution_method, has_cough, cough_type, "
            "voice_stress, outbreak_flag, follow_up_status, language"
        )
        .gte("timestamp", since)
    )

    # Role scoping
    if role == "asha_worker":
        if district:
            query = query.eq("district", district)
        elif zone:
            query = query.eq("zone_name", zone)
    elif role == "supervisor":
        if district:
            query = query.eq("district", district)
    else:
        if zone:
            query = query.eq("zone_name", zone)
        if district:
            query = query.eq("district", district)

    # Geographic hierarchy filters
    if state:
        query = query.eq("state", state)
    if country:
        query = query.eq("country", country)
    # Note: we intentionally don't filter by reports.city here — it's often empty
    # (GPS-resolved reports only populate district/zone_name). District is enough.

    # Optional filters
    if urgency:
        query = query.eq("urgency", urgency)
    if channel:
        query = query.eq("channel", channel)
    if outbreak_only:
        query = query.eq("outbreak_flag", True)

    # Sorting
    sort_col = sort_by if sort_by != "confidence" else "timestamp"
    query = query.order(sort_col, desc=(order == "desc"))

    # Pagination
    offset = (page - 1) * page_size
    query = query.range(offset, offset + page_size - 1)

    result = query.execute()
    rows = result.data or []

    # Stats for the current filter set (unfiltered count query)
    stats_query = (
        client.table("reports")
        .select("urgency, outbreak_flag", count="exact")
        .gte("timestamp", since)
    )
    if role == "asha_worker":
        if district:
            stats_query = stats_query.eq("district", district)
        elif zone:
            stats_query = stats_query.eq("zone_name", zone)
    elif role == "supervisor":
        if district:
            stats_query = stats_query.eq("district", district)
    else:
        if zone:
            stats_query = stats_query.eq("zone_name", zone)
        if district:
            stats_query = stats_query.eq("district", district)
    if state:
        stats_query = stats_query.eq("state", state)
    if country:
        stats_query = stats_query.eq("country", country)

    stats_result = stats_query.execute()
    total_count = stats_result.count or 0
    stats_rows = stats_result.data or []

    urgency_counts = {"high": 0, "medium": 0, "low": 0}
    outbreak_count = 0
    for r in stats_rows:
        u = r.get("urgency", "low")
        if u in urgency_counts:
            urgency_counts[u] += 1
        if r.get("outbreak_flag"):
            outbreak_count += 1

    return {
        "reports": rows,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total_count,
            "pages": max(1, -(-total_count // page_size)),  # ceiling division
        },
        "stats": {
            "total": total_count,
            "by_urgency": urgency_counts,
            "outbreak_count": outbreak_count,
        },
        "filters": {
            "role": role,
            "city": city,
            "zone": zone,
            "district": district,
            "state": state,
            "country": country,
            "urgency": urgency,
            "channel": channel,
            "outbreak_only": outbreak_only,
            "hours": hours,
        },
    }


@app.get("/hierarchy")
async def get_hierarchy():
    """
    Return the full Country → State → District → City hierarchy
    derived from city_lookup.json (single source of truth).

    City is the granular unit — what an ASHA worker selects to scope their view.
    Zone is the internal routing code derived from city; not exposed in the UI.
    """
    import json as _json
    from utils.location import CITY_LOOKUP_PATH
    from collections import defaultdict

    try:
        with open(CITY_LOOKUP_PATH, encoding="utf-8") as f:
            lookup = _json.load(f)
    except FileNotFoundError:
        return {"countries": [], "states_by_country": {}, "districts_by_state": {}, "cities_by_district": {}, "city_meta": {}}

    countries: set[str] = set()
    states_by_country: dict[str, set] = defaultdict(set)
    districts_by_state: dict[str, set] = defaultdict(set)
    cities_by_district: dict[str, list] = defaultdict(list)
    # city_meta: canonical city display name → {zone, district, state, country, lat, lng}
    city_meta: dict[str, dict] = {}

    for key, v in lookup.items():
        if key.startswith("_"):
            continue
        country  = v.get("country",  "Unknown")
        state    = v.get("state",    "Unknown")
        district = v.get("district", "Unknown")
        zone     = v.get("zone",     "Unknown")
        lat      = v.get("lat")
        lng      = v.get("lng")

        # Canonical display name = title-case of key
        display = key.title()

        countries.add(country)
        states_by_country[country].add(state)
        districts_by_state[state].add(district)

        # Deduplicate cities by display name within district
        existing = [c["name"] for c in cities_by_district[district]]
        if display not in existing:
            cities_by_district[district].append({
                "name": display,
                "key": key,
                "zone": zone,
                "lat": lat,
                "lng": lng,
            })

        # Index by key for fast lookup
        city_meta[key] = {
            "zone": zone,
            "district": district,
            "state": state,
            "country": country,
            "lat": lat,
            "lng": lng,
        }

    return {
        "countries": sorted(countries),
        "states_by_country":  {k: sorted(v) for k, v in states_by_country.items()},
        "districts_by_state": {k: sorted(v) for k, v in districts_by_state.items()},
        "cities_by_district": {k: sorted(v, key=lambda x: x["name"]) for k, v in cities_by_district.items()},
        "city_meta": city_meta,
    }


# Keep /zones as a backwards-compatible alias
@app.get("/zones")
async def get_zones():
    return await get_hierarchy()


@app.get("/zones/geojson")
async def get_zones_geojson():
    """Serve raw zones.geojson for map polygon overlay."""
    from utils.location import ZONES_GEOJSON_PATH
    try:
        with open(ZONES_GEOJSON_PATH, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"type": "FeatureCollection", "features": []}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
