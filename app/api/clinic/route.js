import { NextResponse } from "next/server";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") || "10.8505");
  const lng = parseFloat(searchParams.get("lng") || "76.2711");
  const radius = 10000; // 10km

  const query = `
    [out:json][timeout:10];
    (
      node["amenity"~"hospital|clinic|pharmacy"](around:${radius},${lat},${lng});
      way["amenity"~"hospital|clinic|pharmacy"](around:${radius},${lat},${lng});
    );
    out center 20;
  `;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error("Overpass API error");

    const data = await res.json();
    const elements = data.elements || [];

    const clinics = elements
      .map((el) => {
        const elLat = el.lat ?? el.center?.lat;
        const elLng = el.lon ?? el.center?.lon;
        if (!elLat || !elLng) return null;
        return {
          name: el.tags?.name || el.tags?.amenity || "Healthcare facility",
          type: el.tags?.amenity || "clinic",
          lat: elLat,
          lng: elLng,
          distance_km: haversineKm(lat, lng, elLat, elLng),
          address: [el.tags?.["addr:street"], el.tags?.["addr:city"]]
            .filter(Boolean)
            .join(", ") || null,
          phone: el.tags?.phone || el.tags?.["contact:phone"] || null,
          opening_hours: el.tags?.opening_hours || null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 5);

    return NextResponse.json({ clinics });
  } catch (err) {
    console.error("Clinic finder error:", err);
    return NextResponse.json({ clinics: [], error: "Could not fetch clinics" });
  }
}
