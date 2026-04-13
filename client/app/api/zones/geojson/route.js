import { NextResponse } from "next/server";

const PY_API = process.env.NEXT_PUBLIC_PY_API_URL || "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${PY_API}/zones/geojson`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/zones/geojson error:", err);
    return NextResponse.json({ type: "FeatureCollection", features: [] });
  }
}
