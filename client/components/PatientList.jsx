"use client";

import { useState, useEffect, useCallback } from "react";

const URGENCY_COLOR = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const URGENCY_LABEL = {
  high: "HIGH",
  medium: "MED",
  low: "LOW",
};

const CHANNEL_ICON = {
  web: "🌐",
  telegram: "✈",
  email: "✉",
};

const RESOLUTION_LABEL = {
  gps: "GPS",
  text_fuzzy: "Fuzzy",
  text_llm: "LLM",
  unassigned: "—",
};

const PAGE_SIZE = 25;

export default function PatientList({ role = "admin", zone = null, district = null }) {
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState({ total: 0, by_urgency: {}, outbreak_count: 0 });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [filterUrgency, setFilterUrgency] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterOutbreak, setFilterOutbreak] = useState(false);
  const [filterHours, setFilterHours] = useState(48);

  // Sorting
  const [sortBy, setSortBy] = useState("timestamp");
  const [sortOrder, setSortOrder] = useState("desc");

  // Page
  const [page, setPage] = useState(1);

  // Detail drawer
  const [drawerReport, setDrawerReport] = useState(null);

  const fetchReports = useCallback(async () => {
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
      if (zone) params.set("zone", zone);
      if (district) params.set("district", district);
      if (filterUrgency) params.set("urgency", filterUrgency);
      if (filterChannel) params.set("channel", filterChannel);
      if (filterOutbreak) params.set("outbreak_only", "true");

      const PYTHON_API = process.env.NEXT_PUBLIC_PYTHON_API_URL || "http://localhost:8000";
      const res = await fetch(`${PYTHON_API}/dashboard/reports?${params}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setReports(data.reports || []);
      setStats(data.stats || { total: 0, by_urgency: {}, outbreak_count: 0 });
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [role, zone, district, filterUrgency, filterChannel, filterOutbreak, filterHours, page, sortBy, sortOrder]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterUrgency, filterChannel, filterOutbreak, filterHours, sortBy, sortOrder]);

  function toggleSort(col) {
    if (sortBy === col) {
      setSortOrder(o => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
  }

  function SortIndicator({ col }) {
    if (sortBy !== col) return <span style={{ opacity: 0.3 }}>⇅</span>;
    return <span>{sortOrder === "desc" ? "↓" : "↑"}</span>;
  }

  const urgencyCounts = stats.by_urgency || {};

  return (
    <div style={{ background: "#0d0d1a", color: "#e0e0e0", minHeight: "100vh", fontFamily: "monospace" }}>
      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, padding: "16px 20px", borderBottom: "1px solid #1e1e3a", flexWrap: "wrap" }}>
        <StatCard label="Total Reports" value={stats.total} color="#6366f1" />
        <StatCard label="High" value={urgencyCounts.high || 0} color="#ef4444" />
        <StatCard label="Medium" value={urgencyCounts.medium || 0} color="#f59e0b" />
        <StatCard label="Low" value={urgencyCounts.low || 0} color="#22c55e" />
        <StatCard label="Outbreak" value={stats.outbreak_count || 0} color="#f97316" />
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, padding: "12px 20px", flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid #1e1e3a" }}>
        <Select
          label="Urgency"
          value={filterUrgency}
          onChange={setFilterUrgency}
          options={[{ value: "", label: "All" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]}
        />
        <Select
          label="Channel"
          value={filterChannel}
          onChange={setFilterChannel}
          options={[{ value: "", label: "All" }, { value: "web", label: "Web" }, { value: "telegram", label: "Telegram" }, { value: "email", label: "Email" }]}
        />
        <Select
          label="Window"
          value={filterHours}
          onChange={v => setFilterHours(Number(v))}
          options={[{ value: 6, label: "6h" }, { value: 24, label: "24h" }, { value: 48, label: "48h" }, { value: 168, label: "7d" }]}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterOutbreak}
            onChange={e => setFilterOutbreak(e.target.checked)}
            style={{ accentColor: "#f97316" }}
          />
          Outbreak only
        </label>
        <button
          onClick={fetchReports}
          style={{ marginLeft: "auto", padding: "6px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
        >
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#3b0a0a", color: "#ef4444", padding: "10px 20px", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#111128", textAlign: "left", color: "#8888aa" }}>
              <Th onClick={() => toggleSort("timestamp")}>Time <SortIndicator col="timestamp" /></Th>
              <Th>ID</Th>
              <Th onClick={() => toggleSort("urgency")}>Urgency <SortIndicator col="urgency" /></Th>
              <Th>Symptoms</Th>
              <Th>Zone</Th>
              <Th>Ch</Th>
              <Th>Loc</Th>
              <Th>Status</Th>
              <Th>OB</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 30, color: "#555" }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && reports.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 30, color: "#555" }}>
                  No reports match filters.
                </td>
              </tr>
            )}
            {!loading && reports.map(r => (
              <tr
                key={r.id}
                onClick={() => setDrawerReport(r)}
                style={{
                  borderBottom: "1px solid #1a1a2e",
                  cursor: "pointer",
                  background: r.outbreak_flag ? "rgba(249,115,22,0.06)" : "transparent",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#111128")}
                onMouseLeave={e => (e.currentTarget.style.background = r.outbreak_flag ? "rgba(249,115,22,0.06)" : "transparent")}
              >
                <td style={{ padding: "8px 12px", color: "#666" }}>{formatTime(r.timestamp)}</td>
                <td style={{ padding: "8px 12px", color: "#555" }}>#{r.id}</td>
                <td style={{ padding: "8px 12px" }}>
                  <UrgencyBadge urgency={r.urgency} />
                </td>
                <td style={{ padding: "8px 12px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.symptoms_summary || "—"}
                </td>
                <td style={{ padding: "8px 12px", color: "#8888aa" }}>{r.zone_name || "—"}</td>
                <td style={{ padding: "8px 12px", fontSize: 16 }}>{CHANNEL_ICON[r.channel] || r.channel}</td>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{ fontSize: 11, background: "#1a1a3a", padding: "2px 6px", borderRadius: 4, color: "#8888cc" }}>
                    {RESOLUTION_LABEL[r.resolution_method] || "—"}
                  </span>
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <FollowUpBadge status={r.follow_up_status} />
                </td>
                <td style={{ padding: "8px 12px", textAlign: "center" }}>
                  {r.outbreak_flag && <span style={{ color: "#f97316" }}>⚠</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: "flex", gap: 8, padding: "12px 20px", alignItems: "center", justifyContent: "flex-end", borderTop: "1px solid #1e1e3a" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={pageBtnStyle(page > 1)}>
            Prev
          </button>
          <span style={{ fontSize: 13, color: "#666" }}>
            {page} / {pagination.pages}
          </span>
          <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages} style={pageBtnStyle(page < pagination.pages)}>
            Next
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {drawerReport && (
        <DetailDrawer report={drawerReport} onClose={() => setDrawerReport(null)} />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "#111128", border: `1px solid ${color}33`, borderRadius: 8, padding: "10px 18px", minWidth: 100 }}>
      <div style={{ fontSize: 22, fontWeight: "bold", color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function UrgencyBadge({ urgency }) {
  const color = URGENCY_COLOR[urgency] || "#888";
  const label = URGENCY_LABEL[urgency] || urgency?.toUpperCase() || "—";
  return (
    <span style={{
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: "bold",
    }}>
      {label}
    </span>
  );
}

function FollowUpBadge({ status }) {
  const map = {
    better: { label: "Better", color: "#22c55e" },
    same: { label: "Same", color: "#f59e0b" },
    worse: { label: "Worse", color: "#ef4444" },
    pending: { label: "Pending", color: "#555" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ fontSize: 11, color: s.color }}>
      {s.label}
    </span>
  );
}

function Th({ children, onClick }) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: "10px 12px",
        fontWeight: 600,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 1,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 12, color: "#666" }}>{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: "#111128",
          color: "#ccc",
          border: "1px solid #2a2a4a",
          borderRadius: 4,
          padding: "4px 8px",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function pageBtnStyle(enabled) {
  return {
    padding: "5px 12px",
    background: enabled ? "#1e1e3a" : "#0d0d1a",
    color: enabled ? "#aaa" : "#333",
    border: "1px solid #2a2a4a",
    borderRadius: 4,
    cursor: enabled ? "pointer" : "not-allowed",
    fontSize: 13,
  };
}

function formatTime(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return ts;
  }
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ report: r, onClose }) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100 }}
      />
      {/* Panel */}
      <div style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: "min(460px, 100vw)",
        background: "#0d0d1a",
        borderLeft: "1px solid #1e1e3a",
        zIndex: 101,
        overflowY: "auto",
        padding: 24,
      }}>
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#666", fontSize: 20, cursor: "pointer" }}
        >
          ✕
        </button>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Report #{r.id}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <UrgencyBadge urgency={r.urgency} />
            {r.outbreak_flag && (
              <span style={{ background: "#f9731622", color: "#f97316", border: "1px solid #f9731644", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: "bold" }}>
                OUTBREAK
              </span>
            )}
          </div>
        </div>

        <Section title="Symptoms">
          <p style={{ color: "#ccc", margin: 0 }}>{r.symptoms_summary || "—"}</p>
        </Section>

        <Section title="Advice">
          <p style={{ color: "#aaa", margin: 0, lineHeight: 1.6 }}>{r.advice || "—"}</p>
        </Section>

        <Section title="Location">
          <Row label="Zone" value={r.zone_name || "—"} />
          <Row label="District" value={r.district || "—"} />
          <Row label="Method" value={RESOLUTION_LABEL[r.resolution_method] || "—"} />
        </Section>

        <Section title="Signal Analysis">
          <Row label="Cough Detected" value={r.has_cough ? "Yes" : "No"} />
          <Row label="Cough Type" value={r.cough_type || "none"} />
          <Row label="Voice Stress" value={r.voice_stress != null ? `${(r.voice_stress * 100).toFixed(0)}%` : "—"} />
          <Row label="Language" value={r.language || "—"} />
        </Section>

        <Section title="Metadata">
          <Row label="Channel" value={`${CHANNEL_ICON[r.channel] || ""} ${r.channel || "—"}`} />
          <Row label="Follow-up" value={r.follow_up_status || "pending"} />
          <Row label="Reported" value={r.timestamp ? new Date(r.timestamp).toLocaleString("en-IN") : "—"} />
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: "#555" }}>{label}</span>
      <span style={{ color: "#ccc" }}>{value}</span>
    </div>
  );
}
