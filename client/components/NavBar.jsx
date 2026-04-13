"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Live Map", icon: "🗺️" },
  { href: "/report", label: "Report", icon: "🎙️" },
  { href: "/dashboard", label: "Dashboard", icon: "🏥" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-[9999] bg-dark-800/95 backdrop-blur border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-urgency-high">●</span>
          <span className="text-white">ArogyaMap</span>
          <span className="text-xs text-gray-400 hidden sm:inline font-normal">
            Disease Intelligence
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {navItems.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-urgency-high/20 text-urgency-high border border-urgency-high/30"
                    : "text-gray-400 hover:text-white hover:bg-dark-600"
                }`}
              >
                <span>{icon}</span>
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
