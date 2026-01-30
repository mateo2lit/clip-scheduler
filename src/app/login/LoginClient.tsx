"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "./supabaseClient";

export default function LoginClient() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const error = params.get("error");
    const message = params.get("message");
    if (error) setMsg(decodeURIComponent(error));
    else if (message) setMsg(decodeURIComponent(message));
  }, [params]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/dashboard`,
      },
    });

    if (error) setMsg(error.message);
    else setMsg("Check your email for the login link.");

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-2 text-sm text-slate-400">
          Enter your email to receive a sign-in link.
        </p>

        {msg ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200 whitespace-pre-wrap">
            {msg}
          </div>
        ) : null}

        <form onSubmit={sendMagicLink} className="mt-6 space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="you@email.com"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-slate-600"
          />

          <button
            disabled={loading}
            className="w-full rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send login link"}
          </button>
        </form>

        <div className="mt-6 text-xs text-slate-500">
          <Link href="/" className="underline">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
