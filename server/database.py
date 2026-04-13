"""Supabase database operations via supabase-py client."""

import hashlib
import os
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client, Client

for _env_path in [Path(".env.local"), Path("../.env.local")]:
    if _env_path.exists():
        load_dotenv(_env_path)
        break
else:
    load_dotenv()

_SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

if not _SUPABASE_URL or not _SERVICE_KEY:
    raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY")


def _get_client() -> Client:
    return create_client(_SUPABASE_URL, _SERVICE_KEY)


def insert_report(
    *,
    channel: str,
    symptoms_raw: str = "",
    symptoms_summary: str,
    urgency: str,
    advice: str = "",
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    city: str = "",
    zone_name: Optional[str] = None,
    district: Optional[str] = None,
    resolution_method: str = "unassigned",
    has_cough: bool = False,
    voice_stress: float = 0.0,
    cough_type: str = "none",
    photo_analysis: str = "",
    language: str = "en",
    user_seed: str = "",
) -> dict:
    """Insert a single report and return the inserted row."""
    user_hash = hashlib.md5(
        (user_seed or channel + str(datetime.now(timezone.utc))).encode()
    ).hexdigest()

    row = {
        "user_hash": user_hash,
        "lat": lat,
        "lng": lng,
        "city": city or None,
        "zone_name": zone_name,
        "district": district,
        "resolution_method": resolution_method,
        "symptoms_raw": symptoms_raw,
        "symptoms_summary": symptoms_summary,
        "urgency": urgency,
        "advice": advice,
        "has_cough": has_cough,
        "voice_stress": float(voice_stress),
        "cough_type": cough_type or "none",
        "photo_analysis": photo_analysis or None,
        "channel": channel,
        "language": language,
    }

    client = _get_client()
    result = client.table("reports").insert(row).execute()

    if result.data:
        return result.data[0]
    return row


def get_recent_reports(hours: int = 48, limit: int = 500) -> list[dict]:
    """Fetch reports from the last N hours."""
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    client = _get_client()
    result = (
        client.table("reports")
        .select("*")
        .gte("timestamp", since)
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


def update_follow_up(report_id: int, status: str) -> None:
    """Update follow-up status for a report."""
    client = _get_client()
    client.table("reports").update({"follow_up_status": status}).eq("id", report_id).execute()


def mark_follow_up_sent(report_id: int) -> None:
    """Mark that a follow-up message was sent."""
    client = _get_client()
    client.table("reports").update({"follow_up_sent": True}).eq("id", report_id).execute()


def get_reports_for_bulletin(days: int = 7) -> list[dict]:
    """Get reports for weekly bulletin."""
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    client = _get_client()
    result = (
        client.table("reports")
        .select("city, symptoms_summary, urgency, channel, timestamp")
        .gte("timestamp", since)
        .order("timestamp", desc=True)
        .execute()
    )
    return result.data or []


def mark_outbreak_flag(report_ids: list[int]) -> None:
    """Mark reports as part of an outbreak cluster."""
    if not report_ids:
        return
    client = _get_client()
    client.table("reports").update({"outbreak_flag": True}).in_("id", report_ids).execute()
