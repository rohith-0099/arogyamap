"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import OutbreakBanner from "./OutbreakBanner";
import { supabase } from "@/lib/supabase";

// Urgency → color mapping
const URGENCY_COLORS = {
  high: "#ff2200",
  medium: "#ff8800",
  low: "#00cc66",
};

const KERALA_CENTER = [10.8505, 76.2711];
const CARTO_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function MapInner({ reports, outbreakClusters }) {
  const {
    MapContainer,
    TileLayer,
    CircleMarker,
    Tooltip,
    ZoomControl,
    useMap,
  } = require("react-leaflet");

  return (
    <MapContainer
      center={KERALA_CENTER}
      zoom={8}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
      attributionControl={true}
    >
      <TileLayer
        url={CARTO_TILE_URL}
        attribution={CARTO_ATTRIBUTION}
        subdomains="abcd"
        maxZoom={20}
      />
      <ZoomControl position="topright" />

      {/* Outbreak cluster rings */}
      {outbreakClusters.map((cluster, i) =>
        cluster.lat && cluster.lng ? (
          <CircleMarker
            key={`outbreak-${i}`}
            center={[cluster.lat, cluster.lng]}
            radius={30}
            pathOptions={{
              color: "#ff2200",
              fillColor: "#ff2200",
              fillOpacity: 0.08,
              weight: 2,
              dashArray: "6 4",
            }}
          />
        ) : null
      )}

      {/* Report dots */}
      {reports.map((report) => {
        if (!report.lat || !report.lng) return null;
        const color = URGENCY_COLORS[report.urgency] || "#00cc66";
        return (
          <g key={report.id}>
            {/* Outer glow */}
            <CircleMarker
              center={[report.lat, report.lng]}
              radius={12}
              pathOptions={{
                color: "transparent",
                fillColor: color,
                fillOpacity: 0.15,
                weight: 0,
              }}
            />
            {/* Inner dot */}
            <CircleMarker
              center={[report.lat, report.lng]}
              radius={5}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 0.9,
                weight: 1.5,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                <div className="text-xs">
                  <div className="font-semibold capitalize">{report.symptoms_summary}</div>
                  <div className="text-gray-300">
                    Urgency:{" "}
                    <span
                      style={{ color }}
                      className="font-bold capitalize"
                    >
                      {report.urgency}
                    </span>
                  </div>
                  <div className="text-gray-400">
                    via {report.channel} •{" "}
                    {new Date(report.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          </g>
        );
      })}
    </MapContainer>
  );
}

export default function MapView() {
  const [reports, setReports] = useState([]);
  const [outbreakClusters, setOutbreakClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, high: 0, medium: 0, low: 0 });
  const [MapReady, setMapReady] = useState(false);

  // Dynamic import Leaflet only client-side
  useEffect(() => {
    setMapReady(true);
  }, []);

  // Load initial reports
  useEffect(() => {
    async function loadReports() {
      try {
        const res = await fetch("/api/reports");
        const data = await res.json();
        if (data.reports) {
          setReports(data.reports);
          computeStats(data.reports);
        }
      } catch (err) {
        console.error("Failed to load reports:", err);
      } finally {
        setLoading(false);
      }
    }

    async function loadOutbreaks() {
      try {
        const res = await fetch("/api/outbreak");
        const data = await res.json();
        if (data.clusters) setOutbreakClusters(data.clusters);
      } catch (err) {
        console.error("Failed to load outbreaks:", err);
      }
    }

    loadReports();
    loadOutbreaks();
  }, []);

  // Real-time Supabase subscription
  useEffect(() => {
    const channel = supabase
      .channel("reports-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reports" },
        (payload) => {
          const newReport = payload.new;
          setReports((prev) => {
            const updated = [newReport, ...prev];
            computeStats(updated);
            return updated;
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  function computeStats(reportList) {
    const s = { total: reportList.length, high: 0, medium: 0, low: 0 };
    for (const r of reportList) {
      if (r.urgency === "high") s.high++;
      else if (r.urgency === "medium") s.medium++;
      else s.low++;
    }
    setStats(s);
  }

  // Dynamically import MapInner to avoid SSR
  const DynamicMap = dynamic(() => Promise.resolve(MapInner), { ssr: false });

  return (
    <div className="relative" style={{ height: "calc(100vh - 56px)" }}>
      <OutbreakBanner clusters={outbreakClusters} />

      {/* Stats overlay */}
      <div 
        className={`absolute left-4 z-[1000] bg-dark-800/90 backdrop-blur rounded-xl p-3 border border-dark-600 text-sm transition-all duration-500 ease-in-out ${
          outbreakClusters.length > 0 ? "top-20" : "top-4"
        }`}
      >
        <div className="text-gray-400 text-xs mb-2 font-medium">LAST 48H</div>
        <div className="flex gap-3">
          <div className="text-center">
            <div className="text-white font-bold text-lg">{stats.total}</div>
            <div className="text-gray-500 text-xs">Total</div>
          </div>
          <div className="text-center">
            <div className="text-urgency-high font-bold text-lg">{stats.high}</div>
            <div className="text-gray-500 text-xs">High</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-lg" style={{ color: "#ff8800" }}>{stats.medium}</div>
            <div className="text-gray-500 text-xs">Med</div>
          </div>
          <div className="text-center">
            <div className="text-urgency-low font-bold text-lg">{stats.low}</div>
            <div className="text-gray-500 text-xs">Low</div>
          </div>
        </div>
        {outbreakClusters.length > 0 && (
          <div className="mt-2 text-xs text-urgency-high font-medium animate-pulse">
            🚨 {outbreakClusters.length} active cluster(s)
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 right-4 z-[1000] bg-dark-800/90 backdrop-blur rounded-xl p-3 border border-dark-600 text-xs">
        <div className="text-gray-400 mb-2 font-medium">URGENCY</div>
        {Object.entries(URGENCY_COLORS).map(([level, color]) => (
          <div key={level} className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="capitalize text-gray-300">{level}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-dark-600">
          <div className="w-3 h-3 rounded-full border-2 border-urgency-high border-dashed" />
          <span className="text-gray-300">Outbreak</span>
        </div>
      </div>

      {/* Report CTA */}
      <div className="absolute bottom-6 left-4 z-[1000]">
        <a
          href="/report"
          className="flex items-center gap-2 bg-urgency-high hover:bg-red-700 text-white px-4 py-2 rounded-full font-medium text-sm transition-all shadow-lg shadow-red-900/50"
        >
          <span className="animate-pulse">🎙️</span>
          Report Symptoms
        </a>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-[999]">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-urgency-high border-t-transparent rounded-full mx-auto mb-3" />
            <div className="text-gray-400 text-sm">Loading disease map…</div>
          </div>
        </div>
      )}

      {MapReady && <DynamicMap reports={reports} outbreakClusters={outbreakClusters} />}
    </div>
  );
}
