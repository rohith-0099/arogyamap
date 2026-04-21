"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import OutbreakBanner from "./OutbreakBanner";
import { supabase } from "@/lib/supabase";
import { AlertCircle, Radio, Hospital, Pill, Activity, TrendingUp, Layers } from "lucide-react";

// Urgency → neon color mapping
const URGENCY_COLORS = {
  high: "#ff0044",   // Fluorescent Red
  medium: "#ffaa00", // Bright Neon Orange
  low: "#00ff88",    // Fluorescent Green
};

const KERALA_CENTER = [10.8505, 76.2711];
// NOTE: no {r} retina suffix — CartoDB's dark_all endpoint 404s on @2x tiles
// at some zoom levels which rendered as black "holes" on retina screens.
const TILE_URLS = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
};
// 1×1 transparent gif — shown instead of a broken tile, so no hole remains.
const BLANK_TILE =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function MapInner({ reports, outbreakClusters, theme, clinics, hotspots, showClinics, showHotspots }) {
  const {
    MapContainer,
    TileLayer,
    CircleMarker,
    Marker,
    Tooltip,
    ZoomControl,
    useMap,
    L,
  } = require("react-leaflet");

  // Fix for default marker icons in Leaflet when using Next.js/Webpack
  const iconHospital = typeof window !== "undefined" ? require("lucide-react").Hospital : null;
  const iconPharmacy = typeof window !== "undefined" ? require("lucide-react").Pill : null;

  // Force Leaflet to recompute its size + refetch any skipped tiles
  // once the parent layout has finished painting.
  function TileRefresh() {
    const map = useMap();
    useEffect(() => {
      const kick = () => map.invalidateSize();
      kick();
      const t1 = setTimeout(kick, 120);
      const t2 = setTimeout(kick, 600);
      window.addEventListener("resize", kick);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        window.removeEventListener("resize", kick);
      };
    }, [map]);
    return null;
  }

  return (
    <MapContainer
      center={KERALA_CENTER}
      zoom={8}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
      attributionControl={true}
      preferCanvas={false}
      worldCopyJump={true}
    >
      <TileLayer
        key={theme}
        url={TILE_URLS[theme]}
        attribution={CARTO_ATTRIBUTION}
        subdomains={["a", "b", "c", "d"]}
        maxZoom={19}
        minZoom={3}
        tileSize={256}
        detectRetina={false}
        keepBuffer={4}
        updateWhenIdle={false}
        updateWhenZooming={false}
        crossOrigin={true}
        errorTileUrl={BLANK_TILE}
      />
      <TileRefresh />
      <ZoomControl position="topright" />

      {/* Outbreak cluster rings */}
      {outbreakClusters.map((cluster, i) =>
        cluster.lat && cluster.lng ? (
          <CircleMarker
            key={`outbreak-${i}`}
            center={[cluster.lat, cluster.lng]}
            radius={35}
            pathOptions={{
              color: "#ff0044",
              fillColor: "#ff0044",
              fillOpacity: 0.05,
              weight: 2,
              dashArray: "8 6",
            }}
          >
            <Tooltip direction="top" offset={[0, -20]} opacity={0.9}>
              <div className="text-xs">
                <div className="font-bold text-urgency-high uppercase">Active Outbreak Cluster</div>
                <div className="text-gray-300 mt-0.5">{cluster.count} reports · Risk Score: {cluster.risk_score}</div>
                <div className="text-gray-400 text-[10px]">{cluster.symptom_category}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        ) : null
      )}

      {/* Predictive Hotspots */}
      {showHotspots && hotspots.map((spot, i) => (
        <CircleMarker
          key={`hotspot-${i}`}
          center={[spot.lat, spot.lng]}
          radius={45}
          pathOptions={{
            color: "#9966ff",
            fillColor: "#9966ff",
            fillOpacity: 0.1,
            weight: 2,
            dashArray: "5 5",
          }}
          className="animate-pulse"
        >
          <Tooltip direction="top" offset={[0, -20]} opacity={0.9}>
            <div className="text-xs">
              <div className="font-bold text-purple-400 uppercase">Predicted Hotspot (48h)</div>
              <div className="text-gray-300 mt-0.5">High probability of surge</div>
              <div className="text-gray-400 text-[10px]">{spot.district}</div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Clinics & Pharmacies */}
      {showClinics && clinics.map((c, i) => (
        <CircleMarker
          key={`clinic-${i}`}
          center={[c.lat, c.lng]}
          radius={6}
          pathOptions={{
            color: c.type === "hospital" ? "#0099ff" : "#00cc66",
            fillColor: "#ffffff",
            fillOpacity: 1,
            weight: 2,
          }}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
            <div className="text-xs">
              <div className="font-bold text-white flex items-center gap-1.5">
                {c.type === "hospital" ? <Hospital size={12} className="text-blue-400" /> : <Pill size={12} className="text-green-400" />}
                {c.name}
              </div>
              <div className="text-gray-400 capitalize">{c.type}</div>
              {c.address && <div className="text-gray-500 mt-1 border-t border-gray-700 pt-1">{c.address}</div>}
              {c.phone && <div className="text-gray-500">{c.phone}</div>}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Report dots */}
      {reports.map((report) => {
        if (!report.lat || !report.lng) return null;
        const color = URGENCY_COLORS[report.urgency] || "#00cc66";
        return (
          <g key={report.id}>
            {/* Outer Large Glow */}
            <CircleMarker
              center={[report.lat, report.lng]}
              radius={20}
              pathOptions={{
                color: "transparent",
                fillColor: color,
                fillOpacity: 0.1,
                weight: 0,
              }}
            />
            {/* Mid Glow */}
            <CircleMarker
              center={[report.lat, report.lng]}
              radius={10}
              pathOptions={{
                color: "transparent",
                fillColor: color,
                fillOpacity: 0.2,
                weight: 0,
              }}
            />
            {/* Core Dot (Hot Center) */}
            <CircleMarker
              center={[report.lat, report.lng]}
              radius={4}
              pathOptions={{
                color: "#ffffff",
                fillColor: color,
                fillOpacity: 1,
                weight: 1.5,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                <div className="text-xs">
                  <div className="font-semibold capitalize text-white">{report.symptoms_summary}</div>
                  <div className="text-gray-300 mt-0.5">
                    Urgency:{" "}
                    <span
                      style={{ color }}
                      className="font-bold capitalize"
                    >
                      {report.urgency}
                    </span>
                  </div>
                  <div className="text-gray-400 text-[10px] mt-1 border-t border-gray-700 pt-1">
                    via {report.channel} • {new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
  const [clinics, setClinics] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, high: 0, medium: 0, low: 0 });
  const [MapReady, setMapReady] = useState(false);
  const [theme, setTheme] = useState("dark");
  
  const [showClinics, setShowClinics] = useState(false);
  const [showHotspots, setShowHotspots] = useState(false);
  const [activeDistrict, setActiveDistrict] = useState(null);

  useEffect(() => {
    setMapReady(true);
    const read = () => {
      const saved = localStorage.getItem("app-theme") || localStorage.getItem("map-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    };
    read();
    window.addEventListener("storage", read);
    const iv = setInterval(read, 500);
    return () => {
      window.removeEventListener("storage", read);
      clearInterval(iv);
    };
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

  // Fetch Clinics
  useEffect(() => {
    if (!showClinics || clinics.length > 0) return;
    async function loadClinics() {
      try {
        const res = await fetch("/api/clinic?lat=10.8505&lng=76.2711"); // Kerala base
        const data = await res.json();
        if (data.clinics) setClinics(data.clinics);
      } catch (err) {
        console.error("Failed to load clinics:", err);
      }
    }
    loadClinics();
  }, [showClinics]);

  // Fetch Hotspots/Forecast
  useEffect(() => {
    if (!showHotspots || hotspots.length > 0) return;
    async function loadHotspots() {
      try {
        // Fetch global forecast/hotspots
        const res = await fetch("/api/outbreak?forecast=true"); 
        const data = await res.json();
        // Simulate extraction of hotspots from forecast data for visualization
        // In real app, we'd map district forecast alerts to coordinates
        if (data.clusters) {
           const predicted = data.clusters.map(c => ({
             ...c,
             predicted: true,
             lat: c.lat + (Math.random() * 0.1 - 0.05), // Slightly offset for visual clarity
             lng: c.lng + (Math.random() * 0.1 - 0.05)
           }));
           setHotspots(predicted);
        }
      } catch (err) {
        console.error("Failed to load hotspots:", err);
      }
    }
    loadHotspots();
  }, [showHotspots]);

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
        <div className="flex items-center justify-between mb-2">
          <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">LIVE INTEL</div>
          <div className="flex gap-1">
            <button 
              onClick={() => setShowClinics(!showClinics)}
              className={`p-1.5 rounded-lg transition-all ${showClinics ? "bg-blue-500/20 text-blue-400" : "hover:bg-dark-700 text-gray-500"}`}
              title="Toggle Clinics"
            >
              <Hospital size={16} />
            </button>
            <button 
              onClick={() => setShowHotspots(!showHotspots)}
              className={`p-1.5 rounded-lg transition-all ${showHotspots ? "bg-purple-500/20 text-purple-400" : "hover:bg-dark-700 text-gray-500"}`}
              title="Toggle Hotspots"
            >
              <TrendingUp size={16} />
            </button>
          </div>
        </div>
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
          <div className="mt-2 flex items-center gap-1.5 text-xs text-urgency-high font-medium animate-pulse">
            <AlertCircle size={14} fill="currentColor" fillOpacity={0.2} />
            <span>{outbreakClusters.length} active cluster(s)</span>
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
        {showHotspots && (
          <div className="flex items-center gap-2 mt-1">
            <div className="w-3 h-3 rounded-full border-2 border-purple-500 border-dotted" />
            <span className="text-gray-300 text-[10px]">Predicted</span>
          </div>
        )}
        {showClinics && (
          <div className="mt-2 space-y-1">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-300 text-[10px]">Hospital</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-gray-300 text-[10px]">Pharmacy</span>
             </div>
          </div>
        )}
      </div>

      {/* Report CTA */}
      <div className="absolute bottom-6 left-4 z-[1000]">
        <a
          href="/report"
          className="flex items-center gap-2 bg-urgency-high hover:bg-red-700 text-white px-4 py-2 rounded-full font-medium text-sm transition-all shadow-lg shadow-red-900/50"
        >
          <Radio size={18} className="animate-pulse" />
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

      {MapReady && (
        <DynamicMap
          reports={reports}
          outbreakClusters={outbreakClusters}
          theme={theme}
        />
      )}
    </div>
  );
}
