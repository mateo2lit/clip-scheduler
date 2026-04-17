"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../login/supabaseClient";
import { Check } from "@phosphor-icons/react/dist/ssr";

const TOTAL_STEPS = 3;

type Role = "creator" | "business" | "agency" | "brand";

const ROLES: { key: Role; emoji: string; label: string; sub: string }[] = [
  { key: "creator", emoji: "🎬", label: "Content Creator", sub: "YouTube, TikTok, Reels & more" },
  { key: "business", emoji: "🏢", label: "Business Owner", sub: "Promoting products & services" },
  { key: "agency", emoji: "📊", label: "Agency", sub: "Managing client accounts" },
  { key: "brand", emoji: "🚀", label: "Brand", sub: "Growing a company's presence" },
];

const ROLE_WELCOME: Record<Role, string> = {
  creator: "We'll focus your dashboard on growing your personal brand.",
  business: "We'll help you schedule content across your business profiles.",
  agency: "We'll set you up for managing multiple client accounts.",
  brand: "We'll streamline your content distribution across every channel.",
};

const PLATFORMS: { key: string; label: string; icon: React.ReactNode }[] = [
  {
    key: "youtube",
    label: "YouTube",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.77 1.52V6.76a4.85 4.85 0 0 1-1-.07z" />
      </svg>
    ),
  },
  {
    key: "instagram",
    label: "Instagram",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    ),
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    key: "bluesky",
    label: "Bluesky",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.686 12 10.8z" />
      </svg>
    ),
  },
  {
    key: "x",
    label: "X (Twitter)",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/>
      </svg>
    ),
  },
];

