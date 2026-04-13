"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Map, Mic, LayoutDashboard, BarChart3, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

const navItems = [
  { href: "/", label: "Live Map", icon: Map },
  { href: "/report", label: "Report", icon: Mic },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  };

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

          {/* Logout — only shown when authenticated */}
          {user && (
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title={`Signed in as ${user.email}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-urgency-high hover:bg-urgency-high/10 transition-all ml-1 disabled:opacity-50"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">{loggingOut ? "…" : "Logout"}</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
