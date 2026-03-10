"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../login/supabaseClient";

const TOTAL_STEPS = 3;

type Role = "creator" | "business" | "agency" | "brand";
type Challenge = "time" | "consistency" | "growth" | "team";

const ROLES: { key: Role; emoji: string; label: string; sub: string }[] = [
  { key: "creator", emoji: "🎬", label: "Content Creator", sub: "YouTube, TikTok, Reels & more" },
  { key: "business", emoji: "🏢", label: "Business Owner", sub: "Promoting products & services" },
  { key: "agency", emoji: "📊", label: "Agency", sub: "Managing client accounts" },
  { key: "brand", emoji: "🚀", label: "Brand", sub: "Growing a company's presence" },
];

const PLATFORMS: { key: string; label: string; color: string; icon: React.ReactNode }[] = [
  {
    key: "youtube", label: "YouTube", color: "group-hover:text-red-400",
    icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>,
  },
  {
    key: "tiktok", label: "TikTok", color: "group-hover:text-white",
    icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.77 1.52V6.76a4.85 4.85 0 0 1-1-.07z"/></svg>,
  },
  {
    key: "instagram", label: "Instagram", color: "group-hover:text-pink-400",
    icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>,
  },
  {
    key: "facebook", label: "Facebook", color: "group-hover:text-blue-400",
    icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
  {
    key: "linkedin", label: "LinkedIn", color: "group-hover:text-blue-300",
    icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  },
  {
    key: "bluesky", label: "Bluesky", color: "group-hover:text-sky-400",
    icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.686 12 10.8z"/></svg>,
  },
];

const CHALLENGES: { key: Challenge; emoji: string; label: string; sub: string }[] = [
  { key: "time", emoji: "⏰", label: "It takes too long", sub: "Uploading to every platform manually eats my day" },
  { key: "consistency", emoji: "📅", label: "Staying consistent", sub: "I keep falling off my posting schedule" },
  { key: "growth", emoji: "📈", label: "Growing faster", sub: "I post but don't see the audience growth I want" },
  { key: "team", emoji: "👥", label: "Team coordination", sub: "Managing content with others is chaotic" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [animating, setAnimating] = useState(false);

  const [role, setRole] = useState<Role | null>(null);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Check if already completed
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/login"); return; }

      const res = await fetch("/api/onboarding", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (json.completed) { router.replace("/dashboard"); return; }
      setLoading(false);
    })();
  }, [router]);

  const goTo = useCallback((next: number, dir: "forward" | "back") => {
    if (animating) return;
    setAnimating(true);
    setDirection(dir);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 220);
  }, [animating]);

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
        body: JSON.stringify({ role, platforms, challenge }),
      });
    }
    router.replace("/dashboard");
  }

  async function skip() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role, platforms, challenge, skipped: true }),
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

  const canAdvanceStep1 = role !== null;
  const canAdvanceStep2 = platforms.length > 0;
  const canAdvanceStep3 = challenge !== null;

  const slideClass = animating
    ? direction === "forward"
      ? "opacity-0 translate-x-6"
      : "opacity-0 -translate-x-6"
    : "opacity-100 translate-x-0";

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
        <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />

        {/* Step progress */}
        <div className="flex items-center gap-2">
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
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
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

        <button onClick={skip} className="text-xs text-white/30 hover:text-white/60 transition-colors">
          Skip →
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div
          className={`w-full max-w-2xl transition-all duration-220 ease-out ${slideClass}`}
        >
          {/* Step 1: Role */}
          {step === 1 && (
            <div>
              <p className="text-center text-xs font-medium tracking-widest uppercase text-blue-400/80 mb-3">
                Step 1 of 3
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-center tracking-tight mb-2">
                What best describes you?
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
                        <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => goTo(2, "forward")}
                  disabled={!canAdvanceStep1}
                  className="rounded-full bg-gradient-to-r from-blue-400 to-purple-500 px-8 py-3 text-sm font-semibold text-black transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Platforms */}
          {step === 2 && (
            <div>
              <p className="text-center text-xs font-medium tracking-widest uppercase text-blue-400/80 mb-3">
                Step 2 of 3
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-center tracking-tight mb-2">
                Which platforms are you on?
              </h1>
              <p className="text-center text-white/40 mb-10">
                Select all that apply — Clip Dash posts to all of them at once.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PLATFORMS.map((p) => {
                  const selected = platforms.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() =>
                        setPlatforms((prev) =>
                          prev.includes(p.key)
                            ? prev.filter((k) => k !== p.key)
                            : [...prev, p.key]
                        )
                      }
                      className={`group relative flex flex-col items-center gap-2.5 rounded-2xl border p-4 transition-all duration-200 ${
                        selected
                          ? "border-blue-400/50 bg-blue-500/10 shadow-[0_0_20px_rgba(96,165,250,0.08)]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className={`transition-colors ${selected ? "text-white" : "text-white/50"}`}>
                        {p.icon}
                      </div>
                      <span className={`text-xs font-medium transition-colors ${selected ? "text-white" : "text-white/50"}`}>
                        {p.label}
                      </span>
                      {selected && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {platforms.length > 0 && (
                <p className="mt-4 text-center text-xs text-white/30">
                  {platforms.length} platform{platforms.length > 1 ? "s" : ""} selected
                </p>
              )}
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => goTo(1, "back")}
                  className="rounded-full border border-white/10 px-6 py-3 text-sm text-white/50 hover:text-white/80 hover:border-white/20 transition-all"
                >
                  ← Back
                </button>
                <button
                  onClick={() => goTo(3, "forward")}
                  disabled={!canAdvanceStep2}
                  className="rounded-full bg-gradient-to-r from-blue-400 to-purple-500 px-8 py-3 text-sm font-semibold text-black transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Challenge */}
          {step === 3 && (
            <div>
              <p className="text-center text-xs font-medium tracking-widest uppercase text-blue-400/80 mb-3">
                Step 3 of 3
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-center tracking-tight mb-2">
                What&apos;s your biggest challenge?
              </h1>
              <p className="text-center text-white/40 mb-10">
                Help us show you the most useful features first.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CHALLENGES.map((ch) => (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => setChallenge(ch.key)}
                    className={`group relative flex items-center gap-4 rounded-2xl border p-5 text-left transition-all duration-200 ${
                      challenge === ch.key
                        ? "border-blue-400/50 bg-blue-500/10 shadow-[0_0_30px_rgba(96,165,250,0.1)]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="text-2xl shrink-0">{ch.emoji}</span>
                    <div>
                      <div className="font-semibold text-white">{ch.label}</div>
                      <div className="text-sm text-white/40 mt-0.5">{ch.sub}</div>
                    </div>
                    {challenge === ch.key && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => goTo(2, "back")}
                  className="rounded-full border border-white/10 px-6 py-3 text-sm text-white/50 hover:text-white/80 hover:border-white/20 transition-all"
                >
                  ← Back
                </button>
                <button
                  onClick={finish}
                  disabled={!canAdvanceStep3 || submitting}
                  className="rounded-full bg-gradient-to-r from-blue-400 to-purple-500 px-8 py-3 text-sm font-semibold text-black transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {submitting ? "Setting up…" : "Go to Dashboard →"}
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
