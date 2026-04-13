import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
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
