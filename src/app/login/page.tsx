// src/app/login/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "./supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode = useMemo<"login" | "signup">(() => {
    const mode = searchParams.get("mode");
    return mode === "signup" ? "signup" : "login";
  }, [searchParams]);

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const title = mode === "login" ? "Log in" : "Create account";
  const buttonText = mode === "login" ? "Log in" : "Sign up";
  const toggleText =
    mode === "login"
      ? "Need an account? Sign up instead."
      : "Have an account? Log in instead.";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const cleanEmail = email.trim();

    if (!cleanEmail || (mode === "login" && !password) || (mode === "signup" && !password)) {
      setError("Please enter an email and password.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;

        router.push("/dashboard");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });
        if (error) throw error;

        if (!data.session) {
          setNotice("Check your email to confirm your account, then log in.");
          setMode("login");
          return;
        }

        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message ?? "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    setError(null);
    setNotice(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Enter your email first, then click reset password.");
      return;
    }

    setLoading(true);
    try {
      // Force Supabase to redirect to our reset page (not "/")
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });

      if (error) throw error;

      setNotice("Password reset email sent. Open the newest email link.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-6 bg-slate-950">
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur p-6 shadow-2xl"
        style={{ position: "relative", zIndex: 999999, pointerEvents: "auto" }}
      >
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-300">
          Use email and password to access your clip scheduler dashboard.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" style={{ pointerEvents: "auto" }}>
          <div className="space-y-1.5" style={{ pointerEvents: "auto" }}>
            <label className="text-sm font-medium text-slate-200">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.10] px-3 py-2 text-white outline-none focus:border-white/30"
              placeholder="you@email.com"
              autoComplete="email"
              required
              style={{ pointerEvents: "auto", position: "relative", zIndex: 999999 }}
            />
          </div>

          <div className="space-y-1.5" style={{ pointerEvents: "auto" }}>
            <label className="text-sm font-medium text-slate-200">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.10] px-3 py-2 text-white outline-none focus:border-white/30"
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              style={{ pointerEvents: "auto", position: "relative", zIndex: 999999 }}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {notice && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            style={{ pointerEvents: "auto", position: "relative", zIndex: 999999 }}
          >
            {loading ? "Please wait..." : buttonText}
          </button>

          {mode === "login" && (
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={loading}
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-60"
              style={{ pointerEvents: "auto", position: "relative", zIndex: 999999 }}
            >
              {loading ? "Please wait..." : "Reset password"}
            </button>
          )}
        </form>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setNotice(null);
            setMode((m) => (m === "login" ? "signup" : "login"));
          }}
          className="mt-4 w-full text-center text-sm text-slate-300 hover:text-white"
          style={{ pointerEvents: "auto", position: "relative", zIndex: 999999 }}
        >
          {toggleText}
        </button>
      </div>
    </main>
  );
}
