"use client";

export default function OutbreakBanner({ clusters }) {
  if (!clusters || clusters.length === 0) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-[9998] bg-urgency-high/95 backdrop-blur border-b border-red-700 shadow-lg shadow-red-900/20">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 overflow-x-auto">
        <span className="animate-pulse text-white font-bold text-sm whitespace-nowrap">
          🚨 OUTBREAK ALERT
        </span>
        <div className="flex gap-4 text-sm text-red-100">
          {clusters.map((cluster, i) => (
            <span key={i} className="whitespace-nowrap">
              <strong>{cluster.count}</strong> {cluster.symptom_category} cases
              near <strong>{cluster.area || "this area"}</strong>
            </span>
          ))}
        </div>
        <a
          href="tel:104"
          className="ml-auto whitespace-nowrap text-white underline text-xs font-medium"
        >
          Call 104 Helpline
        </a>
      </div>
    </div>
  );
}
