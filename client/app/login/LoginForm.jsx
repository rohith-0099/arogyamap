"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Lock, Mail, AlertCircle, Loader2 } from "lucide-react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault(); // Ensure preventDefault is called immediately
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // Fetch user profile one time
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, district")
        .eq("id", data.user.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") {
        throw profileError;
      }

      // Role-based redirect
      const role = profile?.role;
      if (role === "asha_worker") {
        window.location.href = "/dashboard";
      } else if (role === "admin") {
        window.location.href = "/analytics";
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#171614] flex flex-col items-center justify-center p-4">
      {/* Brand Logo */}
      <div className="flex items-center gap-2 mb-8 animate-fade-in relative z-10">
        <div className="w-2 h-2 rounded-full bg-red-500 inline-block" />
        <h1 className="text-2xl font-bold tracking-tight text-white">ArogyaMap</h1>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-[#1c1b19] border border-white/10 rounded-xl p-8 shadow-2xl overflow-hidden relative group z-10">
        {/* Subtle glow effect */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#dc2626]/10 blur-[80px] rounded-full group-hover:bg-[#dc2626]/20 transition-all duration-700" />
        
        <div className="relative">
          <h2 className="text-xl font-semibold text-white mb-1">Welcome Back</h2>
          <p className="text-gray-400 text-sm mb-8 font-medium">
            ASHA Worker & Admin Portal
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3 text-red-400 text-sm animate-shake">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-11 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all font-medium"
                  placeholder="name@health.gov"
                />
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-11 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all font-medium"
                  placeholder="••••••••"
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#dc2626] hover:bg-[#b91c1c] disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>Authenticating...</span>
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-xs text-gray-600">
            For access requests, contact your district health administrator.
          </div>
        </div>
      </div>

      {/* Footer Link */}
      <Link 
        href="/" 
        className="mt-8 text-gray-500 text-sm hover:text-white transition-colors"
      >
        ← Back to Live Map
      </Link>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}
