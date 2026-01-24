// src/app/reset-password/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../login/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      setError(null);

      // If user landed here from a recovery link, session should be available
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        setError("No recovery session found. Please request a new reset email from the login page.");
      }

      setReady(true);
    };

    init();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setOk("Password updated. Redirecting to login...");
      setTimeout(() => router.push("/login"), 900);
    } catch (err: any) {
      setError(err?.message ?? "Failed to update password.");
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
        <h1 className="text-2xl font-semibold text-white">Reset password</h1>
        <p className="mt-2 text-sm text-slate-300">
          Set a new password for your account.
        </p>

        {!ready ? (
          <p className="mt-6 text-sm text-slate-300">Loading...</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-200">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.10] px-3 py-2 text-white outline-none focus:border-white/30"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                minLength={6}
                style={{ pointerEvents: "auto", position: "relative", zIndex: 999999 }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-200">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.10] px-3 py-2 text-white outline-none focus:border-white/30"
                placeholder="••••••••"
                autoComplete="new-password"
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

            {ok && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {ok}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              style={{ pointerEvents: "auto", position: "relative", zIndex: 999999 }}
            >
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
