import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// DELETE /api/reports/[id]
// Used by the dashboard to remove fake / mistaken reports from the map.
export async function DELETE(_req, { params }) {
  try {
    const id = Number(params?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("reports").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("DELETE /api/reports/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
  }
}
