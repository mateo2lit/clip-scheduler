"use client";

import { useEffect, useState, Fragment } from "react";
import { supabase } from "./login/supabaseClient";

const FAQ_ITEMS = [
  {
    q: "Why switch from Buffer or Hootsuite?",
    a: "Clip Dash is built specifically for video creators. It handles large file uploads (up to 2 GB), platform-specific settings like TikTok privacy levels, Instagram Reels vs. Stories, and YouTube Shorts, plus AI hashtag suggestions and multiple connected accounts per platform — things Buffer and Hootsuite don't handle well for video.",
  },
  {
    q: "What platforms do you support?",
    a: "YouTube, TikTok, Instagram (Reels & Stories), Facebook, LinkedIn, Bluesky, and X (Twitter) — 7 platforms total.",
  },
  {
    q: "Can I import clips from Twitch or Kick?",
    a: "Yes. Paste a Twitch or Kick clip link on the uploads page and Clip Dash imports it into your library so you can cross-post it across your connected platforms.",
  },
  {
    q: "How many social accounts can I connect per platform?",
    a: "Unlimited. Connect multiple YouTube channels, TikTok accounts, Instagram profiles, and more. When scheduling, you choose which accounts to post to — including all of them at once with a single upload.",
  },
  {
    q: "What types of content can I post?",
    a: "Video content — YouTube videos and Shorts (up to 256 GB / 12 hrs), TikTok clips (up to 60 min), Instagram Reels (up to 15 min) and Stories, Facebook video posts, LinkedIn videos (up to 15 min), Bluesky videos (up to 3 min / 100 MB).",
  },
  {
    q: "How much storage do I get?",
    a: "Videos are automatically deleted from our storage after they've successfully posted to all your selected platforms. Under normal use, your storage footprint stays minimal. Drafts and failed posts are cleaned up within 7 days.",
  },
  {
    q: "Will my posts get less reach using this app?",
    a: "No. Clip Dash publishes through each platform's official API — the same method native apps and major scheduling tools use. There is no known reach penalty for API-published posts.",
  },
  {
    q: "Do I need to share my social media passwords?",
    a: "Never. All connections use OAuth — you authenticate directly with each platform and we only receive a secure access token. Bluesky uses an App Password, not your main account password. Your credentials stay private.",
  },
  {
    q: "How many posts can I schedule per month?",
    a: "Unlimited on both plans. No posting caps.",
  },
  {
    q: "Can I post to multiple accounts at the same time?",
    a: "Yes. If you have two YouTube channels connected, you can check both when scheduling and Clip Dash will post the same video to both automatically.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from Settings → Subscription at any time. You keep access until the end of your current billing period.",
  },
  {
    q: "Can I get a refund?",
    a: "We offer refunds within 7 days of your first charge if you haven't published any posts. Reach out to support and we'll sort it out.",
  },
  {
    q: "I have another question",
    a: "Email us at support@clipdash.org and we'll get back to you within one business day.",
  },
];

