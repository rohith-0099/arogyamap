"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, Mic, LayoutDashboard, BarChart3 } from "lucide-react";

const navItems = [
  { href: "/", label: "Live Map", icon: Map },
  { href: "/report", label: "Report", icon: Mic },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-[9999] bg-dark-800/95 backdrop-blur border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <div className="w-2.5 h-2.5 rounded-full bg-urgency-high animate-pulse" />
          <span className="text-white">ArogyaMap</span>
          <span className="text-xs text-gray-400 hidden sm:inline font-normal">
            Disease Intelligence
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
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
                <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
