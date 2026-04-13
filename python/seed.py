"""
Seed 25 demo reports across Kerala cities for demonstration.
Run ONCE before demo: python python/seed.py
"""

import os
import sys
import random
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from pathlib import Path

# Load from project root .env.local
for path in [Path(".env.local"), Path("../.env.local")]:
    if path.exists():
        load_dotenv(path)
        break
else:
    load_dotenv()

# Add python/ dir to path
sys.path.insert(0, os.path.dirname(__file__))

from database import insert_report

KERALA_LOCATIONS = [
    # (city, lat, lng)
    ("Thiruvananthapuram", 8.5241, 76.9366),
    ("Kochi", 9.9312, 76.2673),
    ("Kozhikode", 11.2588, 75.7804),
    ("Thrissur", 10.5276, 76.2144),
    ("Kannur", 11.8745, 75.3704),
    ("Kollam", 8.8932, 76.6141),
    ("Palakkad", 10.7867, 76.6548),
    ("Malappuram", 11.0730, 76.0740),
    ("Kottayam", 9.5916, 76.5222),
    ("Alappuzha", 9.4981, 76.3388),
]

SYMPTOMS = [
    # (summary, urgency, category, advice_en)
    (
        "high fever and chills",
        "high",
        "fever",
        "Go to the nearest hospital immediately. High fever may indicate serious infection.",
    ),
    (
        "persistent cough with difficulty breathing",
        "high",
        "respiratory",
        "Seek emergency care. Breathing difficulty requires immediate evaluation.",
    ),
    (
        "severe stomach pain and vomiting",
        "high",
        "stomach",
        "Visit emergency room. Could be appendicitis or severe gastritis.",
    ),
    (
        "fever and body pain",
        "medium",
        "fever",
        "Rest, stay hydrated. See a doctor within 2-3 days if fever persists.",
    ),
    (
        "dry cough and sore throat",
        "medium",
        "cough",
        "Rest and drink warm fluids. See a doctor if worsens after 3 days.",
    ),
    (
        "headache and mild fever",
        "medium",
        "headache",
        "Take paracetamol, rest in a cool room. Seek care if fever exceeds 103°F.",
    ),
    (
        "stomach cramps and diarrhoea",
        "medium",
        "stomach",
        "Drink ORS to stay hydrated. See a doctor if symptoms persist beyond 2 days.",
    ),
    (
        "rash on skin",
        "medium",
        "skin",
        "Avoid scratching. See a dermatologist or doctor within a few days.",
    ),
    (
        "mild cold and congestion",
        "low",
        "respiratory",
        "Rest, drink warm fluids, use saline nasal spray. Should resolve in 3-5 days.",
    ),
    (
        "mild headache",
        "low",
        "headache",
        "Rest in a quiet room. Take paracetamol if needed. Drink water.",
    ),
    (
        "slight fever 99F",
        "low",
        "fever",
        "Stay hydrated and rest. Monitor temperature. No immediate medical visit needed.",
    ),
    (
        "occasional cough",
        "low",
        "cough",
        "Drink warm honey-lemon water. Rest well. Should improve in a few days.",
    ),
]

CHANNELS = ["web", "telegram", "email", "web", "web", "telegram"]


def jitter(lat: float, lng: float, max_km: float = 1.0) -> tuple[float, float]:
    """Add small random offset to spread reports within a city."""
    # ~1 degree latitude = 111km
    offset = max_km / 111.0
    lat += random.uniform(-offset, offset)
    lng += random.uniform(-offset, offset)
    # Round to 500m privacy grid
    lat = round(lat * 200) / 200
    lng = round(lng * 200) / 200
    return lat, lng


def seed():
    random.seed(42)
    now = datetime.now(timezone.utc)

    plan = [
        # (city_idx, symptom_idx, hours_ago)
        # High urgency cluster in Kochi (indices 1 = Kochi, 0,1,2 = high symptoms)
        (1, 0, 2), (1, 0, 3), (1, 0, 4), (1, 0, 5), (1, 0, 6),  # 5 fever cases → outbreak
        (1, 1, 3), (1, 1, 5),  # breathing difficulty
        (0, 2, 4),  # severe stomach pain TVM
        # Medium urgency spread
        (0, 3, 8), (2, 4, 10), (3, 5, 12), (4, 6, 14), (5, 7, 6),
        (6, 3, 18), (7, 4, 20), (8, 5, 24), (9, 6, 30),
        (0, 7, 36), (2, 3, 38),
        # Low urgency
        (0, 8, 12), (1, 9, 24), (3, 10, 36), (5, 11, 48),
        (7, 8, 20), (9, 9, 44),
    ]

    print(f"Seeding {len(plan)} demo reports across Kerala…")

    for i, (city_idx, sym_idx, hours_ago) in enumerate(plan):
        city_name, city_lat, city_lng = KERALA_LOCATIONS[city_idx]
        lat, lng = jitter(city_lat, city_lng)
        summary, urgency, category, advice = SYMPTOMS[sym_idx]
        channel = CHANNELS[i % len(CHANNELS)]
        ts = now - timedelta(hours=hours_ago, minutes=random.randint(0, 59))

        try:
            row = insert_report(
                channel=channel,
                symptoms_raw=f"Patient in {city_name} reporting: {summary}",
                symptoms_summary=summary,
                urgency=urgency,
                advice=advice,
                lat=lat,
                lng=lng,
                city=city_name,
                has_cough="cough" in summary,
                cough_type="dry" if "dry cough" in summary else ("wet" if "wet" in summary else "none"),
                language="en",
                user_seed=f"seed:{i}",
            )
            print(f"  [{i+1:2d}] {urgency:6s} | {city_name:20s} | {summary[:40]}")
        except Exception as e:
            print(f"  [{i+1:2d}] FAILED: {e}")

    print("\n✓ Seeding complete!")
    print("Open http://localhost:3000 to see the live map.")


if __name__ == "__main__":
    seed()
