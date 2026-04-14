import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Non-core reports are auto-removed from the map after a retention window.
// Outbreak-flagged and high-urgency reports are always kept.
const RETENTION_DAYS = { low: 2, medium: 7 };

async function pruneNonCoreReports() {
  const now = Date.now();
  for (const [urgency, days] of Object.entries(RETENTION_DAYS)) {
    const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("reports")
      .delete()
      .eq("urgency", urgency)
      .eq("outbreak_flag", false)
      .lt("timestamp", cutoff);
    if (error) console.error(`prune ${urgency} failed:`, error.message);
  }
}

export async function GET() {
  try {
    // Lazy auto-cleanup on every dashboard poll (cheap, indexed filter).
    pruneNonCoreReports().catch(() => {});

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("reports")
      .select(
        "id, lat, lng, city, symptoms_summary, urgency, channel, language, has_cough, cough_type, voice_stress, photo_analysis, follow_up_status, outbreak_flag, timestamp"
      )
      .gte("timestamp", since)
      .order("timestamp", { ascending: false })
      .limit(500);

    if (error) throw error;

    return NextResponse.json({ reports: data ?? [] });
  } catch (err) {
    console.error("GET /api/reports error:", err);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}
