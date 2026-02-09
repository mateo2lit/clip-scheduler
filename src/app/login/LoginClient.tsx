"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "./supabaseClient";

type Mode = "login" | "signup" | "forgot";

export default function LoginClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const error = params.get("error");
    const message = params.get("message");
    if (error) setMsg(decodeURIComponent(error));
    else if (message) setMsg(decodeURIComponent(message));
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const origin = typeof window !== "undefined" ? window.location.origin : "";

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setMsg(error.message);
      } else {
        router.push("/dashboard");
        return;
      }
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      if (error) {
        setMsg(error.message);
      } else {
        setMsg("Check your email to confirm your account.");
      }
    } else if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      });
      if (error) {
        setMsg(error.message);
      } else {
        setMsg("Check your email for a password reset link.");
      }
    }

    setLoading(false);
  }

  const heading =
    mode === "login"
      ? "Welcome back"
      : mode === "signup"
        ? "Create an account"
        : "Reset password";

  const subtitle =
    mode === "login"
      ? "Sign in with your email and password."
      : mode === "signup"
        ? "Enter your email and a password to get started."
        : "Enter your email and we'll send a reset link.";

  const buttonLabel =
    mode === "login"
      ? loading ? "Signing in…" : "Sign in"
      : mode === "signup"
        ? loading ? "Creating account…" : "Create account"
        : loading ? "Sending…" : "Send reset link";

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden flex items-center justify-center">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Clip Dash
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <h1 className="text-2xl font-bold tracking-tight text-center">{heading}</h1>
          <p className="mt-2 text-sm text-white/40 text-center">{subtitle}</p>

          {msg ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70 whitespace-pre-wrap">
              {msg}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="you@email.com"
              className="w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20 transition-colors"
            />

            {mode !== "forgot" && (
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                minLength={6}
                placeholder="Password"
                className="w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20 transition-colors"
              />
            )}

            <button
              disabled={loading}
              className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-colors disabled:opacity-60"
            >
              {buttonLabel}
            </button>
          </form>

          <div className="mt-5 space-y-2 text-center text-sm text-white/40">
            {mode === "login" && (
              <>
                <button
                  onClick={() => { setMode("forgot"); setMsg(null); }}
                  className="block w-full hover:text-white/60 transition-colors"
                >
                  Forgot password?
                </button>
                <button
                  onClick={() => { setMode("signup"); setMsg(null); }}
                  className="block w-full hover:text-white/60 transition-colors"
                >
                  Don&apos;t have an account? <span className="text-white/60">Sign up</span>
                </button>
              </>
            )}
            {mode === "signup" && (
              <button
                onClick={() => { setMode("login"); setMsg(null); }}
                className="block w-full hover:text-white/60 transition-colors"
              >
                Already have an account? <span className="text-white/60">Sign in</span>
              </button>
            )}
            {mode === "forgot" && (
              <button
                onClick={() => { setMode("login"); setMsg(null); }}
                className="block w-full hover:text-white/60 transition-colors"
              >
                &larr; Back to sign in
              </button>
            )}
          </div>
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
