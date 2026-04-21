"""Cluster detection + Prophet outbreak forecasting."""

import math
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

# Lazy imports — numpy/sklearn/prophet are heavy; keep boot RAM low on free tiers
_np = None
_BallTree = None
_prophet = None


def _get_np():
    global _np
    if _np is None:
        import numpy as np
        _np = np
    return _np


def _get_balltree():
    global _BallTree
    if _BallTree is None:
        from sklearn.neighbors import BallTree
        _BallTree = BallTree
    return _BallTree


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


def detect_clusters(reports: list[dict], radius_km: float = 2.0, min_count: int = 5, max_hours: int = 6) -> list[dict]:
    """
    Cluster reports by symptom category and geographic proximity.
    Fix 1: Uses BallTree (Connected Components) to ensure density.
    Fix 2: Adds temporal window filtering (max_hours).
    """
    if not reports:
        return []

    clusters = []
    
    # Group by symptom category
    by_symptom: dict[str, list] = {}
    for r in reports:
        if not r.get("lat") or not r.get("lng"):
            continue
        sym = (r.get("symptoms_summary") or "unknown").lower()
        by_symptom.setdefault(sym, []).append(r)

    np = _get_np()
    BallTree = _get_balltree()

    for symptom, sym_reports in by_symptom.items():
        if len(sym_reports) < min_count:
            continue

        # Prepare spatial data for BallTree (must be in radians)
        coords = np.array([[math.radians(r["lat"]), math.radians(r["lng"])] for r in sym_reports])
        # Parse timestamps into seconds for temporal comparison
        timestamps = []
        for r in sym_reports:
            t = datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00"))
            timestamps.append(t.timestamp())
        timestamps = np.array(timestamps)

        # Build BallTree for O(N log N) spatial search
        # Earth radius = 6371km
        tree = BallTree(coords, metric='haversine')
        # find neighbor indices within threshold
        neighbor_indices = tree.query_radius(coords, r=radius_km / 6371.0)

        # Build adjacency graph based on spatial AND temporal proximity
        adj = {}
        for i, neighbors in enumerate(neighbor_indices):
            adj[i] = []
            for j in neighbors:
                if i == j: continue
                # Check temporal window (Fix 2)
                if abs(timestamps[i] - timestamps[j]) <= max_hours * 3600:
                    adj[i].append(j)

        # Find Connected Components (Fix 1: density logic)
        visited = set()
        for i in range(len(sym_reports)):
            if i not in visited:
                # BFS to find component
                component = []
                queue = [i]
                visited.add(i)
                while queue:
                    curr = queue.pop(0)
                    component.append(curr)
                    for neighbor in adj[curr]:
                        if neighbor not in visited:
                            visited.add(neighbor)
                            queue.append(neighbor)
                
                # If component is large enough, it's a cluster
                if len(component) >= min_count:
                    cluster_reports = [sym_reports[idx] for idx in component]
                    lat_c = sum(r["lat"] for r in cluster_reports) / len(cluster_reports)
                    lng_c = sum(r["lng"] for r in cluster_reports) / len(cluster_reports)
                    area = cluster_reports[0].get("city") or "Unknown"
                    
                    print(f"[outbreak] Cluster found: {symptom}, {len(cluster_reports)} reports near {area}")
                    
                    # Calculate Risk Score: high urgency reports weighted more
                    high_count = sum(1 for r in cluster_reports if r.get("urgency") == "high")
                    risk_score = len(component) + (high_count * 2)

                    clusters.append({
                        "symptom_category": symptom,
                        "count": len(cluster_reports),
                        "high_count": high_count,
                        "risk_score": risk_score,
                        "lat": lat_c,
                        "lng": lng_c,
                        "area": area,
                        "report_ids": [r["id"] for r in cluster_reports],
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
