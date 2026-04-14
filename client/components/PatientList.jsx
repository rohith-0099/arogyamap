"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Globe, Send, Mail, AlertTriangle, Search, RefreshCw,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  X, MapPin, Activity, Clock, Shield, User, Trash2,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const URGENCY = {
  high:   { label: "HIGH", bg: "bg-red-500/15",    text: "text-red-400",    border: "border-red-500/30"    },
  medium: { label: "MED",  bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
  low:    { label: "LOW",  bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/30"  },
};

const CHANNEL_ICON = {
  web:      <Globe size={14} className="text-blue-400" />,
  telegram: <Send  size={14} className="text-sky-400"  />,
  email:    <Mail  size={14} className="text-purple-400" />,
};

const RESOLUTION = {
  gps:        { label: "GPS",   cls: "text-green-400"  },
  text_fuzzy: { label: "Fuzzy", cls: "text-yellow-400" },
  text_llm:   { label: "LLM",   cls: "text-purple-400" },
  unassigned: { label: "—",     cls: "text-gray-600"   },
};

const PAGE_SIZE = 25;
const PYTHON_API = process.env.NEXT_PUBLIC_PYTHON_API_URL || "http://localhost:8000";

// What each role can see in the location picker
// asha_worker: district + city
// supervisor:  district + city (district pre-set from profile)
// admin:       country + state + district + city
const ROLE_PICKER_LEVELS = {
  asha_worker: ["district", "city"],
  supervisor:  ["district", "city"],
  admin:       ["country", "state", "district", "city"],
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function PatientList({
  role = "admin",
  zone: propZone = null,
  district: propDistrict = null,
  state: propState = null,
  country: propCountry = null,
}) {
  // Full hierarchy from /hierarchy endpoint
  const [hierarchy, setHierarchy] = useState({
    countries: [],
    states_by_country: {},
    districts_by_state: {},
    cities_by_district: {},
    city_meta: {},
  });

  // User's current selections in the location picker
  const [sel, setSel] = useState({
    country:  propCountry  || "",
    state:    propState    || "",
    district: propDistrict || "",
    city:     "",           // city key (lowercase) from city_lookup
  });

  // Reports data
  const [reports,    setReports]    = useState([]);
  const [stats,      setStats]      = useState({ total: 0, by_urgency: {}, outbreak_count: 0 });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [zoneRequired, setZoneRequired] = useState(false);

  // Filters
  const [filterUrgency,  setFilterUrgency]  = useState("");
  const [filterChannel,  setFilterChannel]  = useState("");
  const [filterOutbreak, setFilterOutbreak] = useState(false);
  const [filterHours,    setFilterHours]    = useState(48);
  const [search,         setSearch]         = useState("");

  // Sort + page
  const [sortBy,    setSortBy]    = useState("timestamp");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page,      setPage]      = useState(1);

  // Drawer
  const [drawer, setDrawer] = useState(null);

  // Row delete state
  const [deletingId, setDeletingId] = useState(null);

  async function deleteReport(id, e) {
    if (e) e.stopPropagation();
    const ok = window.confirm(
      `Remove report #${id} from the map?\n\nUse this for fake or duplicate reports. This cannot be undone.`
    );
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setReports(prev => prev.filter(r => r.id !== id));
      setDrawer(d => (d && d.id === id ? null : d));
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  // ── Load hierarchy on mount ─────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${PYTHON_API}/hierarchy`)
      .then(r => r.json())
      .then(setHierarchy)
      .catch(() => {});
  }, []);

  // ── Derived options from current selections ─────────────────────────────────
  const availableStates    = sel.country  ? (hierarchy.states_by_country[sel.country]     || []) : Object.values(hierarchy.states_by_country).flat();
  const availableDistricts = sel.state    ? (hierarchy.districts_by_state[sel.state]      || []) : Object.values(hierarchy.districts_by_state).flat();
  const availableCities    = sel.district ? (hierarchy.cities_by_district[sel.district]   || []) : [];

  // ── Cascade: clear child when parent changes ────────────────────────────────
  function setCountry(v)  { setSel({ country: v, state: "", district: "", city: "" }); }
  function setState_(v)   { setSel(s => ({ ...s, state: v, district: "", city: "" })); }
  function setDistrict(v) {
    setSel(s => ({ ...s, district: v, city: "" }));
    setZoneRequired(false);
  }
  function setCity(v) {
    setSel(s => ({ ...s, city: v }));
    if (v) setZoneRequired(false);
  }

  // ── Fetch reports ───────────────────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        role,
        hours:     filterHours,
        page,
        page_size: PAGE_SIZE,
        sort_by:   sortBy,
        order:     sortOrder,
      });

      // Pass city key first (backend resolves zone/district/state/country from it)
      if (sel.city) {
        params.set("city", sel.city);
        const cityInfo = hierarchy.city_meta[sel.city];
        if (cityInfo?.zone) params.set("zone", cityInfo.zone);
        else params.set("zone", sel.city);
      }
      if (sel.district) params.set("district", sel.district);
      if (sel.state)    params.set("state",    sel.state);
      if (sel.country)  params.set("country",  sel.country);

      // Profile-level fallbacks if nothing selected
      if (!sel.district && propDistrict) params.set("district", propDistrict);
      if (!sel.state    && propState)    params.set("state",    propState);
      if (!sel.country  && propCountry)  params.set("country",  propCountry);

      if (filterUrgency)  params.set("urgency",      filterUrgency);
      if (filterChannel)  params.set("channel",      filterChannel);
      if (filterOutbreak) params.set("outbreak_only","true");

      const res = await fetch(`${PYTHON_API}/dashboard/reports?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
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
  }, [role, sel, propDistrict, propState, propCountry, filterUrgency, filterChannel, filterOutbreak, filterHours, page, sortBy, sortOrder]);

  useEffect(() => { fetchReports(); }, [fetchReports]);
  useEffect(() => { setPage(1); }, [filterUrgency, filterChannel, filterOutbreak, filterHours, sel, search, sortBy, sortOrder]);

  function toggleSort(col) {
    if (sortBy === col) setSortOrder(o => o === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortOrder("desc"); }
  }

  const pending   = reports.filter(r => !r.follow_up_status || r.follow_up_status === "pending").length;
  const u         = stats.by_urgency || {};
  const displayed = search.trim()
    ? reports.filter(r => r.symptoms_summary?.toLowerCase().includes(search.toLowerCase()))
    : reports;

  const levels = ROLE_PICKER_LEVELS[role] || ROLE_PICKER_LEVELS.admin;

  // ── Location picker card (asha_worker without selection) ───────────────────
  if (role === "asha_worker" && zoneRequired) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-dark-800 rounded-xl border border-dark-600 p-8 max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-urgency-high/15 border border-urgency-high/30 flex items-center justify-center">
              <MapPin size={18} className="text-urgency-high" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Select Your Area</h3>
              <p className="text-gray-500 text-xs">Choose the district and city you are assigned to.</p>
            </div>
          </div>

          <div className="space-y-3">
            <PickerSelect
              label="District"
              value={sel.district}
              onChange={setDistrict}
              options={["unassigned", ...availableDistricts]}
              placeholder="Select district"
            />
            <PickerSelect
              label="City"
              value={sel.city}
              onChange={setCity}
              options={[
                { value: "unassigned", label: "Unassigned / Missing Location" },
                ...availableCities.map(c => ({ value: c.key, label: c.name }))
              ]}
              placeholder={sel.district ? "Select city" : "Select district first"}
              disabled={!sel.district}
            />
          </div>

          <button
            onClick={fetchReports}
            disabled={!sel.district}
            className="mt-5 w-full bg-urgency-high hover:bg-red-700 disabled:bg-dark-600 disabled:text-gray-600 text-white font-semibold py-2.5 rounded-lg transition-all"
          >
            Load Reports
          </button>
        </div>
      </div>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 pb-10">

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <StatCard icon={<Activity size={15}/>}      label="Total"          value={stats.total}           color="text-indigo-400"  border="border-indigo-500/20"  />
        <StatCard icon={<AlertTriangle size={15}/>} label="Critical"       value={u.high   || 0}         color="text-red-400"     border="border-red-500/20"     />
        <StatCard icon={<Activity size={15}/>}      label="Medium"         value={u.medium || 0}         color="text-orange-400"  border="border-orange-500/20"  />
        <StatCard icon={<Activity size={15}/>}      label="Low"            value={u.low    || 0}         color="text-green-400"   border="border-green-500/20"   />
        <StatCard icon={<Clock size={15}/>}         label="Pending"        value={pending}               color="text-purple-400"  border="border-purple-500/20"  />
        <StatCard icon={<AlertTriangle size={15}/>} label="Outbreaks"      value={stats.outbreak_count||0} color="text-orange-400" border="border-orange-500/20" />
      </div>

      {/* Location breadcrumb */}
      <LocationBreadcrumb sel={sel} role={role} cityMeta={hierarchy.city_meta} propDistrict={propDistrict} />

      {/* Filters */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-4 mb-4">

        {/* Location selectors row */}
        <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-dark-700">
          {levels.includes("country") && (
            <HierarchySelect label="Country"  value={sel.country}  onChange={setCountry}
              options={hierarchy.countries} placeholder="All countries" />
          )}
          {levels.includes("state") && (
            <HierarchySelect label="State"    value={sel.state}    onChange={setState_}
              options={availableStates} placeholder="All states"
              disabled={levels.includes("country") && !sel.country && hierarchy.countries.length > 1} />
          )}
          {levels.includes("district") && (
            <HierarchySelect label="District" value={sel.district} onChange={setDistrict}
              options={["unassigned", ...availableDistricts]} placeholder="All districts" />
          )}
          {levels.includes("city") && (
            <HierarchySelect label="City"     value={sel.city}     onChange={setCity}
              options={[
                { value: "unassigned", label: "Unassigned" },
                ...availableCities.map(c => ({ value: c.key, label: c.name }))
              ]}
              placeholder={sel.district ? "All cities" : "Select district first"}
              disabled={!sel.district} />
          )}
        </div>

        {/* Report filters row */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search symptoms…"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-urgency-high/30"
            />
          </div>

          <FilterSelect value={filterUrgency} onChange={setFilterUrgency}
            options={[{ value: "", label: "All urgency" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} />

          <FilterSelect value={filterChannel} onChange={setFilterChannel}
            options={[{ value: "", label: "All channels" }, { value: "web", label: "Web" }, { value: "telegram", label: "Telegram" }, { value: "email", label: "Email" }]} />

          <FilterSelect value={filterHours} onChange={v => setFilterHours(Number(v))}
            options={[{ value: 6, label: "6 hrs" }, { value: 24, label: "24 hrs" }, { value: 48, label: "48 hrs" }, { value: 168, label: "7 days" }, { value: 720, label: "30 days" }]} />

          <label className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer select-none whitespace-nowrap">
            <input type="checkbox" checked={filterOutbreak} onChange={e => setFilterOutbreak(e.target.checked)} className="accent-orange-500 w-3.5 h-3.5" />
            Outbreak only
          </label>

          <button onClick={fetchReports}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-dark-700 hover:bg-dark-600 border border-dark-600 text-gray-300 hover:text-white text-sm rounded-lg transition-all">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-red-950/50 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertTriangle size={15} />{error}
        </div>
      )}

      {/* Table */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-gray-500 text-xs uppercase tracking-wide bg-dark-800">
                <SortTh col="timestamp" active={sortBy} order={sortOrder} onSort={toggleSort}>Time</SortTh>
                <Th>ID</Th>
                <SortTh col="urgency" active={sortBy} order={sortOrder} onSort={toggleSort}>Urgency</SortTh>
                <Th>Symptoms</Th>
                <Th>City / Zone</Th>
                <Th>District</Th>
                {role === "admin" && <Th>State</Th>}
                <Th>Ch</Th>
                <Th>Loc</Th>
                {role !== "asha_worker" && <Th>Worker</Th>}
                <Th>Status</Th>
                <Th>OB</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {loading && (
                <tr><td colSpan={20} className="py-12 text-center text-gray-500">
                  <RefreshCw size={16} className="animate-spin inline mr-2 opacity-40" />Loading…
                </td></tr>
              )}
              {!loading && displayed.length === 0 && (
                <tr><td colSpan={20} className="py-12 text-center text-gray-500">
                  No reports match the current filters.
                </td></tr>
              )}
              {!loading && displayed.map(r => (
                <tr key={r.id} onClick={() => setDrawer(r)}
                  className={`hover:bg-dark-700/60 cursor-pointer transition-colors ${r.outbreak_flag ? "bg-orange-950/10" : ""}`}>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtTime(r.timestamp)}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">#{r.id}</td>
                  <td className="px-4 py-3"><UrgencyBadge u={r.urgency} /></td>
                  <td className="px-4 py-3 text-gray-200 max-w-[200px] truncate">{r.symptoms_summary || "—"}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{r.zone_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{r.district || "—"}</td>
                  {role === "admin" && <td className="px-4 py-3 text-gray-500 text-xs">{r.state || "—"}</td>}
                  <td className="px-4 py-3">{CHANNEL_ICON[r.channel] || <span className="text-gray-600">{r.channel}</span>}</td>
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
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={(e) => deleteReport(r.id, e)}
                      disabled={deletingId === r.id}
                      title="Remove from map (fake / duplicate)"
                      className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {deletingId === r.id
                        ? <RefreshCw size={13} className="animate-spin" />
                        : <Trash2 size={13} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-600 text-sm text-gray-500">
            <span>Page {page} / {pagination.pages} &nbsp;·&nbsp; {pagination.total} reports</span>
            <div className="flex gap-1">
              <PageBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={15} /></PageBtn>
              <PageBtn onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages}><ChevronRight size={15} /></PageBtn>
            </div>
          </div>
        )}
      </div>

      {drawer && (
        <DetailDrawer
          r={drawer}
          role={role}
          onClose={() => setDrawer(null)}
          onDeleted={(id) => {
            setReports(prev => prev.filter(r => r.id !== id));
            setDrawer(null);
          }}
        />
      )}
    </div>
  );
}

// ── Location breadcrumb ───────────────────────────────────────────────────────

function LocationBreadcrumb({ sel, role, cityMeta, propDistrict }) {
  const parts = [];
  if (sel.country)  parts.push(sel.country);
  if (sel.state)    parts.push(sel.state);
  const district = sel.district || propDistrict;
  if (district)     parts.push(district);
  if (sel.city) {
    const meta = cityMeta[sel.city];
    parts.push(meta ? meta.zone || sel.city.replace(/\b\w/g, c => c.toUpperCase()) : sel.city);
  }

  if (parts.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3 px-1">
      <MapPin size={11} className="text-gray-600" />
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-gray-700">›</span>}
          <span className={i === parts.length - 1 ? "text-gray-300 font-medium" : ""}>{p}</span>
        </span>
      ))}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, border }) {
  return (
    <div className={`bg-dark-800 rounded-xl p-4 border ${border}`}>
      <div className={`flex items-center gap-1.5 mb-1 ${color}`}>
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function UrgencyBadge({ u }) {
  const s = URGENCY[u] || { label: u?.toUpperCase() || "—", bg: "bg-gray-800", text: "text-gray-400", border: "border-gray-700" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${s.bg} ${s.text} border ${s.border}`}>
      {s.label}
    </span>
  );
}

