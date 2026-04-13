"""
Report validation, deduplication, and confidence scoring.

Deduplication: same zone + similar symptoms + within time window → likely duplicate.
Confidence: composite score from GPS precision, triage certainty, and acoustic signals.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ── Deduplication config ──────────────────────────────────────────────────────
DEDUP_WINDOW_MINUTES = 30
DEDUP_SYMPTOM_OVERLAP_THRESHOLD = 0.6  # Jaccard similarity

# ── Confidence weights ────────────────────────────────────────────────────────
WEIGHT_GPS = 0.40
WEIGHT_TRIAGE = 0.35
WEIGHT_ACOUSTIC = 0.25


def _symptom_jaccard(a: str, b: str) -> float:
    """Jaccard similarity between two symptom strings (word-level)."""
    tokens_a = set(a.lower().split())
    tokens_b = set(b.lower().split())
    if not tokens_a or not tokens_b:
        return 0.0
    return len(tokens_a & tokens_b) / len(tokens_a | tokens_b)


def is_duplicate(
    new_report: dict,
    recent_reports: list[dict],
    window_minutes: int = DEDUP_WINDOW_MINUTES,
) -> tuple[bool, Optional[int]]:
    """
    Check if new_report is a duplicate of any report in recent_reports.

    Duplicate criteria (ALL must match):
      1. Same zone_name (or both None / unassigned)
      2. Symptom overlap >= threshold (Jaccard)
      3. Within time window

    Returns (is_dup: bool, duplicate_of_id: int | None)
    """
    new_symptoms = new_report.get("symptoms_summary", "")
    new_zone = new_report.get("zone_name") or "unassigned"
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=window_minutes)

    for report in recent_reports:
        # Time window check
        ts_raw = report.get("timestamp")
        if ts_raw:
            try:
                if isinstance(ts_raw, str):
                    ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                else:
                    ts = ts_raw
                if ts < cutoff:
                    continue
            except ValueError:
                continue

        # Zone check
        report_zone = report.get("zone_name") or "unassigned"
        if report_zone != new_zone:
            continue

        # Symptom similarity check
        report_symptoms = report.get("symptoms_summary", "")
        if _symptom_jaccard(new_symptoms, report_symptoms) >= DEDUP_SYMPTOM_OVERLAP_THRESHOLD:
            return True, report.get("id")

    return False, None


def compute_confidence(
    resolution_method: str,
    triage: dict,
    acoustic: Optional[dict] = None,
) -> float:
    """
    Compute a composite confidence score [0.0, 1.0] for a report.

    GPS score — based on resolution method:
        gps          → 1.0
        text_fuzzy   → 0.7
        text_llm     → 0.5
        unassigned   → 0.2

    Triage score — based on urgency and whether triage returned structured data:
        high urgency   → 1.0
        medium         → 0.7
        low            → 0.4
        missing fields → penalised

    Acoustic score — cough detected & stress level present:
        has_cough + stress ∈ (0, 1) → 0.8–1.0
        no acoustic data             → 0.5

    Returns weighted average.
    """
    # GPS / location confidence
    gps_scores = {
        "gps": 1.0,
        "text_fuzzy": 0.7,
        "text_llm": 0.5,
        "unassigned": 0.2,
    }
    gps_score = gps_scores.get(resolution_method, 0.2)

    # Triage confidence
    urgency = triage.get("urgency", "low")
    urgency_scores = {"high": 1.0, "medium": 0.7, "low": 0.4}
    triage_base = urgency_scores.get(urgency, 0.4)

    # Penalise if key fields are missing
    has_summary = bool(triage.get("symptoms_summary", "").strip())
    has_advice = bool(triage.get("advice", "").strip())
    if not has_summary:
        triage_base *= 0.6
    if not has_advice:
        triage_base *= 0.8

    triage_score = min(triage_base, 1.0)

    # Acoustic confidence
    if acoustic:
        has_cough = acoustic.get("has_cough", False)
        voice_stress = float(acoustic.get("voice_stress", 0.0))
        if has_cough and 0 < voice_stress <= 1.0:
            acoustic_score = 0.9
        elif has_cough:
            acoustic_score = 0.75
        elif voice_stress > 0:
            acoustic_score = 0.65
        else:
            acoustic_score = 0.5
    else:
        acoustic_score = 0.5

    score = (
        WEIGHT_GPS * gps_score
        + WEIGHT_TRIAGE * triage_score
        + WEIGHT_ACOUSTIC * acoustic_score
    )
    return round(min(max(score, 0.0), 1.0), 3)


def anonymise_location(lat: Optional[float], lng: Optional[float]) -> tuple[Optional[float], Optional[float]]:
    """
    Round GPS coords to ~500m grid for PHI compliance.
    Uses 2 decimal places (≈1.1km) then offset to 500m grid.
    """
    if lat is None or lng is None:
        return None, None
    # Round to nearest 0.005° ≈ 500m
    lat_anon = round(round(lat / 0.005) * 0.005, 4)
    lng_anon = round(round(lng / 0.005) * 0.005, 4)
    return lat_anon, lng_anon


def build_user_hash(channel: str, identifier: str = "") -> str:
    """One-way hash for user identity (no PII stored)."""
    raw = f"{channel}:{identifier}"
    return hashlib.md5(raw.encode()).hexdigest()
