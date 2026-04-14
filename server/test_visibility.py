import os
import sys
from pathlib import Path

# Add server dir to sys.path
sys.path.insert(0, str(Path(__file__).parent))

from utils.location import resolve_location, preload
from database import insert_report

def test_telegram_resolution():
    print("--- Testing Telegram Location Resolution ---")
    preload()
    
    # Mock Kollam coordinates
    lat, lng = 8.893, 76.589
    
    print(f"Resolving lat={lat}, lng={lng}...")
    location = resolve_location(raw_lat=lat, raw_lng=lng)
    print(f"Resolved loc: {location}")
    
    if location.get('district') == 'Kollam':
        print("✅ SUCCESS: Resolved to Kollam district")
    else:
        print(f"❌ FAILURE: Resolved to {location.get('district')}")

    # Mock DB insert (optional, let's just test resolution for now to avoid polluting DB too much)
    # But user wants to see it on web, so let's do one test record
    print("\nInserting test record to DB...")
    row = insert_report(
        channel="telegram",
        symptoms_summary="Testing visibility fix",
        urgency="medium",
        advice="Rest well",
        lat=location.get("lat"),
        lng=location.get("lng"),
        city=location.get("city") or "",
        zone_name=location.get("zone_name"),
        district=location.get("district"),
        state=location.get("state"),
        country=location.get("country"),
        resolution_method=location.get("resolution_method"),
        user_seed="test_visibility_1"
    )
    print(f"Inserted row ID: {row.get('id')}")
    print(f"Row District: {row.get('district')}")

if __name__ == "__main__":
    test_telegram_resolution()
