"""
Live pan-India seeder.

Streams synthetic patient reports into Supabase from ~60 cities across every
region of India. The live map (subscribed to the `reports` table) updates in
real time as rows land.

Usage
-----
One-shot burst (default 80 reports, spread over last 48h):
    .venv/bin/python server/seed_india_live.py

Continuous live stream (new report every 3s, forever):
    .venv/bin/python server/seed_india_live.py --live

Flags:
    --live              Keep pushing new reports indefinitely.
    --interval 3.0      Seconds between inserts in --live mode.
    --count 80          Number of reports for one-shot mode.
    --outbreak          Force a cluster of 6 matching reports in one city
                        (triggers the 2km / 6h outbreak rule).
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

for _p in [Path(".env.local"), Path("../.env.local"), Path("../../.env.local")]:
    if _p.exists():
        load_dotenv(_p)
        break
else:
    load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))
from database import insert_report  # noqa: E402


# (city, state, lat, lng) — 60 cities across all regions of India
INDIA_CITIES: list[tuple[str, str, float, float]] = [
    # North
    ("New Delhi", "Delhi", 28.6139, 77.2090),
    ("Gurgaon", "Haryana", 28.4595, 77.0266),
    ("Noida", "Uttar Pradesh", 28.5355, 77.3910),
    ("Chandigarh", "Chandigarh", 30.7333, 76.7794),
    ("Ludhiana", "Punjab", 30.9010, 75.8573),
    ("Amritsar", "Punjab", 31.6340, 74.8723),
    ("Jaipur", "Rajasthan", 26.9124, 75.7873),
    ("Jodhpur", "Rajasthan", 26.2389, 73.0243),
    ("Lucknow", "Uttar Pradesh", 26.8467, 80.9462),
    ("Kanpur", "Uttar Pradesh", 26.4499, 80.3319),
    ("Varanasi", "Uttar Pradesh", 25.3176, 82.9739),
    ("Agra", "Uttar Pradesh", 27.1767, 78.0081),
    ("Dehradun", "Uttarakhand", 30.3165, 78.0322),
    ("Shimla", "Himachal Pradesh", 31.1048, 77.1734),
    ("Srinagar", "Jammu and Kashmir", 34.0837, 74.7973),
    # West
    ("Mumbai", "Maharashtra", 19.0760, 72.8777),
    ("Pune", "Maharashtra", 18.5204, 73.8567),
    ("Nagpur", "Maharashtra", 21.1458, 79.0882),
    ("Nashik", "Maharashtra", 19.9975, 73.7898),
    ("Aurangabad", "Maharashtra", 19.8762, 75.3433),
    ("Ahmedabad", "Gujarat", 23.0225, 72.5714),
    ("Surat", "Gujarat", 21.1702, 72.8311),
    ("Vadodara", "Gujarat", 22.3072, 73.1812),
    ("Rajkot", "Gujarat", 22.3039, 70.8022),
    ("Panaji", "Goa", 15.4909, 73.8278),
    # Central
    ("Bhopal", "Madhya Pradesh", 23.2599, 77.4126),
    ("Indore", "Madhya Pradesh", 22.7196, 75.8577),
    ("Jabalpur", "Madhya Pradesh", 23.1815, 79.9864),
    ("Raipur", "Chhattisgarh", 21.2514, 81.6296),
    # East
    ("Kolkata", "West Bengal", 22.5726, 88.3639),
    ("Howrah", "West Bengal", 22.5958, 88.2636),
    ("Siliguri", "West Bengal", 26.7271, 88.3953),
    ("Patna", "Bihar", 25.5941, 85.1376),
    ("Gaya", "Bihar", 24.7914, 85.0002),
    ("Ranchi", "Jharkhand", 23.3441, 85.3096),
    ("Jamshedpur", "Jharkhand", 22.8046, 86.2029),
    ("Bhubaneswar", "Odisha", 20.2961, 85.8245),
    ("Cuttack", "Odisha", 20.4625, 85.8828),
    # Northeast
    ("Guwahati", "Assam", 26.1445, 91.7362),
    ("Dibrugarh", "Assam", 27.4728, 94.9120),
    ("Shillong", "Meghalaya", 25.5788, 91.8933),
    ("Imphal", "Manipur", 24.8170, 93.9368),
    ("Agartala", "Tripura", 23.8315, 91.2868),
    ("Aizawl", "Mizoram", 23.7271, 92.7176),
    ("Itanagar", "Arunachal Pradesh", 27.0844, 93.6053),
    ("Kohima", "Nagaland", 25.6751, 94.1086),
    ("Gangtok", "Sikkim", 27.3389, 88.6065),
    # South
    ("Bengaluru", "Karnataka", 12.9716, 77.5946),
    ("Mysuru", "Karnataka", 12.2958, 76.6394),
    ("Mangaluru", "Karnataka", 12.9141, 74.8560),
    ("Hubli", "Karnataka", 15.3647, 75.1240),
    ("Hyderabad", "Telangana", 17.3850, 78.4867),
    ("Warangal", "Telangana", 17.9689, 79.5941),
    ("Vijayawada", "Andhra Pradesh", 16.5062, 80.6480),
    ("Visakhapatnam", "Andhra Pradesh", 17.6868, 83.2185),
    ("Tirupati", "Andhra Pradesh", 13.6288, 79.4192),
    ("Chennai", "Tamil Nadu", 13.0827, 80.2707),
    ("Coimbatore", "Tamil Nadu", 11.0168, 76.9558),
    ("Madurai", "Tamil Nadu", 9.9252, 78.1198),
    ("Tiruchirappalli", "Tamil Nadu", 10.7905, 78.7047),
    ("Thiruvananthapuram", "Kerala", 8.5241, 76.9366),
    ("Kochi", "Kerala", 9.9312, 76.2673),
    ("Kozhikode", "Kerala", 11.2588, 75.7804),
    # Islands
    ("Port Blair", "Andaman and Nicobar", 11.6234, 92.7265),
]


# (summary, urgency, advice)
SYMPTOMS: list[tuple[str, str, str]] = [
    ("high fever and chills", "high",
     "Go to the nearest hospital immediately. High fever may indicate serious infection."),
    ("persistent cough with difficulty breathing", "high",
     "Seek emergency care. Breathing difficulty requires immediate evaluation."),
    ("severe stomach pain and vomiting", "high",
     "Visit emergency room. Could be appendicitis or severe gastritis."),
    ("chest pain and shortness of breath", "high",
     "Call emergency services. Possible cardiac or pulmonary event."),
    ("dengue-like fever with joint pain", "high",
     "Get a dengue NS1 test today. Stay hydrated and monitor platelets."),
    ("fever and body pain", "medium",
     "Rest, stay hydrated. See a doctor within 2-3 days if fever persists."),
    ("dry cough and sore throat", "medium",
     "Rest and drink warm fluids. See a doctor if it worsens after 3 days."),
    ("headache and mild fever", "medium",
     "Take paracetamol, rest in a cool room. Seek care if fever exceeds 103F."),
    ("stomach cramps and diarrhoea", "medium",
     "Drink ORS to stay hydrated. See a doctor if symptoms persist beyond 2 days."),
    ("rash on skin", "medium",
     "Avoid scratching. See a dermatologist or doctor within a few days."),
    ("eye redness and itching", "medium",
     "Likely conjunctivitis. Avoid touching eyes and consult a doctor."),
    ("mild cold and congestion", "low",
     "Rest, drink warm fluids, use saline nasal spray. Should resolve in 3-5 days."),
    ("mild headache", "low",
     "Rest in a quiet room. Take paracetamol if needed. Drink water."),
    ("slight fever 99F", "low",
     "Stay hydrated and rest. Monitor temperature. No immediate medical visit needed."),
    ("occasional cough", "low",
     "Drink warm honey-lemon water. Rest well. Should improve in a few days."),
    ("minor back pain", "low",
     "Gentle stretching and rest. See a doctor if it persists over a week."),
]

CHANNELS = ["web", "telegram", "email"]
LANGUAGES = ["en", "hi", "ta", "te", "bn", "mr", "gu", "kn", "ml", "pa"]


def jitter(lat: float, lng: float, max_km: float = 2.0) -> tuple[float, float]:
    offset = max_km / 111.0
    lat += random.uniform(-offset, offset)
    lng += random.uniform(-offset, offset)
    # 500m privacy grid
    return round(lat * 200) / 200, round(lng * 200) / 200


def push_one(timestamp: datetime | None = None, force: tuple[int, int] | None = None) -> str:
    """Insert a single random report. Returns a short log line."""
    if force is not None:
        city_idx, sym_idx = force
    else:
        city_idx = random.randrange(len(INDIA_CITIES))
        sym_idx = random.randrange(len(SYMPTOMS))

    city, state, clat, clng = INDIA_CITIES[city_idx]
    lat, lng = jitter(clat, clng)
    summary, urgency, advice = SYMPTOMS[sym_idx]
    channel = random.choice(CHANNELS)
    language = random.choice(LANGUAGES)

    insert_report(
        channel=channel,
        symptoms_raw=f"Patient in {city}, {state} reporting: {summary}",
        symptoms_summary=summary,
        urgency=urgency,
        advice=advice,
        lat=lat,
        lng=lng,
        city=city,
        state=state,
        country="India",
        has_cough="cough" in summary,
        cough_type="dry" if "dry cough" in summary else "none",
        language=language,
        user_seed=f"india-live:{time.time_ns()}:{random.randint(0, 1_000_000)}",
    )
    return f"{urgency:6s} | {channel:8s} | {city:20s} {state:20s} | {summary[:44]}"


def burst(count: int, include_outbreak: bool) -> None:
    random.seed()
    now = datetime.now(timezone.utc)
    print(f"Pushing {count} reports across India…")

    for i in range(count):
        hours_ago = random.uniform(0, 48)
        ts = now - timedelta(hours=hours_ago)
        try:
            line = push_one(timestamp=ts)
            print(f"  [{i + 1:3d}] {line}")
        except Exception as e:  # noqa: BLE001
            print(f"  [{i + 1:3d}] FAILED: {e}")

    if include_outbreak:
        # 6 matching reports in one random city within minutes → trips the rule
        city_idx = random.randrange(len(INDIA_CITIES))
        sym_idx = random.randrange(5)  # high/medium only
        print(f"\nForcing outbreak cluster in {INDIA_CITIES[city_idx][0]}…")
        for k in range(6):
            try:
                line = push_one(force=(city_idx, sym_idx))
                print(f"  [outbreak {k + 1}] {line}")
            except Exception as e:  # noqa: BLE001
                print(f"  [outbreak {k + 1}] FAILED: {e}")

    print("\nDone. Open http://localhost:3000 to see the map.")


def live(interval: float) -> None:
    random.seed()
    print(f"Live streaming reports every {interval}s across India. Ctrl+C to stop.")
    n = 0
    while True:
        n += 1
        try:
            line = push_one()
            print(f"  [{n:4d}] {line}")
        except Exception as e:  # noqa: BLE001
            print(f"  [{n:4d}] FAILED: {e}")
        time.sleep(interval)


def main() -> None:
    ap = argparse.ArgumentParser(description="Pan-India live report seeder")
    ap.add_argument("--live", action="store_true", help="Stream forever")
    ap.add_argument("--interval", type=float, default=3.0, help="Seconds between live inserts")
    ap.add_argument("--count", type=int, default=80, help="Reports for one-shot burst")
    ap.add_argument("--outbreak", action="store_true", help="Also force a cluster that trips the outbreak rule")
    args = ap.parse_args()

    if args.live:
        live(args.interval)
    else:
        burst(args.count, args.outbreak)


if __name__ == "__main__":
    main()
