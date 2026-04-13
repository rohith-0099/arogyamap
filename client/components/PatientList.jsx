"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Globe, Send, Mail, AlertTriangle, Search, RefreshCw,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  X, MapPin, Activity, Clock, Mic, User, Shield,
} from "lucide-react";

const URGENCY = {
  high:   { label: "HIGH",   bg: "bg-red-500/15",    text: "text-red-400",    border: "border-red-500/30"    },
  medium: { label: "MED",    bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
  low:    { label: "LOW",    bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/30"  },
};

const CHANNEL_ICON = {
  web:      <Globe size={14} className="text-blue-400" />,
  telegram: <Send  size={14} className="text-sky-400" />,
  email:    <Mail  size={14} className="text-purple-400" />,
};

const RESOLUTION = {
  gps:        { label: "GPS",   cls: "text-green-400" },
  text_fuzzy: { label: "Fuzzy", cls: "text-yellow-400" },
  text_llm:   { label: "LLM",   cls: "text-purple-400" },
  unassigned: { label: "—",     cls: "text-gray-600" },
};

const PAGE_SIZE = 25;
const PYTHON_API = process.env.NEXT_PUBLIC_PYTHON_API_URL || "http://localhost:8000";

export default function PatientList({ role = "admin", zone: propZone = null, district: propDistrict = null }) {
  // Zone picker state
  const [allDistricts, setAllDistricts] = useState([]);
  const [zonesByDistrict, setZonesByDistrict] = useState({});
  const [selectedDistrict, setSelectedDistrict] = useState(propDistrict || "");
  const [selectedZone, setSelectedZone] = useState(propZone || "");
  const [zonesReady, setZonesReady] = useState(false);

  // Report data
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState({ total: 0, by_urgency: {}, outbreak_count: 0 });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoneRequired, setZoneRequired] = useState(false);

  // Filters
  const [filterUrgency, setFilterUrgency] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterOutbreak, setFilterOutbreak] = useState(false);
  const [filterHours, setFilterHours] = useState(48);
  const [search, setSearch] = useState("");

  // Sort
  const [sortBy, setSortBy] = useState("timestamp");
  const [sortOrder, setSortOrder] = useState("desc");

  // Page
  const [page, setPage] = useState(1);

  // Drawer
  const [drawer, setDrawer] = useState(null);

  // Load zones from backend
  useEffect(() => {
    fetch(`${PYTHON_API}/zones`)
      .then(r => r.json())
      .then(d => {
        setAllDistricts(d.districts || []);
        setZonesByDistrict(d.zones_by_district || {});
        setZonesReady(true);
      })
      .catch(() => setZonesReady(true));
  }, []);

  const fetchReports = useCallback(async () => {
    const effectiveZone = selectedZone || propZone;
    const effectiveDistrict = selectedDistrict || propDistrict;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        role,
        hours: filterHours,
        page,
        page_size: PAGE_SIZE,
        sort_by: sortBy,
        order: sortOrder,
      });
      if (effectiveZone) params.set("zone", effectiveZone);
      if (effectiveDistrict) params.set("district", effectiveDistrict);
      if (filterUrgency) params.set("urgency", filterUrgency);
      if (filterChannel) params.set("channel", filterChannel);
      if (filterOutbreak) params.set("outbreak_only", "true");

      const res = await fetch(`${PYTHON_API}/dashboard/reports?${params}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();

      setZoneRequired(!!data.zone_required);
      setReports(data.reports || []);
      setStats(data.stats || { total: 0, by_urgency: {}, outbreak_count: 0 });
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [role, propZone, propDistrict, selectedZone, selectedDistrict, filterUrgency, filterChannel, filterOutbreak, filterHours, page, sortBy, sortOrder]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => { setPage(1); }, [filterUrgency, filterChannel, filterOutbreak, filterHours, selectedZone, selectedDistrict, search, sortBy, sortOrder]);

  function toggleSort(col) {
    if (sortBy === col) setSortOrder(o => o === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortOrder("desc"); }
  }

  const pending = reports.filter(r => !r.follow_up_status || r.follow_up_status === "pending").length;
  const u = stats.by_urgency || {};

  const displayed = search.trim()
    ? reports.filter(r => r.symptoms_summary?.toLowerCase().includes(search.toLowerCase()))
    : reports;

  const availableZones = selectedDistrict ? (zonesByDistrict[selectedDistrict] || []) : Object.values(zonesByDistrict).flat();

  // ── Zone picker (shown when asha_worker hasn't selected zone yet) ──────────
  if (role === "asha_worker" && zoneRequired && zonesReady) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-dark-800 rounded-xl border border-dark-600 p-8 max-w-md mx-auto text-center">
          <div className="w-12 h-12 rounded-full bg-urgency-high/15 border border-urgency-high/30 flex items-center justify-center mx-auto mb-4">
            <MapPin size={22} className="text-urgency-high" />
          </div>
          <h3 className="text-white font-semibold text-lg mb-1">Select Your Zone</h3>
          <p className="text-gray-400 text-sm mb-6">Choose your district and zone to see your assigned reports.</p>

          <div className="space-y-3 text-left">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 block">District</label>
              <select
                value={selectedDistrict}
                onChange={e => { setSelectedDistrict(e.target.value); setSelectedZone(""); }}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-urgency-high/40"
              >
                <option value="">All districts</option>
                {allDistricts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 block">Zone</label>
              <select
                value={selectedZone}
                onChange={e => setSelectedZone(e.target.value)}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-urgency-high/40"
              >
                <option value="">All zones</option>
                {availableZones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <button
              onClick={fetchReports}
              disabled={!selectedDistrict && !selectedZone}
              className="w-full bg-urgency-high hover:bg-red-700 disabled:bg-dark-600 disabled:text-gray-600 text-white font-semibold py-2.5 rounded-lg transition-all mt-2"
            >
              Load Reports
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-10">

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <StatCard icon={<Activity size={16} />} label="Total Reports"     value={stats.total}              color="text-indigo-400"  border="border-indigo-500/20" />
        <StatCard icon={<AlertTriangle size={16} />} label="Critical"      value={u.high || 0}              color="text-red-400"     border="border-red-500/20" />
        <StatCard icon={<Activity size={16} />} label="Medium"             value={u.medium || 0}            color="text-orange-400"  border="border-orange-500/20" />
        <StatCard icon={<Activity size={16} />} label="Low"                value={u.low || 0}               color="text-green-400"   border="border-green-500/20" />
        <StatCard icon={<Clock size={16} />}    label="Pending Follow-up"  value={pending}                  color="text-purple-400"  border="border-purple-500/20" />
        <StatCard icon={<AlertTriangle size={16} />} label="Outbreak Flags" value={stats.outbreak_count||0} color="text-orange-400"  border="border-orange-500/20" />
      </div>

      {/* Filters card */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">

          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search symptoms…"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-urgency-high/30"
            />
          </div>

          {/* District — admin + supervisor can change, asha_worker sees their district */}
          {role !== "asha_worker" && (
            <FilterSelect
              label="District"
              value={selectedDistrict}
              onChange={v => { setSelectedDistrict(v); setSelectedZone(""); }}
              options={[{ value: "", label: "All districts" }, ...allDistricts.map(d => ({ value: d, label: d }))]}
            />
          )}

          {/* Zone */}
          <FilterSelect
            label="Zone"
            value={selectedZone}
            onChange={setSelectedZone}
            options={[{ value: "", label: "All zones" }, ...availableZones.map(z => ({ value: z, label: z }))]}
          />

          <FilterSelect
            label="Urgency"
            value={filterUrgency}
            onChange={setFilterUrgency}
            options={[{ value: "", label: "All urgency" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]}
          />

          <FilterSelect
            label="Channel"
            value={filterChannel}
            onChange={setFilterChannel}
            options={[{ value: "", label: "All channels" }, { value: "web", label: "Web" }, { value: "telegram", label: "Telegram" }, { value: "email", label: "Email" }]}
          />

          <FilterSelect
            label="Window"
            value={filterHours}
            onChange={v => setFilterHours(Number(v))}
            options={[{ value: 6, label: "6h" }, { value: 24, label: "24h" }, { value: 48, label: "48h" }, { value: 168, label: "7 days" }]}
          />

          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none whitespace-nowrap">
            <input type="checkbox" checked={filterOutbreak} onChange={e => setFilterOutbreak(e.target.checked)} className="accent-orange-500 w-3.5 h-3.5" />
            Outbreak only
          </label>

          <button
            onClick={fetchReports}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-dark-700 hover:bg-dark-600 border border-dark-600 text-gray-300 hover:text-white text-sm rounded-lg transition-all"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-red-950/50 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-gray-500 text-xs uppercase tracking-wide">
                <SortTh col="timestamp" active={sortBy} order={sortOrder} onSort={toggleSort}>Time</SortTh>
                <Th>ID</Th>
                <SortTh col="urgency" active={sortBy} order={sortOrder} onSort={toggleSort}>Urgency</SortTh>
                <Th>Symptoms</Th>
                <Th>Zone</Th>
                {role === "admin" && <Th>District</Th>}
                <Th>Ch</Th>
                <Th>Loc</Th>
                {role !== "asha_worker" && <Th>Worker</Th>}
                <Th>Status</Th>
                <Th>OB</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {loading && (
                <tr>
                  <td colSpan={20} className="py-12 text-center text-gray-500">
                    <RefreshCw size={18} className="animate-spin inline mr-2 opacity-40" />
                    Loading reports…
                  </td>
                </tr>
              )}
              {!loading && displayed.length === 0 && (
                <tr>
                  <td colSpan={20} className="py-12 text-center text-gray-500">
                    No reports match the current filters.
                  </td>
                </tr>
              )}
              {!loading && displayed.map(r => (
                <tr
                  key={r.id}
                  onClick={() => setDrawer(r)}
                  className={`hover:bg-dark-700/60 cursor-pointer transition-colors ${r.outbreak_flag ? "bg-orange-950/20" : ""}`}
                >
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtTime(r.timestamp)}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">#{r.id}</td>
                  <td className="px-4 py-3"><UrgencyBadge u={r.urgency} /></td>
                  <td className="px-4 py-3 text-gray-200 max-w-[200px] truncate">{r.symptoms_summary || "—"}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{r.zone_name || "—"}</td>
                  {role === "admin" && <td className="px-4 py-3 text-gray-400 text-xs">{r.district || "—"}</td>}
                  <td className="px-4 py-3">{CHANNEL_ICON[r.channel] || <span className="text-gray-600 text-xs">{r.channel}</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-mono ${RESOLUTION[r.resolution_method]?.cls || "text-gray-600"}`}>
                      {RESOLUTION[r.resolution_method]?.label || "—"}
                    </span>
                  </td>
                  {role !== "asha_worker" && (
                    <td className="px-4 py-3 text-gray-600 text-xs">{r.assigned_worker_id || "—"}</td>
                  )}
                  <td className="px-4 py-3"><StatusBadge s={r.follow_up_status} /></td>
                  <td className="px-4 py-3 text-center">
                    {r.outbreak_flag && <AlertTriangle size={13} className="text-orange-400 inline" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-600 text-sm text-gray-400">
            <span>
              Page {page} of {pagination.pages} &nbsp;·&nbsp; {pagination.total} total
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-dark-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="p-1.5 rounded-lg hover:bg-dark-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {drawer && <DetailDrawer r={drawer} role={role} onClose={() => setDrawer(null)} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, border }) {
  return (
    <div className={`bg-dark-800 rounded-xl p-4 border ${border} flex flex-col gap-1`}>
      <div className={`flex items-center gap-1.5 ${color} mb-1`}>
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function UrgencyBadge({ u }) {
  const s = URGENCY[u] || { label: u?.toUpperCase() || "—", bg: "bg-gray-800", text: "text-gray-400", border: "border-gray-600" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${s.bg} ${s.text} border ${s.border}`}>
      {s.label}
    </span>
  );
}

function StatusBadge({ s }) {
  const map = {
    better:  "text-green-400",
    same:    "text-yellow-400",
    worse:   "text-red-400",
  };
  return <span className={`text-xs ${map[s] || "text-gray-600"}`}>{s || "pending"}</span>;
}

function Th({ children }) {
  return <th className="px-4 py-3 text-left whitespace-nowrap">{children}</th>;
}

function SortTh({ col, active, order, onSort, children }) {
  const isActive = active === col;
  return (
    <th
      className="px-4 py-3 text-left whitespace-nowrap cursor-pointer hover:text-gray-300 select-none"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {children}
        {isActive
          ? order === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />
          : <span className="opacity-20">⇅</span>
        }
      </span>
    </th>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-urgency-high/30 cursor-pointer"
      title={label}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function fmtTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ts; }
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ r, role, onClose }) {
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/60 z-50" />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-dark-800 border-l border-dark-600 z-50 overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-dark-800 border-b border-dark-600 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 mb-1">Report #{r.id}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <UrgencyBadge u={r.urgency} />
              {r.outbreak_flag && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  <AlertTriangle size={10} /> OUTBREAK
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-600 text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <DrawerSection title="Symptoms">
            <p className="text-gray-200 text-sm leading-relaxed">{r.symptoms_summary || "—"}</p>
          </DrawerSection>

          <DrawerSection title="Advice">
            <p className="text-gray-400 text-sm leading-relaxed">{r.advice || "—"}</p>
          </DrawerSection>

          <DrawerSection title="Location">
            <DrawerRow label="Zone"     value={r.zone_name || "—"} />
            <DrawerRow label="District" value={r.district || "—"} />
            <DrawerRow label="Method"   value={
              <span className={`text-xs font-mono ${RESOLUTION[r.resolution_method]?.cls}`}>
                {RESOLUTION[r.resolution_method]?.label || "—"}
              </span>
            } />
          </DrawerSection>

          <DrawerSection title="Signal Analysis">
            <DrawerRow label="Cough"        value={r.has_cough ? r.cough_type || "detected" : "—"} />
            <DrawerRow label="Voice Stress" value={r.voice_stress != null ? `${(r.voice_stress * 100).toFixed(0)}%` : "—"} />
            <DrawerRow label="Language"     value={r.language || "—"} />
          </DrawerSection>

          <DrawerSection title="Metadata">
            <DrawerRow label="Channel"    value={
              <span className="flex items-center gap-1.5 capitalize">
                {CHANNEL_ICON[r.channel]} {r.channel}
              </span>
            } />
            {role !== "asha_worker" && (
              <DrawerRow label="Worker" value={r.assigned_worker_id || "unassigned"} />
            )}
            <DrawerRow label="Follow-up" value={<StatusBadge s={r.follow_up_status} />} />
            <DrawerRow label="Reported"  value={r.timestamp ? new Date(r.timestamp).toLocaleString("en-IN") : "—"} />
          </DrawerSection>
        </div>
      </div>
    </>
  );
}

function DrawerSection({ title, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2.5 pb-1.5 border-b border-dark-600">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DrawerRow({ label, value }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}
