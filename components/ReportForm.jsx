"use client";

import { useState, useRef, useEffect } from "react";

const URGENCY_COLORS = {
  high: "#ff2200",
  medium: "#ff8800",
  low: "#00cc66",
};

const URGENCY_LABELS = {
  high: "🚨 Go to Emergency Now",
  medium: "⚠️ See Doctor This Week",
  low: "✅ Rest at Home",
};

export default function ReportForm() {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioURL, setAudioURL] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [micPermission, setMicPermission] = useState("unknown"); // unknown | granted | denied
  const [location, setLocation] = useState(null);
  const [locStatus, setLocStatus] = useState("idle"); // idle | loading | granted | denied

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fileInputRef = useRef(null);

  // Get GPS on mount
  useEffect(() => {
    setLocStatus("loading");
    if (!navigator.geolocation) {
      setLocStatus("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Round to 500m grid for privacy
        const lat = Math.round(pos.coords.latitude * 200) / 200;
        const lng = Math.round(pos.coords.longitude * 200) / 200;
        setLocation({ lat, lng });
        setLocStatus("granted");
      },
      () => setLocStatus("denied"),
      { timeout: 8000 }
    );
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission("granted");
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioURL(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setRecording(true);
    } catch {
      setMicPermission("denied");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!audioBlob && !textInput.trim()) {
      setError("Please record your symptoms or type them below.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      if (audioBlob) formData.append("audio", audioBlob, "recording.webm");
      if (photo) formData.append("photo", photo);
      if (textInput) formData.append("text", textInput);
      if (location) {
        formData.append("lat", location.lat);
        formData.append("lng", location.lng);
      }
      formData.append("channel", "web");

      const res = await fetch("/api/report", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError("Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setAudioBlob(null);
    setAudioURL(null);
    setPhoto(null);
    setPhotoPreview(null);
    setTextInput("");
    setResult(null);
    setError("");
  }

  if (result) {
    const color = URGENCY_COLORS[result.urgency] || "#00cc66";
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div
          className="rounded-2xl border p-6 bg-dark-800"
          style={{ borderColor: color + "50" }}
        >
          {/* Urgency badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white font-bold text-lg mb-4"
            style={{ backgroundColor: color + "25", border: `1px solid ${color}` }}
          >
            {URGENCY_LABELS[result.urgency] || result.urgency}
          </div>

          {/* Summary */}
          <div className="mb-4">
            <div className="text-gray-400 text-xs mb-1">SYMPTOMS DETECTED</div>
            <div className="text-white capitalize font-medium">
              {result.symptoms_summary}
            </div>
          </div>

          {/* Advice */}
          {result.advice && (
            <div className="mb-4 p-4 rounded-xl bg-dark-700 border border-dark-600">
              <div className="text-gray-400 text-xs mb-1">ADVICE</div>
              <div className="text-gray-200 text-sm leading-relaxed">{result.advice}</div>
            </div>
          )}

          {/* Photo finding */}
          {result.photo_analysis && (
            <div className="mb-4 p-3 rounded-xl bg-dark-700 border border-dark-600">
              <div className="text-gray-400 text-xs mb-1">VISUAL ANALYSIS</div>
              <div className="text-gray-200 text-sm">{result.photo_analysis}</div>
            </div>
          )}

          {/* Audio reply */}
          {result.audio_reply_url && (
            <div className="mb-4">
              <div className="text-gray-400 text-xs mb-2">VOICE REPLY</div>
              <audio controls src={result.audio_reply_url} className="w-full" />
            </div>
          )}

          {/* Nearest clinics */}
          {result.clinics && result.clinics.length > 0 && (
            <div className="mb-4">
              <div className="text-gray-400 text-xs mb-2">NEAREST CLINICS</div>
              {result.clinics.map((clinic, i) => (
                <div key={i} className="text-sm text-gray-300 mb-1">
                  📍 {clinic.name} — {clinic.distance_km?.toFixed(1)} km
                </div>
              ))}
            </div>
          )}

          {/* Success message */}
          <div className="text-green-400 text-sm text-center py-2 border-t border-dark-600 mt-4">
            ✓ Your report is now live on the map
          </div>

          <button
            onClick={reset}
            className="w-full mt-4 py-2 rounded-xl bg-dark-600 hover:bg-dark-500 text-gray-300 text-sm transition-all"
          >
            Submit Another Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Report Symptoms</h1>
        <p className="text-gray-400 text-sm">
          Your report helps protect your community. All data is anonymous.
        </p>
        {/* Location status */}
        <div className="mt-2 text-xs text-gray-500">
          {locStatus === "granted" && "📍 Location captured (privacy-rounded)"}
          {locStatus === "loading" && "📍 Detecting location…"}
          {locStatus === "denied" && "📍 Location not available — city will be used"}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Mic button */}
        <div className="flex flex-col items-center gap-4">
          {!audioBlob ? (
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              className={`w-28 h-28 rounded-full text-4xl font-bold transition-all shadow-2xl ${
                recording
                  ? "bg-urgency-high mic-recording shadow-red-900/60"
                  : "bg-dark-700 hover:bg-urgency-high/80 border-2 border-dark-500 hover:border-urgency-high"
              }`}
            >
              {recording ? "⏹" : "🎙️"}
            </button>
          ) : (
            <div className="w-full">
              <div className="text-center text-green-400 text-sm mb-2">
                ✓ Recording captured
              </div>
              <audio controls src={audioURL} className="w-full mb-2" />
              <button
                type="button"
                onClick={() => {
                  setAudioBlob(null);
                  setAudioURL(null);
                }}
                className="text-xs text-gray-400 hover:text-white"
              >
                Re-record
              </button>
            </div>
          )}
          {recording && (
            <div className="text-urgency-high text-sm animate-pulse">
              Recording… tap to stop
            </div>
          )}
          {micPermission === "denied" && (
            <div className="text-yellow-400 text-xs text-center">
              Microphone not available. Use text below.
            </div>
          )}
        </div>

        {/* Text fallback */}
        <div>
          <label className="block text-gray-400 text-xs mb-1 font-medium">
            {audioBlob ? "ADD MORE DETAILS (OPTIONAL)" : "OR DESCRIBE SYMPTOMS"}
          </label>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="e.g. Fever for 2 days, headache, body pain…"
            rows={3}
            className="w-full bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 resize-none"
          />
        </div>

        {/* Photo upload */}
        <div>
          <label className="block text-gray-400 text-xs mb-2 font-medium">
            PHOTO (OPTIONAL — rash, wound, medicine)
          </label>
          {photoPreview ? (
            <div className="relative">
              <img
                src={photoPreview}
                alt="Preview"
                className="w-full h-40 object-cover rounded-xl border border-dark-600"
              />
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  setPhotoPreview(null);
                }}
                className="absolute top-2 right-2 bg-dark-800/80 text-white text-xs px-2 py-1 rounded-lg"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-24 border-2 border-dashed border-dark-600 rounded-xl text-gray-500 hover:border-gray-500 hover:text-gray-400 transition-all text-sm"
            >
              📷 Tap to add photo
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
          />
        </div>

        {error && (
          <div className="text-urgency-high text-sm text-center">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading || (!audioBlob && !textInput.trim())}
          className="w-full py-3 rounded-xl font-bold text-white text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: loading
              ? "#333"
              : "linear-gradient(135deg, #ff2200, #ff4400)",
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analysing symptoms…
            </span>
          ) : (
            "Submit Report"
          )}
        </button>

        <p className="text-center text-gray-600 text-xs">
          Anonymous • No personal data stored • Community protected
        </p>
      </form>
    </div>
  );
}