function StatusBadge({ s }) {
  const cls = { better: "text-green-400", same: "text-yellow-400", worse: "text-red-400" };
  return <span className={`text-xs ${cls[s] || "text-gray-600"}`}>{s || "pending"}</span>;
}

function Th({ children }) {
  return <th className="px-4 py-3 text-left whitespace-nowrap">{children}</th>;
}

function SortTh({ col, active, order, onSort, children }) {
  const on = active === col;
  return (
    <th onClick={() => onSort(col)}
      className="px-4 py-3 text-left whitespace-nowrap cursor-pointer hover:text-gray-300 select-none">
      <span className="flex items-center gap-1">
        {children}
        {on ? (order === "desc" ? <ChevronDown size={11}/> : <ChevronUp size={11}/>) : <span className="opacity-20">⇅</span>}
      </span>
    </th>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-urgency-high/30 cursor-pointer">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function HierarchySelect({ label, value, onChange, options, placeholder, disabled }) {
  // options can be strings or {value, label} objects
  const normalised = options.map(o => {
    if (typeof o === "string") {
      if (o === "unassigned") return { value: "unassigned", label: "Unassigned ⚠️" };
      return { value: o, label: o };
    }
    return o;
  });
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-600 whitespace-nowrap">{label}:</span>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className={`bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-urgency-high/30 cursor-pointer
          ${value ? "text-white" : "text-gray-500"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
        <option value="">{placeholder}</option>
        {normalised.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function PickerSelect({ label, value, onChange, options, placeholder, disabled }) {
  const normalised = options.map(o => {
    if (typeof o === "string") {
      if (o === "unassigned") return { value: "unassigned", label: "Unassigned ⚠️" };
      return { value: o, label: o };
    }
    return o;
  });
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className={`w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-urgency-high/40
          ${value ? "text-white" : "text-gray-500"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
        <option value="">{placeholder}</option>
        {normalised.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function PageBtn({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="p-1.5 rounded-lg hover:bg-dark-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      {children}
    </button>
  );
}

function fmtTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ts; }
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ r, role, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState(null);

  async function handleDelete() {
    const ok = window.confirm(
      `Remove report #${r.id} from the map?\n\nUse this for fake or duplicate reports. This cannot be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    setDelError(null);
    try {
      const res = await fetch(`/api/reports/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      onDeleted?.(r.id);
    } catch (err) {
      setDelError(err.message);
      setDeleting(false);
    }
  }

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
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Remove report from map (mark as fake)"
              className="p-2 rounded-lg hover:bg-red-500/15 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={17} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-600 text-gray-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
        {delError && (
          <div className="mx-5 mt-4 flex items-center gap-2 p-2.5 bg-red-950/50 border border-red-500/30 rounded-lg text-red-400 text-xs">
            <AlertTriangle size={13} />{delError}
          </div>
        )}

        <div className="p-5 space-y-5">
          <DrawerSection title="Symptoms">
            <p className="text-gray-200 text-sm leading-relaxed">{r.symptoms_summary || "—"}</p>
          </DrawerSection>

          <DrawerSection title="Advice">
            <p className="text-gray-400 text-sm leading-relaxed">{r.advice || "—"}</p>
          </DrawerSection>

          <DrawerSection title="Location">
            <DrawerRow label="City / Zone" value={r.zone_name || "—"} />
            <DrawerRow label="District"    value={r.district  || "—"} />
            <DrawerRow label="State"       value={r.state     || "—"} />
            <DrawerRow label="Country"     value={r.country   || "—"} />
            <DrawerRow label="Method"      value={
              <span className={`text-xs font-mono ${RESOLUTION[r.resolution_method]?.cls}`}>
                {RESOLUTION[r.resolution_method]?.label || "—"}
              </span>
            } />
          </DrawerSection>

          <DrawerSection title="Signal Analysis">
            <DrawerRow label="Cough"        value={r.has_cough ? (r.cough_type || "detected") : "—"} />
            <DrawerRow label="Voice Stress" value={r.voice_stress != null ? `${(r.voice_stress * 100).toFixed(0)}%` : "—"} />
            <DrawerRow label="Language"     value={r.language || "—"} />
          </DrawerSection>

          <DrawerSection title="Metadata">
            <DrawerRow label="Channel"   value={<span className="flex items-center gap-1.5 capitalize">{CHANNEL_ICON[r.channel]} {r.channel}</span>} />
            {role !== "asha_worker" && <DrawerRow label="Worker" value={r.assigned_worker_id || "unassigned"} />}
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
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2.5 pb-1.5 border-b border-dark-700">{title}</div>
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
