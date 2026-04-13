"""Cluster detection + Prophet outbreak forecasting."""

import math
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

import os

# Lazy imports
_prophet = None


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def detect_clusters(reports: list[dict], radius_km: float = 2.0, min_count: int = 5) -> list[dict]:
    """
    Cluster reports by symptom category and geographic proximity.
    Returns list of clusters with 5+ reports within 2km.
    """
    clusters = []
    used = set()

    # Group by symptom category
    by_symptom: dict[str, list] = {}
    for r in reports:
        if not r.get("lat") or not r.get("lng"):
            continue
        sym = (r.get("symptoms_summary") or "unknown").lower()
        by_symptom.setdefault(sym, []).append(r)

    for symptom, sym_reports in by_symptom.items():
        for i, anchor in enumerate(sym_reports):
            if anchor["id"] in used:
                continue
            cluster = [anchor]
            for j, candidate in enumerate(sym_reports):
                if i == j or candidate["id"] in used:
                    continue
                dist = haversine_km(
                    anchor["lat"], anchor["lng"],
                    candidate["lat"], candidate["lng"],
                )
                if dist <= radius_km:
                    cluster.append(candidate)

            if len(cluster) >= min_count:
                for r in cluster:
                    used.add(r["id"])
                lat_c = sum(r["lat"] for r in cluster) / len(cluster)
                lng_c = sum(r["lng"] for r in cluster) / len(cluster)
                clusters.append({
                    "symptom_category": symptom,
                    "count": len(cluster),
                    "lat": lat_c,
                    "lng": lng_c,
                    "area": cluster[0].get("city"),
                    "report_ids": [r["id"] for r in cluster],
                })

    return clusters


def run_outbreak_detection() -> list[dict]:
    """Pull recent 6h reports, detect clusters, flag in DB."""
    from database import get_recent_reports, mark_outbreak_flag

    reports = get_recent_reports(hours=6, limit=1000)
    reports = [r for r in reports if r.get("lat") and r.get("lng")]

    clusters = detect_clusters(reports)

    if clusters:
        all_ids = [rid for c in clusters for rid in c["report_ids"]]
        try:
            mark_outbreak_flag(all_ids)
        except Exception as e:
            print(f"[outbreak] Failed to mark flags: {e}")

    return clusters


def prophet_forecast(district: Optional[str] = None, days_ahead: int = 2) -> dict:
    """
    Fit Prophet model on last 30 days of report counts and forecast next 48h.
    Returns pre_alert=True if projected count > 2x current average.
    """
    global _prophet
    try:
        if _prophet is None:
            from prophet import Prophet
            _prophet = Prophet
    except ImportError:
        return {"pre_alert": False, "forecast": []}

    from database import get_recent_reports
    all_reports = get_recent_reports(hours=30 * 24, limit=10000)

    # Filter by district if specified
    if district:
        all_reports = [
            r for r in all_reports
            if r.get("city") and district.lower() in r["city"].lower()
        ]

    # Aggregate by day
    from collections import defaultdict
    day_counts: dict[str, int] = defaultdict(int)
    for r in all_reports:
        ts = r.get("timestamp", "")
        if ts:
            day = str(ts)[:10]  # YYYY-MM-DD
            day_counts[day] += 1

    rows = [{"ds": day, "y": count} for day, count in sorted(day_counts.items())]

    if len(rows) < 7:
        return {"pre_alert": False, "forecast": []}

    import pandas as pd

    df = pd.DataFrame(rows)
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"] = df["y"].astype(float)

    model = _prophet(
        yearly_seasonality=False,
        weekly_seasonality=True,
        daily_seasonality=False,
        changepoint_prior_scale=0.1,
    )
    model.fit(df)

    future = model.make_future_dataframe(periods=days_ahead, freq="D")
    forecast = model.predict(future)

    last_actual_avg = float(df["y"].tail(7).mean())
    next_48h_avg = float(forecast["yhat"].tail(days_ahead).mean())

    pre_alert = next_48h_avg > 2 * last_actual_avg and last_actual_avg > 0

    return {
        "pre_alert": pre_alert,
        "current_avg_daily": round(last_actual_avg, 1),
        "forecast_avg_daily": round(next_48h_avg, 1),
        "forecast": [
            {
                "date": str(row["ds"].date()),
                "predicted": round(row["yhat"], 1),
                "lower": round(row["yhat_lower"], 1),
                "upper": round(row["yhat_upper"], 1),
            }
            for _, row in forecast.tail(days_ahead).iterrows()
        ],
    }
