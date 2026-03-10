"use client";

import { useEffect, useState } from "react";
import { supabase } from "./login/supabaseClient";

const FAQ_ITEMS = [
  {
    q: "Why switch from Buffer or Hootsuite?",
    a: "Clip Dash is built specifically for video creators. It handles large file uploads (up to 2 GB), platform-specific settings like TikTok privacy levels, Instagram Reels vs. Stories, and YouTube Shorts, plus AI hashtag suggestions and multiple connected accounts per platform — things Buffer and Hootsuite don't handle well for video.",
  },
  {
    q: "What platforms do you support?",
    a: "YouTube, TikTok, Instagram (Reels & Stories), Facebook, LinkedIn, Bluesky — 6 platforms total.",
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoaded(true);
    });
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent rounded-full blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-t from-purple-500/[0.05] to-transparent rounded-full blur-3xl" />

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
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-24 pb-20 text-center">
        <div className="inline-block rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/60 mb-8">
          Multi-platform video scheduling
        </div>
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
          Upload once.{" "}
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Post everywhere.
          </span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
          Plan, publish, and grow across YouTube, TikTok, Instagram, Facebook, LinkedIn, Bluesky from one focused creator workspace.
        </p>
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
                Start Free Trial
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
        <div className="mt-14 flex items-center justify-center gap-6 text-white/30">
          {/* YouTube */}
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          {/* TikTok */}
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
          </svg>
          {/* Instagram */}
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
          </svg>
          {/* Facebook */}
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          {/* LinkedIn */}
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          {/* Bluesky */}
          <svg className="w-7 h-7" viewBox="0 0 360 320" fill="currentColor">
            <path d="M180 142c-16.3-31.7-60.7-90.8-102-120C38 2 27.5-2 20 2 10 7.5 10 25.5 10 35V90c0 50 38 65 76 73-38 8-76 23-76 73v55c0 9.5 0 27.5 10 33 7.5 4 18 0 58-20 41.3-29.2 85.7-88.3 102-120zm0 0c16.3-31.7 60.7-90.8 102-120 40-20 50.5-24 58-20 10 5.5 10 23.5 10 33v55c0 50-38 65-76 73 38 8 76 23 76 73v55c0 9.5 0 27.5-10 33-7.5 4-18 0-58-20C240.7 230.8 196.3 171.7 180 142z"/>
          </svg>
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.259 5.632L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything you need to grow</h2>
          <p className="mt-4 text-white/40 text-lg">One tool to manage your entire content pipeline.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                </svg>
              ),
              title: "7 Platforms, One Workflow",
              desc: "Auto-publish to YouTube, TikTok, Instagram, Facebook, LinkedIn, Bluesky from a single upload.",
              color: "blue",
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
              desc: "Read and reply to comments across all platforms in one place so engagement never slips through.",
              color: "emerald",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
            >
              <div className={`inline-flex rounded-xl p-3 mb-4 ${
                f.color === "blue" ? "bg-blue-500/10 text-blue-400" :
                f.color === "pink" ? "bg-pink-500/10 text-pink-400" :
                f.color === "purple" ? "bg-purple-500/10 text-purple-400" :
                "bg-emerald-500/10 text-emerald-400"
              }`}>
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-white/50 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">How it works</h2>
          <p className="mt-4 text-white/40 text-lg">Three steps. Zero headaches.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: "1", title: "Upload once", desc: "Drop your video, add a title and description, generate AI hashtag suggestions, and set a custom thumbnail — all in one place." },
            { step: "2", title: "Pick platforms and accounts", desc: "Select which platforms to post to. If you have multiple YouTube channels or TikTok accounts, choose which ones to post to — or all of them at once." },
            { step: "3", title: "Schedule and relax", desc: "Set a time, hit schedule, and Clip Dash handles the rest. Posts publish automatically and comments from every platform land in your unified inbox." },
          ].map((s) => (
            <div key={s.step} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-bold mb-5">
                {s.step}
              </div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-white/50 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 mx-auto max-w-4xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Simple, transparent pricing</h2>
          <p className="mt-4 text-white/40 text-lg">Start with a 7-day free trial. Cancel anytime.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Creator */}
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/[0.04] p-6 flex flex-col relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-0.5 text-xs font-semibold">
              Most Popular
            </div>
            <h3 className="text-lg font-semibold">Creator</h3>
            <div className="mt-3 mb-5">
              <span className="text-4xl font-bold">$9.99</span>
              <span className="text-white/40 text-sm ml-1">/month</span>
            </div>
            <ul className="space-y-3 text-sm text-white/60 mb-8 flex-1">
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Unlimited uploads &amp; scheduled posts
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                All 7 platforms
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
            <a
              href="/login"
              className="block text-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
            >
              Start 7-day free trial
            </a>
          </div>

          {/* Team */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex flex-col">
            <h3 className="text-lg font-semibold">Team</h3>
            <div className="mt-3 mb-5">
              <span className="text-4xl font-bold">$19.99</span>
              <span className="text-white/40 text-sm ml-1">/month</span>
            </div>
            <ul className="space-y-3 text-sm text-white/60 mb-8 flex-1">
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
            <a
              href="/login"
              className="block text-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors"
            >
              Start 7-day free trial
            </a>
          </div>
        </div>
      </section>

      {/* Stats / Social Proof */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {[
              { value: "7", label: "Publishing platforms" },
              { value: "∞", label: "Accounts per platform" },
              { value: "AI", label: "Tag suggestions built in" },
              { value: "24/7", label: "Automated scheduling" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  {s.value}
                </div>
                <div className="mt-2 text-sm text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Platforms */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Supported Platforms</h2>
          <p className="mt-3 text-white/40 max-w-md mx-auto">
            These are all the platforms you can post to from within Clip Dash.
          </p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
          {[
            { key: "youtube",   name: "YouTube",   color: "text-red-400",   icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z"/></svg> },
            { key: "tiktok",    name: "TikTok",    color: "text-white",     icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg> },
            { key: "instagram", name: "Instagram", color: "text-pink-400",  icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z"/></svg> },
            { key: "facebook",  name: "Facebook",  color: "text-blue-400",  icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z"/></svg> },
            { key: "linkedin",  name: "LinkedIn",  color: "text-blue-300",  icon: <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z"/></svg> },
            { key: "bluesky",   name: "Bluesky",   color: "text-sky-400",   icon: <svg className="w-10 h-10" viewBox="0 0 360 320" fill="currentColor"><path d="M180 142c-16.3-31.7-60.7-90.8-102-120C38 2 27.5-2 20 2 10 7.5 10 25.5 10 35V90c0 50 38 65 76 73-38 8-76 23-76 73v55c0 9.5 0 27.5 10 33 7.5 4 18 0 58-20 41.3-29.2 85.7-88.3 102-120zm0 0c16.3-31.7 60.7-90.8 102-120 40-20 50.5-24 58-20 10 5.5 10 23.5 10 33v55c0 50-38 65-76 73 38 8 76 23 76 73v55c0 9.5 0 27.5-10 33-7.5 4-18 0-58-20C240.7 230.8 196.3 171.7 180 142z"/></svg> },
          ].map((p) => (
            <a
              key={p.key}
              href={`/platforms/${p.key}`}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
            >
              <div className={`${p.color}`}>{p.icon}</div>
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
          Ready to grow your audience?
        </h2>
        <p className="mt-4 text-white/40 text-lg max-w-xl mx-auto">
          Replace scattered posting tools with one focused workflow built to help creators publish consistently and grow faster.
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
                Start Free Trial
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
              <a href="/platforms" className="hover:text-white/70 transition-colors">Platforms</a>
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

