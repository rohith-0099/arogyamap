import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PYTHON_API_URL =
  process.env.PYTHON_API_URL ||
  process.env.NEXT_PUBLIC_PYTHON_API_URL ||
  process.env.NEXT_PUBLIC_PY_API_URL ||
  "http://localhost:8000";

export async function POST(request) {
  try {
    // Forward the entire multipart form to the Python backend
    const formData = await request.formData();

    const response = await fetch(`${PYTHON_API_URL}/process`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Python API error:", errText);
      return NextResponse.json(
        { error: "Processing failed" },
        { status: 502 }
      );
    }

    const result = await response.json();

    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/report error:", err);
    // Fallback: if Python backend is down, do basic text triage via Groq directly
    try {
      return await fallbackTriage(request);
    } catch {
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 }
      );
    }
  }
}

// Minimal fallback if Python backend is unreachable
async function fallbackTriage(request) {
  const formData = await request.formData();
  const text = formData.get("text") || "";
  const lat = parseFloat(formData.get("lat") || "0") || null;
  const lng = parseFloat(formData.get("lng") || "0") || null;
  const channel = formData.get("channel") || "web";

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            'You are a medical triage assistant for rural India. Respond ONLY in JSON: {"symptoms_summary":"string","urgency":"low|medium|high","advice":"string","see_doctor":true|false,"detected_language":"en","symptom_category":"string"}. urgency: low=rest at home, medium=see doctor this week, high=go to emergency now.',
        },
        { role: "user", content: `Patient symptoms: ${text}` },
      ],
      temperature: 0.2,
    }),
  });

  const groqData = await groqRes.json();
  const rawContent = groqData.choices?.[0]?.message?.content || "{}";
  let triage = {};
  try {
    triage = JSON.parse(rawContent.match(/\{[\s\S]*\}/)?.[0] || "{}");
  } catch {}

  const symptoms_summary = triage.symptoms_summary || "unspecified symptoms";
  const urgency = ["low", "medium", "high"].includes(triage.urgency)
    ? triage.urgency
    : "low";

  // Save to Supabase
  const crypto = await import("crypto");
  const userHash = crypto
    .createHash("md5")
    .update(channel + Date.now())
    .digest("hex");

  await supabaseAdmin.from("reports").insert({
    user_hash: userHash,
    lat,
    lng,
    symptoms_raw: text,
    symptoms_summary,
    urgency,
    advice: triage.advice,
    channel,
    language: triage.detected_language || "en",
  });

  return NextResponse.json({
    symptoms_summary,
    urgency,
    advice: triage.advice || "Please consult a doctor if symptoms persist.",
    channel,
  });
}
