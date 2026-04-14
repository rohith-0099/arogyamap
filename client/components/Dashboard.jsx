"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Navigation,
  Map as MapIcon,
  Globe,
  Send,
  Mail,
  Wind,
  Check,
  Clock,
  Activity,
  MapPin,
  Trash2,
  RefreshCw,
} from "lucide-react";

const URGENCY_COLORS = { high: "#ff2200", medium: "#ff8800", low: "#00cc66" };
const URGENCY_PRIORITY = { high: 0, medium: 1, low: 2 };

function Sparkline({ data, color }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const w = 60;
  const h = 24;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Greedy nearest-neighbour route optimiser
function optimiseRoute(reports, startLat = 10.8505, startLng = 76.2711) {
  if (reports.length === 0) return [];
  const remaining = reports.filter((r) => r.lat && r.lng);
  const route = [];
  let curLat = startLat;
  let curLng = startLng;
  while (remaining.length > 0) {
    let minDist = Infinity;
    let minIdx = 0;
    remaining.forEach((r, i) => {
      const d = haversineKm(curLat, curLng, r.lat, r.lng);
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    });
    const next = remaining.splice(minIdx, 1)[0];
    route.push({ ...next, distance_km: minDist.toFixed(1) });
    curLat = next.lat;
    curLng = next.lng;
  }
  return route;
}

export default function Dashboard() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("urgency"); // urgency | time | distance
  const [routeMode, setRouteMode] = useState(false);
  const [workerLat, setWorkerLat] = useState(10.8505);
  const [workerLng, setWorkerLng] = useState(76.2711);
  const [outbreaks, setOutbreaks] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  async function deleteReport(id) {
    const ok = window.confirm(
      `Remove report #${id} from the map?\n\nUse this for fake or duplicate reports. This cannot be undone.`
    );
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setReports(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [rRes, oRes] = await Promise.all([
          fetch("/api/reports"),
          fetch("/api/outbreak"),
        ]);
        const rData = await rRes.json();
        const oData = await oRes.json();
        if (rData.reports) setReports(rData.reports.filter((r) => r.lat && r.lng));
        if (oData.clusters) setOutbreaks(oData.clusters);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    // Get worker location
    navigator.geolocation?.getCurrentPosition((pos) => {
      setWorkerLat(pos.coords.latitude);
      setWorkerLng(pos.coords.longitude);
    });

    load();
  }, []);

  const sorted = [...reports].sort((a, b) => {
    if (sortBy === "urgency") return URGENCY_PRIORITY[a.urgency] - URGENCY_PRIORITY[b.urgency];
    if (sortBy === "time") return new Date(b.timestamp) - new Date(a.timestamp);
    if (sortBy === "distance") {
      const da = haversineKm(workerLat, workerLng, a.lat, a.lng);
      const db = haversineKm(workerLat, workerLng, b.lat, b.lng);
      return da - db;
    }
    return 0;
  });

  const optimised = routeMode ? optimiseRoute(sorted.slice(0, 10), workerLat, workerLng) : null;
  const displayReports = optimised || sorted;

  // Sparkline: last 7 days report counts
  const sparkData = (() => {
    const counts = new Array(7).fill(0);
    const now = Date.now();
    reports.forEach((r) => {
      const daysAgo = Math.floor((now - new Date(r.timestamp)) / 86400000);
      if (daysAgo < 7) counts[6 - daysAgo]++;
    });
    return counts;
  })();

  const highCount = reports.filter((r) => r.urgency === "high").length;
  const medCount = reports.filter((r) => r.urgency === "medium").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-urgency-high border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">ASHA Worker Dashboard</h1>
        <p className="text-gray-400 text-sm">Zone overview • Patient urgency ranking • Visit route</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
          <div className="text-2xl font-bold text-white">{reports.length}</div>
          <div className="text-gray-400 text-xs">Reports (48h)</div>
          <Sparkline data={sparkData} color="#888" />
        </div>
        <div className="bg-dark-800 rounded-xl p-4 border border-red-900/40">
          <div className="text-2xl font-bold text-urgency-high">{highCount}</div>
          <div className="text-gray-400 text-xs">High Urgency</div>
          <Sparkline data={sparkData} color="#ff2200" />
        </div>
        <div className="bg-dark-800 rounded-xl p-4 border border-orange-900/40">
          <div className="text-2xl font-bold" style={{ color: "#ff8800" }}>{medCount}</div>
          <div className="text-gray-400 text-xs">Medium Urgency</div>
          <Sparkline data={sparkData} color="#ff8800" />
        </div>
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
          <div className="text-2xl font-bold text-urgency-high">{outbreaks.length}</div>
          <div className="text-gray-400 text-xs">Active Clusters</div>
        </div>
      </div>

      {/* Outbreak alerts */}
      {outbreaks.length > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-red-950/50 border border-urgency-high/40 text-urgency-high">
          <div className="flex items-center gap-2 font-bold text-sm mb-2">
            <AlertTriangle size={18} fill="currentColor" fillOpacity={0.2} />
            Active Outbreak Clusters
          </div>
          {outbreaks.map((c, i) => (
            <div key={i} className="text-gray-300 text-sm">
              {c.count} {c.symptom_category} cases within 2km — {c.area || "Cluster " + (i + 1)}
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-400">Sort:</div>
        {["urgency", "time", "distance"].map((opt) => (
          <button
            key={opt}
            onClick={() => setSortBy(opt)}
            className={`px-3 py-1 rounded-lg text-sm capitalize transition-all ${
              sortBy === opt
                ? "bg-urgency-high text-white"
                : "bg-dark-700 text-gray-400 hover:text-white"
            }`}
          >
            {opt}
          </button>
        ))}
        <div className="ml-auto">
          <button
            onClick={() => setRouteMode(!routeMode)}
            className={`px-3 py-1 rounded-lg text-sm transition-all ${
              routeMode
                ? "bg-green-700 text-white"
                : "bg-dark-700 text-gray-400 hover:text-white"
            }`}
          >
            {routeMode ? (
              <span className="flex items-center gap-1.5 font-medium">
                <Check size={14} /> Route Optimised
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Navigation size={14} /> Optimise Route
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Patient table */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-gray-400 text-xs uppercase">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Urgency</th>
                <th className="px-4 py-3 text-left">Symptoms</th>
                <th className="px-4 py-3 text-left">Channel</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">Distance</th>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Cough</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayReports.slice(0, 50).map((report, i) => {
                const color = URGENCY_COLORS[report.urgency] || "#00cc66";
                const dist = haversineKm(workerLat, workerLng, report.lat, report.lng);
                return (
                  <tr
                    key={report.id}
                    className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-bold uppercase"
                        style={{
                          color,
                          backgroundColor: color + "20",
                          border: `1px solid ${color}40`,
                        }}
                      >
                        {report.urgency}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-200 capitalize">
                      {report.symptoms_summary}
                    </td>
                    <td className="px-4 py-3 text-gray-400 capitalize">
                      <div className="flex items-center gap-2">
                        {report.channel === "web" && <Globe size={14} className="text-blue-400" />}
                        {report.channel === "telegram" && <Send size={14} className="text-sky-400" />}
                        {report.channel === "email" && <Mail size={14} className="text-purple-400" />}
                        <span>{report.channel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-gray-500" />
                        <span className="capitalize">{report.city || "Unknown"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {report.distance_km ?? dist.toFixed(1)} km
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(report.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {report.has_cough ? (
                        <div className="flex items-center gap-1.5 text-yellow-400 text-xs">
                          <Wind size={12} />
                          <span>{report.cough_type || "yes"}</span>
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {report.follow_up_status ? (
                        <span
                          className={`text-xs ${
                            report.follow_up_status === "better"
                              ? "text-green-400"
                              : report.follow_up_status === "worse"
                              ? "text-urgency-high"
                              : "text-yellow-400"
                          }`}
                        >
                          {report.follow_up_status}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteReport(report.id)}
                        disabled={deletingId === report.id}
                        title="Remove from map (fake / duplicate)"
                        className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {deletingId === report.id
                          ? <RefreshCw size={13} className="animate-spin" />
                          : <Trash2 size={13} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {displayReports.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            No reports in your zone (48h)
          </div>
        )}
      </div>
    </div>
  );
}
