"use client";

import { useState, useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const SYMPTOMS = [
  "fever", "cough", "respiratory", "stomach", "headache", "other",
];
const SYMPTOM_COLORS = {
  fever: "#ff2200",
  cough: "#ff8800",
  respiratory: "#ffcc00",
  stomach: "#00cc66",
  headache: "#0099ff",
  other: "#9966ff",
};

const DISTRICTS = [
  "Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kannur",
  "Malappuram", "Kollam", "Palakkad",
];

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: "#aaa", font: { size: 11 } },
    },
  },
  scales: {
    x: {
      ticks: { color: "#666", font: { size: 10 } },
      grid: { color: "#1a1a26" },
    },
    y: {
      ticks: { color: "#666", font: { size: 10 } },
      grid: { color: "#1a1a26" },
    },
  },
};

function buildEpidemicData(reports) {
  // Last 14 days by symptom category
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  });

  const datasets = SYMPTOMS.map((sym) => {
    const counts = new Array(14).fill(0);
    reports
      .filter((r) => r.symptoms_summary?.toLowerCase().includes(sym))
      .forEach((r) => {
        const daysAgo = Math.floor(
          (Date.now() - new Date(r.timestamp)) / 86400000
        );
        if (daysAgo < 14) counts[13 - daysAgo]++;
      });
    return {
      label: sym.charAt(0).toUpperCase() + sym.slice(1),
      data: counts,
      borderColor: SYMPTOM_COLORS[sym],
      backgroundColor: SYMPTOM_COLORS[sym] + "20",
      fill: false,
      tension: 0.3,
      pointRadius: 3,
    };
  });

  return { labels: days, datasets };
}

function buildDistrictData(reports) {
  const scores = DISTRICTS.map((district) => {
    const distReports = reports.filter(
      (r) => r.city?.toLowerCase().includes(district.toLowerCase().split(" ")[0])
    );
    const highCount = distReports.filter((r) => r.urgency === "high").length;
    const score = distReports.length + highCount * 2;
    return { district, score, count: distReports.length };
  });

  scores.sort((a, b) => b.score - a.score);

  return {
    labels: scores.map((s) => s.district),
    datasets: [
      {
        label: "Risk Score",
        data: scores.map((s) => s.score),
        backgroundColor: scores.map((s) =>
          s.score > 10
            ? "#ff220080"
            : s.score > 5
            ? "#ff880080"
            : "#00cc6680"
        ),
        borderColor: scores.map((s) =>
          s.score > 10 ? "#ff2200" : s.score > 5 ? "#ff8800" : "#00cc66"
        ),
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };
}

function buildUrgencyTrend(reports) {
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const high = new Array(24).fill(0);
  const medium = new Array(24).fill(0);
  const low = new Array(24).fill(0);

  reports.forEach((r) => {
    const h = new Date(r.timestamp).getHours();
    if (r.urgency === "high") high[h]++;
    else if (r.urgency === "medium") medium[h]++;
    else low[h]++;
  });

  return {
    labels: hours,
    datasets: [
      { label: "High", data: high, backgroundColor: "#ff220050", borderColor: "#ff2200", borderWidth: 1, borderRadius: 2 },
      { label: "Medium", data: medium, backgroundColor: "#ff880050", borderColor: "#ff8800", borderWidth: 1, borderRadius: 2 },
      { label: "Low", data: low, backgroundColor: "#00cc6650", borderColor: "#00cc66", borderWidth: 1, borderRadius: 2 },
    ],
  };
}

export default function Analytics() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((d) => {
        if (d.reports) setReports(d.reports);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-urgency-high border-t-transparent rounded-full" />
      </div>
    );
  }

  const epidemicData = buildEpidemicData(reports);
  const districtData = buildDistrictData(reports);
  const urgencyData = buildUrgencyTrend(reports);

  // Top symptom category
  const symptomCounts = {};
  reports.forEach((r) => {
    const s = r.symptoms_summary || "other";
    symptomCounts[s] = (symptomCounts[s] || 0) + 1;
  });
  const topSymptom = Object.entries(symptomCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Epidemic Analytics</h1>
        <p className="text-gray-400 text-sm">
          District risk scores • Symptom curves • Urgency patterns
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
          <div className="text-2xl font-bold text-white">{reports.length}</div>
          <div className="text-gray-400 text-xs">Total Reports</div>
        </div>
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
          <div className="text-2xl font-bold text-urgency-high">
            {reports.filter((r) => r.urgency === "high").length}
          </div>
          <div className="text-gray-400 text-xs">High Urgency</div>
        </div>
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
          <div className="text-2xl font-bold text-yellow-400">
            {topSymptom?.[0] || "—"}
          </div>
          <div className="text-gray-400 text-xs">Top Symptom</div>
        </div>
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
          <div className="text-2xl font-bold text-purple-400">
            {reports.filter((r) => r.has_cough).length}
          </div>
          <div className="text-gray-400 text-xs">Cough Detected</div>
        </div>
      </div>

      {/* Epidemic curve */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-5 mb-4">
        <h2 className="text-white font-semibold mb-4">
          Epidemic Curves — Last 14 Days
        </h2>
        <div style={{ height: 240 }}>
          <Line data={epidemicData} options={CHART_DEFAULTS} />
        </div>
      </div>

      {/* District risk + hourly */}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="bg-dark-800 rounded-xl border border-dark-600 p-5">
          <h2 className="text-white font-semibold mb-4">District Risk Scores</h2>
          <div style={{ height: 220 }}>
            <Bar data={districtData} options={CHART_DEFAULTS} />
          </div>
        </div>
        <div className="bg-dark-800 rounded-xl border border-dark-600 p-5">
          <h2 className="text-white font-semibold mb-4">
            Urgency by Hour of Day
          </h2>
          <div style={{ height: 220 }}>
            <Bar
              data={urgencyData}
              options={{ ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins }, scales: { ...CHART_DEFAULTS.scales, x: { ...CHART_DEFAULTS.scales.x, stacked: false } } }}
            />
          </div>
        </div>
      </div>

      {/* Channel breakdown */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-5">
        <h2 className="text-white font-semibold mb-4">Channel Breakdown</h2>
        <div className="flex gap-6">
          {["web", "telegram", "email"].map((ch) => {
            const count = reports.filter((r) => r.channel === ch).length;
            const pct = reports.length > 0 ? Math.round((count / reports.length) * 100) : 0;
            return (
              <div key={ch} className="flex-1 text-center">
                <div className="text-3xl mb-1">
                  {ch === "web" ? "🌐" : ch === "telegram" ? "✈️" : "📧"}
                </div>
                <div className="text-xl font-bold text-white">{count}</div>
                <div className="text-gray-400 text-xs capitalize">{ch}</div>
                <div className="mt-2 h-1.5 bg-dark-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-urgency-high rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-gray-500 text-xs mt-1">{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