const PRICING_PLANS = {
  creator: {
    name: "Creator",
    eyebrow: "For solo creators",
    monthly: 9.99,
    annualMonthly: 8.17,
    annualTotal: 98,
    annualSavings: 22,
    highlight: "Most popular for solo posting",
    ctaMonthly: "Start free trial",
    ctaAnnual: "Start free trial",
    included: [
      "Unlimited uploads and scheduled posts",
      "All 7 supported platforms",
      "Multiple accounts per platform",
      "AI tag suggestions and analytics",
      "Unified comments inbox",
      "Smart queue scheduling",
    ],
    locked: [
      "AI Clips workspace",
      "Up to 5 team members",
      "Shared uploads and permissions",
    ],
  },
  team: {
    name: "Team",
    eyebrow: "For editors, brands, and operators",
    monthly: 19.99,
    annualMonthly: 16.58,
    annualTotal: 199,
    annualSavings: 41,
    highlight: "Best for teams running multiple channels",
    ctaMonthly: "Start team trial",
    ctaAnnual: "Start team trial",
    included: [
      "Everything in Creator",
      "Up to 5 team members",
      "Shared platform connections",
      "Role-based permissions",
      "Shared uploads library and comments inbox",
      "AI Clips access and team workflows",
      "Priority email support",
    ],
  },
} as const;

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="relative z-10 mx-auto max-w-3xl px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Frequently asked questions</h2>
        <p className="mt-4 text-white/40 text-lg">Everything you need to know before getting started.</p>
      </div>
      <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-white/[0.03]"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
            >
              <span className="text-base font-medium text-white/90">{item.q}</span>
              <span className="shrink-0 text-lg text-white/40 leading-none">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && (
              <div className="px-6 pb-5 text-sm text-white/55 leading-relaxed border-t border-white/5">
                <p className="pt-4">{item.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("annual");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoaded(true);
    });
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center"><img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" /></a>
          <div className="flex items-center gap-3">
            {loaded && (
              user ? (
                <>
                  <span className="hidden sm:inline text-sm text-white/40">{user.email}</span>
                  <a
                    href="/dashboard"
                    className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
                  >
                    Open Dashboard
                  </a>
                </>
              ) : (
                <>
                  <a
                    href="/login"
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                  >
                    Sign In
                  </a>
                  <a
                    href="/login"
                    className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
                  >
                    Get Started
                  </a>
                </>
              )
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-24 pb-6 text-center">
        {/* Radial gradient bloom */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-[radial-gradient(ellipse_at_top,rgba(96,165,250,0.11)_0%,rgba(167,139,250,0.07)_45%,transparent_70%)] blur-3xl" />
        </div>
        <div className="inline-block rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/60 mb-8">
          Built for video creators — not brands
        </div>
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
          Upload once.{" "}
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Post everywhere.
          </span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
          Stop logging into 7 apps to post the same video. Upload once or use a Twitch/Kick clip link to auto-publish to YouTube, TikTok, Instagram, Facebook, LinkedIn, Bluesky, and X.</p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          {loaded && (
            user ? (
              <a
                href="/dashboard"
                className="rounded-full bg-white px-8 py-3.5 text-base font-semibold text-black hover:bg-white/90 transition-colors"
              >
                Open Dashboard
              </a>
            ) : (
              <a
                href="/login"
                className="rounded-full bg-white px-8 py-3.5 text-base font-semibold text-black hover:bg-white/90 transition-colors"
              >
                Try For Free →
              </a>
            )
          )}
          <a
            href="#how"
            className="rounded-full border border-white/10 bg-white/5 px-8 py-3.5 text-base text-white/70 hover:bg-white/10 transition-colors"
          >
            How it works
          </a>
        </div>

        {/* Platform icons */}
        <div className="mt-14 flex items-center justify-center gap-7" aria-label="Supported platforms">
          {[
            { delay: "0s",     color: "text-red-400",    glow: "drop-shadow(0 0 6px rgb(248 113 113)) drop-shadow(0 0 14px rgb(248 113 113 / 0.5))",  svg: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
            { delay: "0.55s",  color: "text-white/70",   glow: "drop-shadow(0 0 6px rgb(255 255 255)) drop-shadow(0 0 14px rgb(255 255 255 / 0.4))",   svg: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg> },
            { delay: "1.1s",   color: "text-pink-400",   glow: "drop-shadow(0 0 6px rgb(244 114 182)) drop-shadow(0 0 14px rgb(244 114 182 / 0.5))",  svg: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z"/></svg> },
            { delay: "1.65s",  color: "text-blue-400",   glow: "drop-shadow(0 0 6px rgb(96 165 250)) drop-shadow(0 0 14px rgb(96 165 250 / 0.5))",    svg: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z"/></svg> },
            { delay: "2.2s",   color: "text-blue-300",   glow: "drop-shadow(0 0 6px rgb(147 197 253)) drop-shadow(0 0 14px rgb(147 197 253 / 0.5))",  svg: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z"/></svg> },
            { delay: "2.75s",  color: "text-sky-400",    glow: "drop-shadow(0 0 6px rgb(56 189 248)) drop-shadow(0 0 14px rgb(56 189 248 / 0.5))",    svg: <svg className="w-6 h-6" viewBox="0 0 360 320" fill="currentColor"><path d="M180 142c-16.3-31.7-60.7-90.8-102-120C38 2 27.5-2 20 2 10 7.5 10 25.5 10 35V90c0 50 38 65 76 73-38 8-76 23-76 73v55c0 9.5 0 27.5 10 33 7.5 4 18 0 58-20 41.3-29.2 85.7-88.3 102-120zm0 0c16.3-31.7 60.7-90.8 102-120 40-20 50.5-24 58-20 10 5.5 10 23.5 10 33v55c0 50-38 65-76 73 38 8 76 23 76 73v55c0 9.5 0 27.5-10 33-7.5 4-18 0-58-20C240.7 230.8 196.3 171.7 180 142z"/></svg> },
          ].map((p, i) => (
            <div
              key={i}
              className={`animate-float ${p.color}`}
              style={{ animationDelay: p.delay, animationDuration: `${3.6 + i * 0.3}s`, filter: p.glow }}
            >
              {p.svg}
            </div>
          ))}
        </div>

        {/* Product screenshot */}
        <div className="mt-14 rounded-2xl border border-white/10 bg-white/[0.02] p-2 shadow-[0_0_100px_rgba(96,165,250,0.12),0_0_50px_rgba(167,139,250,0.08)] text-left">
          <img
            src="/product-scheduler.png"
            alt="Clip Dash scheduling interface — configure platforms, accounts, and preview in one view"
            className="w-full rounded-xl"
          />
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Built to handle the whole workflow</h2>
          <p className="mt-4 text-white/40 text-lg">One tool to manage your entire content pipeline.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                </svg>
              ),
              title: "7 Platforms, One Workflow",
              desc: "Auto-publish to YouTube, TikTok, Instagram, Facebook, LinkedIn, Bluesky, and X from a single upload.",
              color: "blue",
              extra: (
                <div className="mt-4 flex items-center gap-3">
                  {[
                    { c: "text-red-400",  s: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
                    { c: "text-white/60", s: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg> },
                    { c: "text-pink-400", s: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z"/></svg> },
                    { c: "text-blue-400", s: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z"/></svg> },
                    { c: "text-blue-300", s: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z"/></svg> },
                    { c: "text-sky-400",  s: <svg className="w-4 h-4" viewBox="0 0 360 320" fill="currentColor"><path d="M180 142c-16.3-31.7-60.7-90.8-102-120C38 2 27.5-2 20 2 10 7.5 10 25.5 10 35V90c0 50 38 65 76 73-38 8-76 23-76 73v55c0 9.5 0 27.5 10 33 7.5 4 18 0 58-20 41.3-29.2 85.7-88.3 102-120zm0 0c16.3-31.7 60.7-90.8 102-120 40-20 50.5-24 58-20 10 5.5 10 23.5 10 33v55c0 50-38 65-76 73 38 8 76 23 76 73v55c0 9.5 0 27.5-10 33-7.5 4-18 0-58-20C240.7 230.8 196.3 171.7 180 142z"/></svg> },
                  ].map((p, i) => <div key={i} className={p.c}>{p.s}</div>)}
                </div>
              ),
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m13.19 8.688 4.505-4.504a3 3 0 1 1 4.243 4.242l-4.504 4.505m-4.243-4.243-4.505 4.505a3 3 0 0 0 4.243 4.243l4.504-4.505m-8.747-1.414 1.414 1.414" />
                </svg>
              ),
              title: "Import Twitch & Kick Clips by URL",
              desc: "Paste a Twitch or Kick clip link and turn it into a scheduled cross-post without manual downloading or re-uploading.",
              color: "emerald",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
              ),
              title: "Multiple Accounts Per Platform",
              desc: "Connect multiple YouTube channels, TikTok accounts, or Instagram profiles and post to all of them at once.",
              color: "pink",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              ),
              title: "AI Tag Suggestions",
              desc: "Generate platform-aware hashtags in seconds based on your title, description, and target audience.",
              color: "purple",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                </svg>
              ),
              title: "Unified Comments Inbox",
              desc: "Read and reply to comments from YouTube, Instagram, Facebook, and Bluesky in one place so engagement never slips through.",
              color: "emerald",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
              ),
              title: "Smart Queue Scheduling",
              desc: "Set recurring time slots for each day of the week. Add to Queue on any upload and Clip Dash fills your next open slot automatically.",
              color: "orange",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all flex flex-col"
            >
              <div className={`inline-flex rounded-xl p-3 mb-4 ${
                f.color === "blue"   ? "bg-blue-500/10 text-blue-400" :
                f.color === "pink"   ? "bg-pink-500/10 text-pink-400" :
                f.color === "purple" ? "bg-purple-500/10 text-purple-400" :
                f.color === "orange" ? "bg-orange-500/10 text-orange-400" :
                "bg-emerald-500/10 text-emerald-400"
              }`}>
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-white/50 leading-relaxed">{f.desc}</p>
              {"extra" in f && f.extra}
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">How it works</h2>
          <p className="mt-4 text-white/40 text-lg">From upload to published in under 60 seconds.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          {[
            { step: "1", title: "Upload or import", desc: "Drop your video file or paste a Twitch/Kick clip link, then add your title, description, hashtags, and thumbnail in one place." },
            { step: "2", title: "Pick platforms and accounts", desc: "Select which platforms to post to. If you have multiple YouTube channels or TikTok accounts, choose which ones to post to — or all of them at once." },
            { step: "3", title: "Schedule and relax", desc: "Set a time, hit schedule, and walk away. No re-uploading, no re-logging in. Clip Dash posts automatically and all your comments land in one unified inbox." },
          ].map((s, i) => (
            <Fragment key={s.step}>
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-bold mb-5 ring-4 ring-[#050505]">
                  {s.step}
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-white/50 leading-relaxed">{s.desc}</p>
              </div>
              {i < 2 && (
                <div className="hidden sm:flex items-center justify-center shrink-0 w-6 text-white/25">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M3 10h14M11 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2"/>
                  </svg>
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </section>

      {/* Calendar Screenshot Showcase */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Your entire content calendar,<br className="hidden sm:block" /> across all platforms.
          </h2>
          <p className="mt-4 text-white/40 text-lg max-w-2xl mx-auto">
            Every scheduled post across YouTube, TikTok, Instagram, Facebook, LinkedIn, Bluesky, and X — visible in one view.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2 shadow-[0_0_60px_rgba(96,165,250,0.08)]">
          <img
            src="/product-calendar.png"
            alt="Clip Dash content calendar showing a full month of scheduled posts across all platforms"
            className="w-full rounded-xl"
          />
        </div>
        <div className="mt-6 flex items-center justify-center flex-wrap gap-5 text-sm text-white/45">
          {[
            { dot: "bg-red-400",  name: "YouTube" },
            { dot: "bg-white/60", name: "TikTok" },
            { dot: "bg-blue-400", name: "Facebook" },
            { dot: "bg-pink-400", name: "Instagram" },
            { dot: "bg-blue-300", name: "LinkedIn" },
            { dot: "bg-sky-400",  name: "Bluesky" },
          ].map((p) => (
            <div key={p.name} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${p.dot}`} />
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Time Savings Value Prop */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left — headline */}
            <div className="p-10 lg:p-14 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-white/[0.07]">
              <div className="inline-block rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs text-white/50 mb-6 w-fit">
                The math is simple
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                Stop spending your time<br />
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  on distribution.
                </span>
              </h2>
              <p className="mt-5 text-white/45 text-base leading-relaxed max-w-md">
                The average creator loses <strong className="text-white/70 font-medium">8–12 hours a week</strong> logging into platforms, re-uploading files, and copying captions. That's time that should go into making content — not managing it.
              </p>
              <p className="mt-3 text-white/45 text-base leading-relaxed max-w-md">
                Clip Dash compresses an entire distribution workflow into a 60-second upload session. Schedule once, publish everywhere, automatically.
              </p>
            </div>

            {/* Right — stats grid */}
            <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.07]">
              {[
                {
                  before: "30 min",
                  after: "60 sec",
                  label: "to publish across all platforms",
                  sub: "per video",
                },
                {
                  before: "6 logins",
                  after: "1 upload",
                  label: "for full cross-platform distribution",
                  sub: "every time",
                },
                {
                  before: "1 platform",
                  after: "6x reach",
                  label: "same content, more platforms, bigger audience",
                  sub: "without filming anything extra",
                },
                {
                  before: "1–2 platforms",
                  after: "All 6",
                  label: "platforms reached with one upload",
                  sub: "YouTube, TikTok, IG, FB, LinkedIn, Bluesky",
                },
              ].map((s) => (
                <div key={s.label} className="p-8 flex flex-col justify-between gap-4">
                  <div>
                    <div className="text-[1.625rem] font-semibold text-white/70 line-through mb-1">{s.before}</div>
                    <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                      {s.after}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-white/55 leading-snug">{s.label}</p>
                    <p className="text-[10px] text-white/25 mt-0.5">{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <div className="text-center mb-8">
          <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
            Pricing
          </div>
          <h2 className="mt-5 text-4xl sm:text-5xl font-bold tracking-tight">
            Friendly pricing for <span className="bg-gradient-to-r from-blue-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">creators</span>
          </h2>
          <p className="mt-4 text-white/45 text-lg max-w-2xl mx-auto">Start saving time immediately with Clip Dash.</p>
        </div>
        {/* Billing period toggle */}
        <div className="flex flex-col items-center gap-4 mb-10">
          <div className="flex rounded-full border border-white/10 bg-black/30 p-1 text-sm backdrop-blur">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`rounded-full px-4 py-2 font-medium transition-all ${billingPeriod === "monthly" ? "bg-white text-black shadow-[0_8px_24px_rgba(255,255,255,0.12)]" : "text-white/50 hover:text-white/80"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("annual")}
              className={`rounded-full px-4 py-2 font-medium transition-all ${billingPeriod === "annual" ? "bg-gradient-to-r from-blue-300 via-violet-300 to-fuchsia-300 text-black shadow-[0_10px_30px_rgba(167,139,250,0.25)]" : "text-white/50 hover:text-white/80"}`}
            >
              Yearly <span className={`ml-1 text-xs font-bold ${billingPeriod === "annual" ? "text-black/70" : "text-emerald-400"}`}>Save 17%</span>
            </button>
          </div>
          <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "7-day free trial" },
              { label: "Cancel anytime" },
              { label: "Unlimited scheduling on both plans" },
            ].map((item) => (
              <div
                key={item.label}
                className="group relative flex min-h-[88px] items-center justify-center overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.015))] px-6 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur"
              >
                <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_52%)] opacity-80" />
                <div className="relative z-10 flex h-full w-full items-center justify-center">
                  <span className="max-w-[18ch] text-base font-medium leading-6 text-white/78">
                    {item.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Creator */}
          <div className="rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-[#18284f] via-[#1f1740] to-[#120c22] p-6 sm:p-7 flex flex-col relative shadow-[0_24px_70px_rgba(59,130,246,0.12)]">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-400/12 text-blue-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 6 12h4.5l-1.5 7.5L18 12h-4.5l1.5-7.5Z" />
              </svg>
            </div>
            <div className="mt-5 inline-flex self-start rounded-full border border-blue-300/20 bg-blue-400/12 px-3 py-1 text-[11px] font-medium text-blue-200">
              For solo creators
            </div>
            <h3 className="mt-4 text-2xl font-semibold">Creator</h3>
            <p className="mt-2 text-sm leading-6 text-white/48">Best if you are posting your own videos and want one clean system for scheduling, comments, and analytics.</p>
            <div className="mt-3 mb-5">
              {billingPeriod === "annual" ? (
                <>
                  <span className="text-5xl font-bold">$8.17</span>
                  <span className="text-white/40 text-sm ml-1">/month</span>
                  <div className="text-xs text-white/40 mt-1">$98 billed yearly · Save $22</div>
                </>
              ) : (
                <>
                  <span className="text-5xl font-bold">$9.99</span>
                  <span className="text-white/40 text-sm ml-1">/month</span>
                  <div className="text-xs text-white/40 mt-1">Billed monthly</div>
                </>
              )}
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/18 p-4 mb-5">
            <div className="text-sm font-semibold text-white">Included</div>
            <ul className="space-y-3 text-sm text-white/68 mt-4">
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Unlimited uploads &amp; scheduled posts
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                All 7 supported platforms
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Multiple accounts per platform
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                AI tag suggestions
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Unified comments inbox
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Analytics dashboard
              </li>
            </ul>
            </div>
            <div className="rounded-2xl border border-blue-300/14 bg-blue-300/8 p-4 mb-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200/85">Upgrade unlocks</div>
              <ul className="mt-3 space-y-2 text-sm text-white/60">
                {PRICING_PLANS.creator.locked.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-200/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7.875a4.125 4.125 0 1 0-8.25 0V10.5m-.75 0h9a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18v-6a1.5 1.5 0 0 1 1.5-1.5Z" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <a
              href="/login"
              className="block text-center rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
            >
              {billingPeriod === "annual" ? "Start free — 7 days, then $98/yr" : "Start free — 7 days, then $9.99/mo"}
            </a>
            <p className="mt-2 text-center text-xs text-white/40">No Payment Necessary To Sign Up</p>
          </div>

          {/* Team */}
          <div className="rounded-[1.75rem] border border-violet-400/30 bg-gradient-to-b from-[#23103a] via-[#24103f] to-[#170b2c] p-6 sm:p-7 flex flex-col relative shadow-[0_26px_90px_rgba(168,85,247,0.22)]">
            <div className="absolute right-4 top-4 rounded-full border border-violet-300/25 bg-violet-300/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100">
              Best value
            </div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/14 text-violet-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m4-2a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
              </svg>
            </div>
            <div className="mt-5 inline-flex self-start rounded-full border border-violet-300/25 bg-violet-400/14 px-3 py-1 text-[11px] font-medium text-violet-100">
              For editors, brands, and teams
            </div>
            <h3 className="mt-4 text-2xl font-semibold">Team</h3>
            <p className="mt-2 text-sm leading-6 text-white/48">Built for shared workflows when more than one person needs access to uploads, scheduling, comments, and AI Clips.</p>
            <div className="mt-3 mb-5">
              {billingPeriod === "annual" ? (
                <>
                  <span className="text-5xl font-bold">$16.58</span>
                  <span className="text-white/40 text-sm ml-1">/month</span>
                  <div className="text-xs text-white/40 mt-1">$199 billed yearly · Save $41</div>
                </>
              ) : (
                <>
                  <span className="text-5xl font-bold">$19.99</span>
                  <span className="text-white/40 text-sm ml-1">/month</span>
                  <div className="text-xs text-white/40 mt-1">Billed monthly</div>
                </>
              )}
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/18 p-4 mb-6">
            <div className="text-sm font-semibold text-white">Included</div>
            <ul className="space-y-3 text-sm text-white/68 mt-4">
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-white/30 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Everything in Creator
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-white/30 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Up to 5 team members
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-white/30 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Shared platform connections &amp; scheduling
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-white/30 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Role-based permissions (owner, admin, member)
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-white/30 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Shared uploads library &amp; comments inbox
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-white/30 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Priority email support
              </li>
            </ul>
            </div>
            <a
              href="/login"
              className="block text-center rounded-xl bg-gradient-to-r from-violet-300 via-fuchsia-300 to-blue-300 px-6 py-3.5 text-sm font-semibold text-black hover:brightness-105 transition-colors"
            >
              {billingPeriod === "annual" ? "Start free — 7 days, then $199/yr" : "Start free — 7 days, then $19.99/mo"}
            </a>
            <p className="mt-2 text-center text-xs text-violet-100/50">No Payment Necessary To Sign Up</p>
          </div>
        </div>
      </section>

      {/* Supported Platforms */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Supported Platforms</h2>
          <p className="mt-3 text-white/40 max-w-md mx-auto">
            Post to all 7 platforms from a single upload.
          </p>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
          {[
            { key: "youtube",   name: "YouTube",   color: "text-red-400",   icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z"/></svg> },
            { key: "tiktok",    name: "TikTok",    color: "text-white",     icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg> },
            { key: "instagram", name: "Instagram", color: "text-pink-400",  icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z"/></svg> },
            { key: "facebook",  name: "Facebook",  color: "text-blue-400",  icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z"/></svg> },
            { key: "linkedin",  name: "LinkedIn",  color: "text-blue-300",  icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z"/></svg> },
            { key: "bluesky",   name: "Bluesky",   color: "text-sky-400",   icon: <svg className="w-10 h-10" viewBox="0 0 360 320" fill="currentColor"><path d="M180 142c-16.3-31.7-60.7-90.8-102-120C38 2 27.5-2 20 2 10 7.5 10 25.5 10 35V90c0 50 38 65 76 73-38 8-76 23-76 73v55c0 9.5 0 27.5 10 33 7.5 4 18 0 58-20 41.3-29.2 85.7-88.3 102-120zm0 0c16.3-31.7 60.7-90.8 102-120 40-20 50.5-24 58-20 10 5.5 10 23.5 10 33v55c0 50-38 65-76 73 38 8 76 23 76 73v55c0 9.5 0 27.5-10 33-7.5 4-18 0-58-20C240.7 230.8 196.3 171.7 180 142z"/></svg> },
            { key: "x",         name: "X",         color: "text-white",     icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/></svg> },
          ].map((p, i) => (
            <a
              key={p.key}
              href={`/platforms/${p.key}`}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
            >
              <div
                className={`animate-float ${p.color}`}
                style={{ animationDelay: `${i * 0.5}s`, animationDuration: `${3.4 + i * 0.25}s` }}
              >
                {p.icon}
              </div>
              <span className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">{p.name}</span>
            </a>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <FaqAccordion />

      {/* Final CTA */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Stop posting manually. Start growing.
        </h2>
        <p className="mt-4 text-white/40 text-lg max-w-xl mx-auto">
          Try Clip Dash free for 7 days — no credit card hassle, no charge until your trial ends. Cancel anytime.
        </p>
        <div className="mt-8">
          {loaded && (
            user ? (
              <a
                href="/dashboard"
                className="inline-block rounded-full bg-white px-8 py-3.5 text-base font-semibold text-black hover:bg-white/90 transition-colors"
              >
                Open Dashboard
              </a>
            ) : (
              <a
                href="/login"
                className="inline-block rounded-full bg-white px-8 py-3.5 text-base font-semibold text-black hover:bg-white/90 transition-colors"
              >
                Start your 7-day free trial →
              </a>
            )
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-white/30">
              &copy; {new Date().getFullYear()} Clip Dash. All rights reserved.
            </div>
            <div className="flex items-center gap-6 text-sm text-white/40">
              <a href="/dashboard" className="hover:text-white/70 transition-colors">Dashboard</a>
              <a href="/blog" className="hover:text-white/70 transition-colors">Blog</a>
              <a href="/platforms" className="hover:text-white/70 transition-colors">Platforms</a>
              <a href="/support" className="hover:text-white/70 transition-colors">Support</a>
              <a href="/terms" className="hover:text-white/70 transition-colors">Terms</a>
              <a href="/privacy" className="hover:text-white/70 transition-colors">Privacy</a>
              <a href="#pricing" className="hover:text-white/70 transition-colors">Pricing</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