const CREATOR_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID || "";
const TEAM_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID || "";
const CREATOR_ANNUAL_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_CREATOR_ANNUAL_PRICE_ID || "";
const TEAM_ANNUAL_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_TEAM_ANNUAL_PRICE_ID || "";

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [animating, setAnimating] = useState(false);

  const [role, setRole] = useState<Role | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);
  const [showBlueskyForm, setShowBlueskyForm] = useState(false);
  const [blueskyHandle, setBlueskyHandle] = useState("");
  const [blueskyPassword, setBlueskyPassword] = useState("");
  const [blueskyConnecting, setBlueskyConnecting] = useState(false);
  const [blueskyError, setBlueskyError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("annual");

  const fetchConnectedAccounts = useCallback(async (token?: string) => {
    let accessToken = token;
    if (!accessToken) {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token;
    }
    if (!accessToken) return;
    try {
      const res = await fetch("/api/platform-accounts", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (json.data && Array.isArray(json.data)) {
        const providers = [...new Set<string>(json.data.map((a: any) => a.provider))];
        setConnectedAccounts(providers);
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/login"); return; }

      const res = await fetch("/api/onboarding", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (json.completed) { router.replace("/dashboard"); return; }

      const params = new URLSearchParams(window.location.search);
      const connectedParam = params.get("connected");
      if (connectedParam) {
        setStep(2);
        setJustConnected(connectedParam);
        window.history.replaceState({}, "", "/onboarding");
      }

      await fetchConnectedAccounts(data.session.access_token);
      setLoading(false);
    })();
  }, [router, fetchConnectedAccounts]);

  useEffect(() => {
    if (!justConnected) return;
    const timer = setTimeout(() => setJustConnected(null), 3000);
    return () => clearTimeout(timer);
  }, [justConnected]);

  const goTo = useCallback((next: number, dir: "forward" | "back") => {
    if (animating) return;
    setAnimating(true);
    setDirection(dir);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 220);
  }, [animating]);

  async function connectPlatform(platform: string) {
    document.cookie = "clip-onboarding=1; path=/; max-age=1800; SameSite=Lax";
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    try {
      const res = await fetch(`/api/auth/${platform}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
    } catch {}
  }

  async function connectBluesky() {
    setBlueskyConnecting(true);
    setBlueskyError(null);
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setBlueskyConnecting(false); return; }
    try {
      const res = await fetch("/api/auth/bluesky/connect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ handle: blueskyHandle, appPassword: blueskyPassword }),
      });
      const json = await res.json();
      if (!json.ok) {
        setBlueskyError(json.error || "Failed to connect Bluesky.");
      } else {
        setBlueskyHandle("");
        setBlueskyPassword("");
        setShowBlueskyForm(false);
        setJustConnected("bluesky");
        await fetchConnectedAccounts(data.session.access_token);
      }
    } catch {
      setBlueskyError("Something went wrong. Please try again.");
    } finally {
      setBlueskyConnecting(false);
    }
  }

  async function handleCheckout(priceId: string) {
    if (!priceId) return;
    setCheckoutLoading(true);
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setCheckoutLoading(false); return; }
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ priceId }),
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
    } catch {
      setCheckoutLoading(false);
    }
  }

  async function finish() {
    setSubmitting(true);
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role, platforms: connectedAccounts, skipped: true }),
      }).catch(() => {});
    }
    router.replace("/dashboard");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
      </div>
    );
  }

  const slideClass = animating
    ? direction === "forward"
      ? "opacity-0 translate-x-6"
      : "opacity-0 -translate-x-6"
    : "opacity-100 translate-x-0";
  const contentWidthClass = step === 3 ? "max-w-5xl" : "max-w-2xl";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white flex flex-col">
      {/* Header */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-5 border-b border-white/[0.06]">
        <div className="flex justify-start">
          <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  i + 1 < step
                    ? "bg-gradient-to-br from-blue-400 to-purple-500 text-black"
                    : i + 1 === step
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/30"
                }`}
              >
                {i + 1 < step ? (
                  <Check className="w-3.5 h-3.5" weight="bold" />
                ) : (
                  i + 1
                )}
              </div>
              {i < TOTAL_STEPS - 1 && (
                <div className="w-10 h-px bg-white/10 relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-500"
                    style={{ width: i + 1 < step ? "100%" : "0%" }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button onClick={finish} className="text-xs text-white/30 hover:text-white/60 transition-colors">
            Skip →
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className={`w-full ${contentWidthClass} transition-all duration-220 ease-out ${slideClass}`}>

          {/* Step 1: Role */}
          {step === 1 && (
            <div>
              <p className="text-center text-xs font-medium tracking-widest uppercase text-blue-400/80 mb-3">
                Step 1 of 3
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-center tracking-tight mb-2">
                Welcome! What best describes you?
              </h1>
              <p className="text-center text-white/40 mb-10">
                We&apos;ll personalize your experience based on how you use Clip Dash.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRole(r.key)}
                    className={`group relative flex items-center gap-4 rounded-2xl border p-5 text-left transition-all duration-200 ${
                      role === r.key
                        ? "border-blue-400/50 bg-blue-500/10 shadow-[0_0_30px_rgba(96,165,250,0.1)]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="text-2xl shrink-0">{r.emoji}</span>
                    <div>
                      <div className="font-semibold text-white">{r.label}</div>
                      <div className="text-sm text-white/40 mt-0.5">{r.sub}</div>
                    </div>
                    {role === r.key && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-black" weight="bold" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {role && (
                <p className="mt-4 text-center text-sm text-blue-400/70">
                  {ROLE_WELCOME[role]}
                </p>
              )}
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => goTo(2, "forward")}
                  disabled={!role}
                  className="rounded-full bg-gradient-to-r from-blue-400 to-purple-500 px-8 py-3 text-sm font-semibold text-black transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Set up my accounts →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Connect Accounts */}
          {step === 2 && (
            <div>
              <p className="text-center text-xs font-medium tracking-widest uppercase text-blue-400/80 mb-3">
                Step 2 of 3
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-center tracking-tight mb-2">
                Connect your platforms
              </h1>
              <p className="text-center text-white/40 mb-10">
                Connect at least one account to start publishing. Add more later in Settings.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PLATFORMS.map((p) => {
                  const isConnected = connectedAccounts.includes(p.key);
                  const isJustConnected = justConnected === p.key;
                  const isBluesky = p.key === "bluesky";
                  return (
                    <div key={p.key}>
                      <div
                        className={`flex items-center justify-between gap-4 rounded-2xl border p-4 transition-all duration-300 ${
                          isConnected || isJustConnected
                            ? "border-emerald-400/40 bg-emerald-500/[0.06]"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={isConnected ? "text-white" : "text-white/50"}>
                            {p.icon}
                          </div>
                          <span className={`text-sm font-medium ${isConnected ? "text-white" : "text-white/60"}`}>
                            {p.label}
                          </span>
                          {isConnected && (
                            <span className="text-xs text-emerald-400 font-medium">Connected</span>
                          )}
                        </div>
                        {isConnected ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5 text-emerald-400" weight="bold" />
                          </div>
                        ) : isBluesky ? (
                          <button
                            onClick={() => setShowBlueskyForm((v) => !v)}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:border-white/20 transition-all shrink-0"
                          >
                            {showBlueskyForm ? "Cancel" : "Connect"}
                          </button>
                        ) : (
                          <button
                            onClick={() => connectPlatform(p.key)}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:border-white/20 transition-all shrink-0"
                          >
                            Connect
                          </button>
                        )}
                      </div>
                      {/* Bluesky inline form */}
                      {isBluesky && showBlueskyForm && !isConnected && (
                        <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                          <p className="text-xs text-white/40">
                            Use an{" "}
                            <a
                              href="https://bsky.app/settings/app-passwords"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-white/60"
                            >
                              App Password
                            </a>{" "}
                            — not your main Bluesky password.
                          </p>
                          <input
                            type="text"
                            placeholder="Handle (e.g. you.bsky.social)"
                            value={blueskyHandle}
                            onChange={(e) => setBlueskyHandle(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20"
                          />
                          <input
                            type="password"
                            placeholder="App Password"
                            value={blueskyPassword}
                            onChange={(e) => setBlueskyPassword(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20"
                          />
                          {blueskyError && (
                            <p className="text-xs text-red-400">{blueskyError}</p>
                          )}
                          <button
                            onClick={connectBluesky}
                            disabled={blueskyConnecting || !blueskyHandle || !blueskyPassword}
                            className="w-full rounded-xl bg-sky-500/20 border border-sky-400/20 text-sky-400 text-sm font-medium py-2 hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {blueskyConnecting ? "Connecting…" : "Connect Bluesky"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {connectedAccounts.length === 0 && (
                <p className="mt-6 text-center text-xs text-white/30">
                  Connect at least one platform to be ready to post the moment your trial starts.
                </p>
              )}
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => goTo(1, "back")}
                  className="rounded-full border border-white/10 px-6 py-3 text-sm text-white/50 hover:text-white/80 hover:border-white/20 transition-all"
                >
                  ← Back
                </button>
                <div className="flex items-center gap-4">
                  {connectedAccounts.length === 0 && (
                    <button
                      onClick={() => goTo(3, "forward")}
                      className="text-xs text-white/20 hover:text-white/40 transition-colors"
                    >
                      Skip
                    </button>
                  )}
                  <button
                    onClick={() => goTo(3, "forward")}
                    className="rounded-full bg-gradient-to-r from-blue-400 to-purple-500 px-8 py-3 text-sm font-semibold text-black transition-all hover:opacity-90"
                  >
                    Continue →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Plan Selection */}
          {step === 3 && (
            <div className="mx-auto w-full max-w-4xl">
              <p className="mb-4 text-center text-xs font-semibold tracking-[0.28em] uppercase text-blue-400/80">
                Step 3 of 3
              </p>
              <h1 className="mb-3 text-center text-4xl font-bold tracking-tight sm:text-5xl">
                Choose your plan
              </h1>
              <p className="mx-auto mb-8 max-w-2xl text-center text-base text-white/45">
                7-day free trial. No charge until trial ends. Cancel anytime.
              </p>
              {/* Billing period toggle */}
              <div className="mb-8 flex justify-center">
                <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
                  <button
                    onClick={() => setBillingPeriod("monthly")}
                    className={`rounded-full px-5 py-2 font-semibold transition-all ${billingPeriod === "monthly" ? "bg-white text-black shadow-[0_8px_24px_rgba(255,255,255,0.18)]" : "text-white/55 hover:text-white/85"}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingPeriod("annual")}
                    className={`rounded-full px-5 py-2 font-semibold transition-all ${billingPeriod === "annual" ? "bg-white text-black shadow-[0_8px_24px_rgba(255,255,255,0.18)]" : "text-white/55 hover:text-white/85"}`}
                  >
                    Annual <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${billingPeriod === "annual" ? "bg-emerald-500/15 text-emerald-600" : "bg-emerald-500/10 text-emerald-300"}`}>Save 17%</span>
                  </button>
                </div>
              </div>
              {(role === "agency" || role === "brand") ? (
                <p className="mb-8 text-center text-sm text-blue-300/75">
                  Agencies and brands typically get the most from the Team plan — shared workspace and multi-member access.
                </p>
              ) : (
                <div className="mb-8" />
              )}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Creator */}
                <div className="relative flex flex-col overflow-visible rounded-[30px] border border-violet-400/35 bg-[linear-gradient(180deg,rgba(17,20,33,0.98),rgba(8,9,15,0.96))] p-7 pt-10 shadow-[0_24px_90px_rgba(91,33,182,0.18)]">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    Most Popular
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold">Creator</h3>
                  <div className="mt-2 text-sm leading-6 text-white/45">
                    Everything you need to upload, schedule, and track content across all platforms.
                  </div>
                  <div className="mt-6 mb-5 rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                    {billingPeriod === "annual" ? (
                      <>
                        <span className="text-5xl font-bold tracking-tight">$8.17</span>
                        <span className="ml-1 text-sm text-white/40">/month</span>
                        <div className="mt-1 text-sm text-white/50">$98 billed annually</div>
                      </>
                    ) : (
                      <>
                        <span className="text-5xl font-bold tracking-tight">$9.99</span>
                        <span className="ml-1 text-sm text-white/40">/month</span>
                        <div className="mt-1 text-sm text-white/40">Billed monthly</div>
                      </>
                    )}
                  </div>
                  <ul className="mb-8 flex-1 space-y-3 border-t border-white/8 pt-6 text-sm text-white/65">
                    {[
                      "Unlimited uploads & scheduled posts",
                      "All 7 platforms",
                      "Multiple accounts per platform",
                      "AI tag suggestions",
                      "Unified comments inbox",
                      "Analytics dashboard",
                    ].map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" weight="bold" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleCheckout(billingPeriod === "annual" ? CREATOR_ANNUAL_PRICE_ID : CREATOR_PRICE_ID)}
                    disabled={checkoutLoading || (billingPeriod === "annual" ? !CREATOR_ANNUAL_PRICE_ID : !CREATOR_PRICE_ID)}
                    className="w-full rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {checkoutLoading ? "Loading…" : "Start free trial"}
                  </button>
                  <p className="text-center text-xs text-white/40 mt-2">$0.00 due today, cancel anytime</p>
                </div>

                {/* Team */}
                <div className="relative flex flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,13,16,0.96),rgba(8,8,10,0.98))] p-7 shadow-[0_20px_70px_rgba(0,0,0,0.3)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                      Team
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-white/55">
                      Shared workspace
                    </span>
                  </div>
                  <h3 className="text-2xl font-semibold">Team</h3>
                  <div className="mt-2 text-sm leading-6 text-white/45">
                    Built for teams that need shared scheduling, shared assets, and role-based access.
                  </div>
                  <div className="mt-6 mb-5 rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                    {billingPeriod === "annual" ? (
                      <>
                        <span className="text-5xl font-bold tracking-tight">$16.58</span>
                        <span className="ml-1 text-sm text-white/40">/month</span>
                        <div className="mt-1 text-sm text-white/50">$199 billed annually</div>
                      </>
                    ) : (
                      <>
                        <span className="text-5xl font-bold tracking-tight">$19.99</span>
                        <span className="ml-1 text-sm text-white/40">/month</span>
                        <div className="mt-1 text-sm text-white/40">Billed monthly</div>
                      </>
                    )}
                  </div>
                  <ul className="mb-8 flex-1 space-y-3 border-t border-white/8 pt-6 text-sm text-white/65">
                    {[
                      "Everything in Creator",
                      "Up to 5 team members",
                      "Shared platform connections & scheduling",
                      "Role-based permissions",
                      "Shared uploads library & comments inbox",
                      "Priority email support",
                    ].map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-white/45" weight="bold" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleCheckout(billingPeriod === "annual" ? TEAM_ANNUAL_PRICE_ID : TEAM_PRICE_ID)}
                    disabled={checkoutLoading || (billingPeriod === "annual" ? !TEAM_ANNUAL_PRICE_ID : !TEAM_PRICE_ID)}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-6 py-3.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {checkoutLoading ? "Loading…" : "Start free trial"}
                  </button>
                  <p className="text-center text-xs text-white/40 mt-2">$0.00 due today, cancel anytime</p>
                </div>
              </div>
              <div className="mt-8">
                <button
                  onClick={() => goTo(2, "back")}
                  className="rounded-full border border-white/10 px-6 py-3 text-sm text-white/50 hover:text-white/80 hover:border-white/20 transition-all"
                >
                  ← Back
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-white/20">
        You can change any of this later in settings.
      </footer>
    </div>
  );
}
