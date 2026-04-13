import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function detectClusters(reports) {
  const clusters = [];
  const used = new Set();

  // Group by symptom category first
  const bySymptom = {};
  for (const r of reports) {
    if (!r.lat || !r.lng) continue;
    const sym = r.symptoms_summary || "unknown";
    if (!bySymptom[sym]) bySymptom[sym] = [];
    bySymptom[sym].push(r);
  }

  for (const [symptom, symReports] of Object.entries(bySymptom)) {
    for (let i = 0; i < symReports.length; i++) {
      if (used.has(symReports[i].id)) continue;
      const cluster = [symReports[i]];

      for (let j = i + 1; j < symReports.length; j++) {
        if (used.has(symReports[j].id)) continue;
        const dist = haversineKm(
          symReports[i].lat,
          symReports[i].lng,
          symReports[j].lat,
          symReports[j].lng
        );
        if (dist <= 2) {
          cluster.push(symReports[j]);
        }
      }

      if (cluster.length >= 5) {
        cluster.forEach((r) => used.add(r.id));
        // Centroid
        const lat = cluster.reduce((s, r) => s + r.lat, 0) / cluster.length;
        const lng = cluster.reduce((s, r) => s + r.lng, 0) / cluster.length;
        clusters.push({
          symptom_category: symptom,
          count: cluster.length,
          lat,
          lng,
          area: cluster[0].city || null,
          report_ids: cluster.map((r) => r.id),
        });
      }
    }
  }

  return clusters;
}

export async function GET() {
  try {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("reports")
      .select("id, lat, lng, city, symptoms_summary, urgency, timestamp")
      .gte("timestamp", since)
      .not("lat", "is", null);

    if (error) throw error;

    const clusters = detectClusters(data ?? []);

    // Mark outbreak in DB (async, don't await)
    if (clusters.length > 0) {
      const allIds = clusters.flatMap((c) => c.report_ids);
      supabaseAdmin
        .from("reports")
        .update({ outbreak_flag: true })
        .in("id", allIds)
        .then(() => {})
        .catch(() => {});
    }

    return NextResponse.json({ clusters });
  } catch (err) {
    console.error("GET /api/outbreak error:", err);
    return NextResponse.json({ clusters: [] });
  }
}
