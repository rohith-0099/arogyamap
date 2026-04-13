"use client";

import Dashboard from "@/components/Dashboard";
import PatientList from "@/components/PatientList";

const ROLE_LABEL = {
  asha_worker: "ASHA Worker",
  supervisor: "Supervisor",
  admin: "Admin",
};

export default function DashboardPage({ role, zone, district, userEmail }) {
  return (
    <div>
      {/* Role context banner */}
      <div className="border-b border-dark-600 bg-dark-800/60 px-4 py-2 flex items-center gap-3 text-xs text-gray-400">
        <span className="px-2 py-0.5 rounded-full bg-urgency-high/15 text-urgency-high border border-urgency-high/25 font-semibold uppercase tracking-wide">
          {ROLE_LABEL[role] || role}
        </span>
        {zone && <span>Zone: <span className="text-gray-200">{zone}</span></span>}
        {district && <span>District: <span className="text-gray-200">{district}</span></span>}
        {userEmail && <span className="ml-auto">{userEmail}</span>}
      </div>

      {/* Route optimiser + outbreak alerts (existing component) */}
      <Dashboard />

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="border-t border-dark-600 pt-6 pb-2">
          <h2 className="text-base font-semibold text-white mb-1">Patient Reports</h2>
          <p className="text-gray-500 text-xs mb-4">
            {role === "asha_worker" && "Showing reports for your zone only."}
            {role === "supervisor" && "Showing all reports in your district."}
            {role === "admin" && "Showing all reports. Use filters to scope."}
          </p>
        </div>
      </div>

      {/* New role-aware patient list */}
      <PatientList role={role} zone={zone} district={district} />
    </div>
  );
}
