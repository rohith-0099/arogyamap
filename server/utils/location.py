"""
Location resolution pipeline — Priority 1: GPS, Priority 2: Fuzzy text, Priority 3: Unassigned.
Global-ready: all config driven by zones.geojson and city_lookup.json.
Uses Shapely point-in-polygon + RTtree spatial index for fast geo queries.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Config paths (override via env vars for any region) ──────────────────────
_HERE = Path(__file__).parent
ZONES_GEOJSON_PATH = os.getenv("ZONES_GEOJSON_PATH", str(_HERE / "zones.geojson"))
CITY_LOOKUP_PATH = os.getenv("CITY_LOOKUP_PATH", str(_HERE / "city_lookup.json"))

# ── Lazy-loaded spatial index ─────────────────────────────────────────────────
_spatial_index = None   # rtree.Index
_zone_polygons: list[dict] = []  # [{polygon, zone_name, district, assigned_worker_id}]
_city_lookup: dict[str, dict] = {}


def _load_city_lookup() -> dict[str, dict]:
    global _city_lookup
    if _city_lookup:
        return _city_lookup
    try:
        with open(CITY_LOOKUP_PATH, encoding="utf-8") as f:
            raw = json.load(f)
        _city_lookup = {k: v for k, v in raw.items() if not k.startswith("_")}
        logger.info(f"[location] Loaded {len(_city_lookup)} city entries")
    except FileNotFoundError:
        logger.warning(f"[location] city_lookup.json not found at {CITY_LOOKUP_PATH}")
        _city_lookup = {}
    return _city_lookup


def _load_spatial_index():
    """Load GeoJSON and build Shapely + Rtree spatial index. Called once."""
    global _spatial_index, _zone_polygons

    if _spatial_index is not None:
        return

    try:
        from shapely.geometry import shape, Point
        from shapely.strtree import STRtree
    except ImportError:
        logger.warning("[location] shapely not installed — point-in-polygon disabled")
        _spatial_index = False
        return

    try:
        with open(ZONES_GEOJSON_PATH, encoding="utf-8") as f:
            geojson = json.load(f)
    except FileNotFoundError:
        logger.warning(f"[location] zones.geojson not found at {ZONES_GEOJSON_PATH}")
        _spatial_index = False
        return

    features = geojson.get("features", [])
    polys = []
    for feat in features:
        props = feat.get("properties", {})
        try:
            poly = shape(feat["geometry"])
            polys.append(poly)
            _zone_polygons.append({
                "polygon": poly,
                "zone_name": props.get("zone_name", "Unknown Zone"),
                "district": props.get("district", "Unknown District"),
                "assigned_worker_id": props.get("assigned_worker_id"),
            })
        except Exception as e:
            logger.warning(f"[location] Skipping malformed feature: {e}")

    if polys:
        _spatial_index = STRtree(polys)
        logger.info(f"[location] Spatial index built with {len(polys)} zones")
    else:
        _spatial_index = False
        logger.warning("[location] No valid polygons found in zones.geojson")


def _point_in_polygon(lat: float, lng: float) -> tuple[Optional[str], Optional[str]]:
    """
    Return (zone_name, district) for a lat/lng point.
    Uses STRtree for O(log n) lookup. Falls back to None if no match.
    """
    _load_spatial_index()

    if not _spatial_index:
        return None, None

    from shapely.geometry import Point

    pt = Point(lng, lat)  # Shapely uses (x=lng, y=lat)
    candidate_indices = _spatial_index.query(pt)

    for idx in candidate_indices:
        zone = _zone_polygons[idx]
        if zone["polygon"].contains(pt):
            return zone["zone_name"], zone["district"]

    return None, None


def _fuzzy_city_match(text: str, min_score: float = 70.0) -> Optional[dict]:
    """
    Extract city from free text using RapidFuzz partial ratio matching.
    Returns city_lookup entry if confidence >= min_score, else None.
    """
    try:
        from rapidfuzz import process, fuzz
    except ImportError:
        logger.warning("[location] rapidfuzz not installed — fuzzy match disabled")
        return None

    lookup = _load_city_lookup()
    if not lookup:
        return None

    text_lower = text.lower()
    choices = list(lookup.keys())

    # Try exact word match first (fast path)
    for city in choices:
        if city in text_lower:
            return lookup[city]

    # Fuzzy partial match
    result = process.extractOne(
        text_lower,
        choices,
        scorer=fuzz.partial_ratio,
        score_cutoff=min_score,
    )

    if result:
        city_key, score, _ = result
        logger.debug(f"[location] Fuzzy match: '{city_key}' score={score:.1f}")
        return lookup[city_key]

    return None


def _llm_extract_location(text: str) -> Optional[str]:
    """
    LLM fallback: extract city/village name from text.
    Only called when fuzzy match confidence is low.
    """
    try:
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract ONLY the city, town, or village name from the text. "
                        "Reply with just the place name, nothing else. "
                        "If no location is mentioned, reply with 'none'."
                    ),
                },
                {"role": "user", "content": text[:500]},
            ],
            temperature=0.0,
            max_tokens=20,
        )
        city = response.choices[0].message.content.strip().lower()
        if city and city != "none" and len(city) < 50:
            return city
    except Exception as e:
        logger.debug(f"[location] LLM extraction error: {e}")

    return None


def resolve_location(
    raw_lat: Optional[float] = None,
    raw_lng: Optional[float] = None,
    text: Optional[str] = None,
) -> dict:
    """
    Unified location resolution pipeline.

    Priority 1 — GPS available:
        Round to ~100m precision, point-in-polygon for zone/district.

    Priority 2 — Text location:
        Fuzzy match against city_lookup → LLM fallback if confidence low.

    Priority 3 — Unassigned:
        All nulls, marked for manual supervisor resolution.

    Returns:
        {
            lat: float | None,
            lng: float | None,
            zone_name: str | None,
            district: str | None,
            resolution_method: "gps" | "text_fuzzy" | "text_llm" | "unassigned",
        }
    """
    # ── Priority 1: GPS ──────────────────────────────────────────────────────
    if raw_lat is not None and raw_lng is not None:
        lat = round(float(raw_lat), 3)
        lng = round(float(raw_lng), 3)
        zone_name, district = _point_in_polygon(lat, lng)
        return {
            "lat": lat,
            "lng": lng,
            "zone_name": zone_name,
            "district": district,
            "resolution_method": "gps",
        }

    # ── Priority 2: Text ─────────────────────────────────────────────────────
    if text:
        # Try fuzzy match first (fast, no API call)
        city_entry = _fuzzy_city_match(text)
        if city_entry:
            return {
                "lat": city_entry.get("lat"),
                "lng": city_entry.get("lng"),
                "zone_name": city_entry.get("zone"),
                "district": city_entry.get("district"),
                "resolution_method": "text_fuzzy",
            }

        # LLM fallback only if fuzzy failed
        llm_city = _llm_extract_location(text)
        if llm_city:
            # Try to match LLM result against lookup
            city_entry = _fuzzy_city_match(llm_city, min_score=60.0)
            if city_entry:
                return {
                    "lat": city_entry.get("lat"),
                    "lng": city_entry.get("lng"),
                    "zone_name": city_entry.get("zone"),
                    "district": city_entry.get("district"),
                    "resolution_method": "text_llm",
                }

    # ── Priority 3: Unassigned ───────────────────────────────────────────────
    return {
        "lat": None,
        "lng": None,
        "zone_name": None,
        "district": None,
        "resolution_method": "unassigned",
    }


def preload() -> None:
    """Eagerly load GeoJSON and city lookup at startup to avoid cold-start latency."""
    _load_city_lookup()
    _load_spatial_index()
    logger.info("[location] Preload complete")
