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
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden flex items-center justify-center">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Clip Pilot
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <h1 className="text-2xl font-bold tracking-tight text-center">Welcome back</h1>
          <p className="mt-2 text-sm text-white/40 text-center">
            Enter your email to receive a sign-in link.
          </p>

          {msg ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70 whitespace-pre-wrap">
              {msg}
            </div>
          ) : null}

          <form onSubmit={sendMagicLink} className="mt-6 space-y-4">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="you@email.com"
              className="w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20 transition-colors"
            />

            <button
              disabled={loading}
              className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-colors disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send login link"}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center text-sm text-white/30">
          <Link href="/" className="hover:text-white/60 transition-colors">
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
