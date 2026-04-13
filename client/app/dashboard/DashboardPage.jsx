"use client";

import Dashboard from "@/components/Dashboard";
import PatientList from "@/components/PatientList";
import { Shield, MapPin, User } from "lucide-react";

const ROLE_META = {
  asha_worker: { label: "ASHA Worker",  icon: User,   color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/25" },
  supervisor:  { label: "Supervisor",   icon: Shield, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/25" },
  admin:       { label: "Admin",        icon: Shield, color: "text-red-400",    bg: "bg-red-500/10 border-red-500/25" },
};

export default function DashboardPage({ role, zone, district, userEmail }) {
  const meta = ROLE_META[role] || ROLE_META.admin;
  const Icon = meta.icon;

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Role banner */}
      <div className="border-b border-dark-600 bg-dark-800/80 backdrop-blur px-4 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center gap-3 text-sm flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${meta.bg} ${meta.color}`}>
            <Icon size={12} />
            {meta.label}
          </span>
          {zone && (
            <span className="flex items-center gap-1 text-gray-400 text-xs">
              <MapPin size={11} className="text-gray-600" />
              Zone: <span className="text-gray-200 ml-1">{zone}</span>
            </span>
          )}
          {district && (
            <span className="text-gray-400 text-xs">
              District: <span className="text-gray-200 ml-1">{district}</span>
            </span>
          )}
          {userEmail && (
            <span className="ml-auto text-gray-600 text-xs hidden sm:block">{userEmail}</span>
          )}
        </div>
      </div>

      {/* Route optimiser + outbreak alerts */}
      <Dashboard />

      {/* Patient reports section */}
      <div className="max-w-6xl mx-auto px-4 pt-2 pb-2">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-white font-semibold">Patient Reports</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {role === "asha_worker" && "Select your district and zone to load assigned reports."}
              {role === "supervisor"  && "Showing all reports in your district."}
              {role === "admin"       && "Full access — use filters to scope by district or zone."}
            </p>
          </div>
        </div>
      </div>

      <PatientList role={role} zone={zone} district={district} />
    </div>
  );
}
