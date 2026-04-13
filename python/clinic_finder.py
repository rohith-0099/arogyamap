"""OpenStreetMap Overpass API — nearest clinic/pharmacy finder."""

from typing import Optional
import math
import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two lat/lng points in km."""
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


def find_nearest_clinics(
    lat: float,
    lng: float,
    radius_m: int = 10000,
    limit: int = 3,
) -> list[dict]:
    """
    Query Overpass API for hospitals, clinics, and pharmacies near lat/lng.
    Returns list of dicts with name, type, distance_km, address, phone.
    """
    query = f"""
    [out:json][timeout:10];
    (
      node["amenity"~"hospital|clinic|pharmacy"](around:{radius_m},{lat},{lng});
      way["amenity"~"hospital|clinic|pharmacy"](around:{radius_m},{lat},{lng});
    );
    out center {limit * 3};
    """

    try:
        resp = httpx.post(
            OVERPASS_URL,
            data={"data": query},
            timeout=12.0,
        )
        resp.raise_for_status()
        elements = resp.json().get("elements", [])
    except Exception as e:
        print(f"[clinic_finder] Overpass error: {e}")
        return []

    results = []
    for el in elements:
        el_lat = el.get("lat") or (el.get("center") or {}).get("lat")
        el_lng = el.get("lon") or (el.get("center") or {}).get("lon")
        if not el_lat or not el_lng:
            continue

        tags = el.get("tags", {})
        name = tags.get("name") or tags.get("amenity", "Healthcare facility")
        results.append(
            {
                "name": name,
                "type": tags.get("amenity", "clinic"),
                "lat": el_lat,
                "lng": el_lng,
                "distance_km": round(haversine_km(lat, lng, el_lat, el_lng), 2),
                "address": ", ".join(
                    filter(
                        None,
                        [tags.get("addr:street"), tags.get("addr:city")],
                    )
                )
                or None,
                "phone": tags.get("phone") or tags.get("contact:phone"),
                "opening_hours": tags.get("opening_hours"),
                "maps_url": f"https://maps.google.com/?q={el_lat},{el_lng}",
            }
        )

    results.sort(key=lambda x: x["distance_km"])
    return results[:limit]


def format_clinics_text(clinics: list[dict]) -> str:
    """Format clinic list as readable text for Telegram/email."""
    if not clinics:
        return "No clinics found nearby. Call 104 for the National Health Helpline."

    lines = ["🏥 Nearest Healthcare Facilities:\n"]
    for i, c in enumerate(clinics, 1):
        lines.append(f"{i}. {c['name']} ({c['type']})")
        lines.append(f"   📍 {c['distance_km']} km away")
        if c["address"]:
            lines.append(f"   🏠 {c['address']}")
        if c["phone"]:
            lines.append(f"   📞 {c['phone']}")
        if c["opening_hours"]:
            lines.append(f"   🕐 {c['opening_hours']}")
        lines.append(f"   🗺️ {c['maps_url']}")
        lines.append("")

    return "\n".join(lines)
