"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Map, Mic, LayoutDashboard, BarChart3, LogOut, Sun, Moon } from "lucide-react";
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
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const saved = localStorage.getItem("app-theme");
    const initial = saved === "light" ? "light" : "dark";
    applyTheme(initial);
    setTheme(initial);
  }, []);

  function applyTheme(t) {
    const html = document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(t);
    localStorage.setItem("app-theme", t);
    // Keep map-theme in sync for components that read it (MapView, MicParticles)
    localStorage.setItem("map-theme", t);
    window.dispatchEvent(new Event("storage"));
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

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

  const [hasOutbreak, setHasOutbreak] = useState(false);
  const [hasForecastAlert, setHasForecastAlert] = useState(false);

  useEffect(() => {
    async function checkAlerts() {
      try {
        const res = await fetch("/api/outbreak?forecast=true");
        const data = await res.json();
        setHasOutbreak(data.clusters?.length > 0);
        setHasForecastAlert(data.forecast?.pre_alert);
      } catch (err) {}
    }
    checkAlerts();
    const iv = setInterval(checkAlerts, 600000); // 10 min
    return () => clearInterval(iv);
  }, []);

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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all relative ${
                  active
                    ? "bg-urgency-high/20 text-urgency-high border border-urgency-high/30"
                    : "text-gray-400 hover:text-white hover:bg-dark-600"
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                <span className="hidden sm:inline">{label}</span>
                
                {/* Outbreak Indicator for Live Map */}
                {href === "/" && hasOutbreak && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-dark-800 animate-bounce" />
                )}
                
                {/* Forecast Alert Indicator for Analytics */}
                {href === "/analytics" && hasForecastAlert && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-purple-500 rounded-full border-2 border-dark-800 animate-pulse" />
                )}
              </Link>
            );
          })}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-dark-600 transition-all ml-1"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

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
