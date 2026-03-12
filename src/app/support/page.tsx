"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type SupportTab = "faq" | "submit" | "tickets" | "articles";
type TicketType = "bug" | "question" | "billing" | "feature";
type TicketStatus = "open" | "in_progress" | "resolved";

type Ticket = {
  id: string;
  subject: string;
  type: TicketType;
  status: TicketStatus;
  description: string;
  reply_message: string | null;
  created_at: string;
  updated_at: string;
};

// ── FAQ DATA ─────────────────────────────────────────────────────────────────

const FAQ_CATEGORIES = [
  {
    category: "Getting Started",
    items: [
      {
        q: "How do I connect my social media accounts?",
        a: "Go to Settings → Connected Accounts and click the platform you want to connect. You'll be taken through an OAuth flow where you authorize Clip Dash. You can connect multiple accounts per platform — for example, two YouTube channels or two Facebook pages.",
      },
      {
        q: "What video formats and file sizes are supported?",
        a: "Clip Dash accepts MP4, MOV, and WebM files. Storage limits depend on your plan: Creator gets 25 GB of active storage, Team gets 50 GB. Per-platform limits: YouTube 256 GB, TikTok 4 GB, Instagram 1 GB, Facebook 10 GB, LinkedIn 5 GB, Bluesky 50 MB. We recommend H.264 MP4 for the broadest compatibility.",
      },
      {
        q: "How does auto-publishing work?",
        a: "A worker runs every minute on the server and picks up posts scheduled for the current time. It uses your stored OAuth credentials to publish on your behalf and sends you a confirmation email when it succeeds or fails. You don't need to be logged in or do anything — it's fully automatic.",
      },
      {
        q: "Do I need to be online when my posts publish?",
        a: "No. Publishing is entirely server-side. Once you schedule a post, Clip Dash handles everything. You can close the app, go offline, or sleep — the worker will post at the scheduled time.",
      },
    ],
  },
  {
    category: "Scheduling",
    items: [
      {
        q: "What is the Queue feature?",
        a: "The Queue lets you set recurring time slots in Settings → Queue (e.g., Monday 9am, Wednesday 6pm). When you upload a video, you can click \"Add to Queue\" instead of picking a specific time, and Clip Dash automatically assigns the next available slot.",
      },
      {
        q: "Can I post to multiple platforms simultaneously?",
        a: "Yes. On the upload page, select as many platforms and accounts as you want. Clip Dash creates a separate scheduled post per account, so all of them publish at the same time without any extra work on your end.",
      },
      {
        q: "What happens if a post fails?",
        a: "The post stays in your Scheduled list with a \"Failed\" status and shows the reason. You'll also receive an email notification. After fixing the underlying issue (e.g., reconnecting the platform), you can retry the post from the Scheduled page.",
      },
      {
        q: "Can I schedule different captions per platform?",
        a: "Yes. On the upload page, expand the per-platform settings panel for any platform. You can set a title override and description override for that specific platform. LinkedIn also has a visibility option (Public or Connections only).",
      },
    ],
  },
  {
    category: "Platforms",
    items: [
      {
        q: "Why is TikTok posting not working?",
        a: "TikTok requires Content Posting API approval for the video.publish scope. Clip Dash has been approved (March 2026). If posting is still failing, try disconnecting and reconnecting your TikTok account in Settings → Connected Accounts.",
      },
      {
        q: "Can I connect more than one account per platform?",
        a: "Yes, all platforms support multiple accounts. Connect each account separately in Settings → Connected Accounts. On the upload page, each connected account appears as a separate checkbox so you can choose exactly which ones to post to.",
      },
      {
        q: "My account shows a reconnect warning — what do I do?",
        a: "OAuth tokens expire over time: Facebook/Instagram/LinkedIn tokens last about 60 days, and some platforms revoke tokens when permissions change. Go to Settings → Connected Accounts, disconnect the affected account, and reconnect it. All future scheduled posts will use the fresh credentials.",
      },
      {
        q: "What are the video size and length limits per platform?",
        a: "TikTok: 4 GB / 10 min. Instagram: 1 GB / 15 min. YouTube: 256 GB / 12 hours. Facebook: 10 GB / 4 hours. LinkedIn: 5 GB / 15 min. Bluesky: 50 MB / 60 seconds. For short-form video we recommend staying under 60 seconds for maximum reach.",
      },
    ],
  },
  {
    category: "Billing",
    items: [
      {
        q: "What's the difference between Creator and Team plans?",
        a: "Creator ($9.99/month): 1 user, 25 GB active storage, all 6 platforms. Team ($19.99/month): multiple users sharing one workspace, 50 GB active storage, shared platform accounts so the whole team can post from the same accounts.",
      },
      {
        q: "How does storage work?",
        a: "Storage counts only active files — videos that haven't been published yet. Once all posts for an upload finish publishing, the source file is automatically deleted from storage. Storage is enforced at upload time; you'll see an error if a new file would exceed your plan limit.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Go to Settings → Subscription and click \"Manage Billing\" to open the Stripe customer portal. You can cancel there. Your subscription stays active until the end of the current billing period.",
      },
      {
        q: "Can I switch between Creator and Team plans?",
        a: "Yes, via the Stripe portal in Settings → Subscription. Upgrades take effect immediately (prorated). Downgrades take effect at the next billing cycle. Note: downgrading to Creator removes non-owner team members from the workspace.",
      },
    ],
  },
  {
    category: "Account",
    items: [
      {
        q: "How do I add team members?",
        a: "Team members are available on the Team plan only. Go to Settings → Team and enter the email address of the person you want to invite. You can assign them the Admin role (full access except billing) or Member role (can post and schedule but can't manage accounts or billing).",
      },
      {
        q: "How do I delete my account?",
        a: "Go to Settings → Danger Zone and click \"Delete Account\". You'll be asked to type \"DELETE MY ACCOUNT\" to confirm. This permanently removes your account, all your uploads, scheduled posts, connected accounts, and team data. It cannot be undone.",
      },
      {
        q: "Where is my data stored?",
        a: "Video files are stored in Supabase Storage, which runs on AWS. Source files are automatically deleted after all scheduled posts for that upload finish publishing. Account metadata and post history are retained in our database until you delete your account.",
      },
    ],
  },
];

// ── ARTICLES DATA ─────────────────────────────────────────────────────────────

const ARTICLES = [
  {
    title: "Best Times to Post on Every Platform in 2026",
    excerpt:
      "Data-backed posting windows for YouTube, TikTok, Instagram, Facebook, LinkedIn, and Bluesky.",
    readTime: "4 min read",
    content: `Platform-by-platform breakdown based on 2026 engagement data:

**TikTok:** 6–10am and 7–11pm in your audience's local timezone. Early morning catches commuters; late evening catches wind-down scrolling.

**Instagram:** Tuesday, Wednesday, and Friday between 9am–12pm. Midweek mornings consistently outperform other windows.

**YouTube:** Thursday through Saturday, 2–4pm. Viewers browse more on weekends; Thursday uploads catch the Friday-evening surge.

**Facebook:** Tuesday through Thursday, 1–3pm. Post-lunch browsing is the sweet spot for Reels discovery.

**LinkedIn:** Tuesday through Thursday, 7–9am. Professionals check LinkedIn before the workday starts.

**Bluesky:** Early mornings and evenings on any day. The platform skews toward engaged, text-first users who check in at the start and end of their day.

**Key insight:** Consistency matters more than hitting the exact optimal window. A creator who posts every Monday at 8am will outperform one who posts at "peak" times sporadically. Use Clip Dash's Queue feature to build a reliable cadence — then let the algorithm work in your favor over time.`,
  },
  {
    title: "Repurpose One Video Across 6 Platforms Without Losing Quality",
    excerpt:
      "How to adapt a single video shoot for YouTube, TikTok, Instagram Reels, Facebook, LinkedIn, and Bluesky with minimal extra editing.",
    readTime: "5 min read",
    content: `The mistake most creators make: re-filming six different versions of the same video. Here's a smarter approach.

**Start with landscape (16:9) for YouTube.** Film your main content in landscape at 1080p or 4K. This becomes your YouTube upload.

**Crop to 9:16 for vertical platforms.** TikTok, Instagram Reels, and Facebook Reels all want vertical. Use your editing tool to export a 1080×1920 crop. Most modern cameras and phones capture enough resolution that a crop looks clean.

**Trim to under 60 seconds for Bluesky.** Bluesky has a 60-second cap. Pull your strongest 60 seconds for this platform.

**Adjust captions per platform tone.** TikTok rewards casual, hook-first captions. LinkedIn rewards professional framing. Instagram sits in the middle. Use Clip Dash's per-platform description overrides to write once and customize per platform — without re-uploading.

**Upload once, customize in Clip Dash.** Upload your video to Clip Dash, then expand each platform's settings panel to paste your platform-specific caption. One upload, six tailored posts, fully scheduled.

This workflow turns a 2-hour filming session into content that runs across all six platforms for the entire week.`,
  },
  {
    title: "Content Batching: Schedule a Month of Posts in One Afternoon",
    excerpt:
      "The creator's guide to front-loading your content calendar so you never miss a posting day.",
    readTime: "6 min read",
    content: `Content batching is the practice of creating and scheduling large amounts of content in a single focused session, rather than creating day-by-day.

**The workflow:**
1. Block 3–4 hours on a Sunday afternoon.
2. Film 8–12 short clips in one session. Set up your space once, change angles between takes.
3. Do a light edit pass — cuts, captions, maybe a music track. Keep it fast.
4. Upload all videos to Clip Dash.
5. Use the Queue feature to auto-assign each video to your next available time slots.
6. Write captions for all videos in bulk while you're in the "writing" headspace.

**The result:** 30+ days of content distributed across 6 platforms, fully automated. You show up consistently online without thinking about social media during the week.

**Tips for better batching sessions:**
- Film b-roll between takes so you have variety without extra effort.
- Batch similar topics together — your brain stays in the zone.
- Create templates for recurring series (e.g., "Weekly tip #X") so you only need to write the variable part.
- Front-load your best content for the beginning of the month while your energy is high.

Creators who batch report spending 80% less mental energy on content distribution while maintaining better consistency than daily creators.`,
  },
  {
    title: "Short-Form Video Specs Cheat Sheet: Every Platform's Requirements",
    excerpt:
      "Resolution, aspect ratio, file size, and length limits for TikTok, Instagram Reels, YouTube Shorts, Facebook Reels, LinkedIn, and Bluesky.",
    readTime: "3 min read",
    content: `Quick reference for every platform Clip Dash supports:

| Platform | Resolution | Aspect Ratio | Max File Size | Max Length | Recommended |
|----------|------------|--------------|---------------|------------|-------------|
| TikTok | 1080×1920 | 9:16 | 4 GB | 10 min | 15–60 sec |
| Instagram Reels | 1080×1920 | 9:16 | 1 GB | 15 min | 15–30 sec |
| YouTube Shorts | 1080×1920 | 9:16 | 256 GB | 60 sec (Shorts badge) | Under 60 sec |
| Facebook Reels | 1080×1920 | 9:16 | 10 GB | 90 sec | 15–60 sec |
| LinkedIn | 1080×1920 or 1920×1080 | 9:16 or 16:9 | 5 GB | 15 min | Under 3 min |
| Bluesky | 1080×1920 | 9:16 | 50 MB | 60 sec | Under 60 sec |

**Format:** MP4 with H.264 video codec and AAC audio works on every platform. Avoid HEVC/H.265 for broadest compatibility.

**Bluesky note:** The 50 MB limit is strict — a 60-second video at 1080p will likely exceed this. Compress to ~720p or reduce bitrate before uploading.

**YouTube Shorts:** Videos up to 3 minutes can be uploaded, but only videos under 60 seconds receive the "Shorts" badge and Short feed placement.`,
  },
  {
    title: "Why Your TikTok Views Dropped (And How to Fix It)",
    excerpt:
      "Understanding TikTok's algorithm shifts in 2026 and what top creators are doing differently.",
    readTime: "5 min read",
    content: `TikTok's FYP algorithm has shifted significantly. Here's what's driving discovery in 2026:

**Completion rate > like count.** TikTok's ranking system now weighs video completion rate and re-watches more heavily than raw likes. A video that 1,000 people watch twice outranks a video that 10,000 people skip after 2 seconds.

**Hook in the first 2 seconds is non-negotiable.** You have one shot to stop the scroll. Open with movement, a question, a visual payoff, or a statement that demands a response. Don't open with a title card or a slow zoom.

**Captions with search keywords affect distribution.** TikTok's search engine is now a major discovery channel. Including relevant keywords in your caption (not just hashtags) improves your chances of appearing in search results.

**Consistency beats viral attempts.** 3–5 posts per week over three months outperforms sporadic high-quality posts. The algorithm rewards accounts it can predict.

**Avoid reposted watermarked content.** TikTok's systems detect watermarks from other platforms and deprioritize that content in the FYP. Always upload directly — which is exactly what Clip Dash does. When Clip Dash posts to TikTok, it uploads the original file directly via the Content Posting API, ensuring clean metadata.

**The fix if your views dropped:** Post consistently for 30 days, focus on hooks, and check your analytics for the completion rate metric. Optimize for that, not for likes.`,
  },
  {
    title: "Growing on Multiple Platforms Without Burning Out",
    excerpt:
      "A sustainable multi-platform strategy for creators who want reach without spending all day on social media.",
    readTime: "5 min read",
    content: `**The mistake:** Treating each platform as a separate full-time job — writing unique content, posting manually, tracking separately.

**The fix:** Hub-and-spoke distribution.

**How it works:**
1. Create one piece of "pillar" content per week — a well-produced short video, a tutorial, a story.
2. Upload it to Clip Dash once.
3. Let Clip Dash distribute it to all 6 platforms simultaneously.
4. Spend your "social time" engaging on your top 1–2 platforms only.

**Why it works:** Your audience on each platform discovers you organically. You don't need to manually post to TikTok AND Instagram AND YouTube AND LinkedIn. The automation handles distribution; your energy goes to community.

**How to find your top platforms:** Use Clip Dash's Analytics page after 30 days of posting. Look at which platforms drive real engagement (comments, watch time) vs. vanity views. Double down on those 1–2 platforms for engagement; let the others run on autopilot.

**Signs you're burning out on content:**
- Dreading upload days
- Posting inconsistently "because you don't have time"
- Spending more time on logistics than creation

Clip Dash was built specifically to eliminate the logistics. If you're still spending hours manually posting, you're working against the tool. Set up your Queue, batch your content, and reclaim your creative energy.`,
  },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  in_progress: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  resolved: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

const TYPE_LABELS: Record<TicketType, string> = {
  bug: "Bug Report",
  question: "Question",
  billing: "Billing",
  feature: "Feature Request",
};

// ── PAGE ──────────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [tab, setTab] = useState<SupportTab>("faq");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // FAQ accordion
  const [openItem, setOpenItem] = useState<string | null>(null);

  // Article expand
  const [openArticle, setOpenArticle] = useState<number | null>(null);

  // Submit form
  const [ticketType, setTicketType] = useState<TicketType>("question");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Tickets
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) { window.location.href = "/login"; return; }
      setSessionEmail(auth.session.user.email ?? null);
      setToken(auth.session.access_token);

      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as SupportTab | null;
      if (tabParam && ["faq", "submit", "tickets", "articles"].includes(tabParam)) {
        setTab(tabParam);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (tab === "tickets" && token) {
      loadTickets();
    }
  }, [tab, token]);

  async function loadTickets() {
    if (!token) return;
    setTicketsLoading(true);
    try {
      const res = await fetch("/api/support/tickets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok) setTickets(json.tickets ?? []);
    } catch {}
    setTicketsLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: ticketType,
          subject: ticketSubject,
          description: ticketDescription,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSubmitSuccess(true);
        setTicketSubject("");
        setTicketDescription("");
        setTicketType("question");
      } else {
        setSubmitError(json.error || "Failed to submit ticket");
      }
    } catch {
      setSubmitError("Failed to submit ticket. Please try again.");
    }
    setSubmitting(false);
  }

  const tabs: { id: SupportTab; label: string }[] = [
    { id: "faq", label: "FAQ" },
    { id: "submit", label: "Submit Ticket" },
    { id: "tickets", label: "My Tickets" },
    { id: "articles", label: "Articles" },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-gradient-to-t from-purple-500/[0.05] to-transparent blur-3xl" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-white/35 transition-colors hover:text-white/65">
              Settings
            </Link>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-10">

        {/* Page header */}
        <section className="mb-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 font-medium text-blue-300">Support</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-white/60">Help Center</span>
          </div>
          <div className="flex items-start gap-3">
            <Link
              href="/dashboard"
              className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white/70"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Support</h1>
              <p className="mt-2 text-sm text-white/60 sm:text-base">
                Browse FAQs, submit a ticket, or read creator guides.
              </p>
            </div>
          </div>
        </section>

        {/* Tab selector */}
        <div className="mb-6 flex flex-wrap gap-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-white text-black shadow-sm"
                  : "text-white/50 hover:text-white/75"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── FAQ TAB ── */}
        {tab === "faq" && (
          <div className="space-y-4">
            {FAQ_CATEGORIES.map((cat) => (
              <div key={cat.category} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.05]">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">
                    {cat.category}
                  </span>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {cat.items.map((item) => {
                    const key = `${cat.category}:${item.q}`;
                    const isOpen = openItem === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setOpenItem(isOpen ? null : key)}
                        className="w-full text-left px-5 py-4 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-sm font-medium text-white/85">{item.q}</span>
                          <svg
                            className={`mt-0.5 h-4 w-4 shrink-0 text-white/30 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        </div>
                        {isOpen && (
                          <p className="mt-3 text-sm text-white/55 leading-relaxed">{item.a}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SUBMIT TICKET TAB ── */}
        {tab === "submit" && (
          <div className="mx-auto max-w-2xl">
            {submitSuccess ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6 text-center">
                <div className="mb-3 flex justify-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10">
                    <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                </div>
                <p className="font-semibold text-white">Ticket submitted</p>
                <p className="mt-1.5 text-sm text-white/50">
                  We'll get back to you soon. Check your email for a confirmation.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    onClick={() => { setSubmitSuccess(false); setTab("tickets"); }}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white/90"
                  >
                    View my tickets
                  </button>
                  <button
                    onClick={() => setSubmitSuccess(false)}
                    className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                  >
                    Submit another
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 space-y-5">
                <h2 className="text-base font-semibold text-white">Submit a support ticket</h2>

                {submitError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">
                    {submitError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-white/50">Type</label>
                  <div className="flex flex-wrap gap-2">
                    {(["question", "bug", "billing", "feature"] as TicketType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTicketType(t)}
                        className={`rounded-full border px-4 py-2 text-sm transition-all ${
                          ticketType === t
                            ? "border-white/20 bg-white/10 text-white"
                            : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/15 hover:text-white/70"
                        }`}
                      >
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-white/50">Subject</label>
                  <input
                    type="text"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value.slice(0, 200))}
                    placeholder="Brief summary of your issue"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/20 focus:border-white/20 focus:outline-none"
                  />
                  <p className="text-right text-[11px] text-white/20">{ticketSubject.length}/200</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-white/50">Description</label>
                  <textarea
                    value={ticketDescription}
                    onChange={(e) => setTicketDescription(e.target.value.slice(0, 5000))}
                    placeholder="Describe your issue in detail. Include steps to reproduce if it's a bug."
                    rows={7}
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-white/20 focus:border-white/20 focus:outline-none"
                  />
                  <p className="text-right text-[11px] text-white/20">{ticketDescription.length}/5000</p>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !ticketSubject.trim() || !ticketDescription.trim()}
                  className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Submitting…" : "Submit ticket"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── MY TICKETS TAB ── */}
        {tab === "tickets" && (
          <div>
            {ticketsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-5 w-16 animate-pulse rounded-full bg-white/[0.06]" />
                      <div className="h-5 w-20 animate-pulse rounded-full bg-white/[0.04]" />
                    </div>
                    <div className="h-4 w-64 animate-pulse rounded bg-white/[0.06]" />
                    <div className="mt-2 h-3 w-32 animate-pulse rounded bg-white/[0.03]" />
                  </div>
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-16 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  <svg className="h-5 w-5 text-white/30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                  </svg>
                </div>
                <p className="font-semibold text-white">No tickets yet</p>
                <p className="mt-1.5 max-w-xs text-sm text-white/40">
                  Submit a ticket if you have a question, found a bug, or need billing help.
                </p>
                <button
                  onClick={() => setTab("submit")}
                  className="mt-5 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/80"
                >
                  Submit a ticket
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {tickets.map((ticket) => {
                  const isExpanded = expandedTicket === ticket.id;
                  return (
                    <div
                      key={ticket.id}
                      className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 hover:border-white/[0.12] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[ticket.status]}`}>
                            {STATUS_LABELS[ticket.status]}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-white/40">
                            {TYPE_LABELS[ticket.type]}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-white/25">{formatDate(ticket.created_at)}</span>
                      </div>

                      <p className="mt-2 text-sm font-medium text-white/90">{ticket.subject}</p>

                      <button
                        onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                        className="mt-2 text-xs text-white/35 hover:text-white/55 transition-colors"
                      >
                        {isExpanded ? "Hide details" : "Show details"}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          <p className="text-sm text-white/50 leading-relaxed whitespace-pre-wrap">
                            {ticket.description}
                          </p>
                          {ticket.reply_message && (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/70 mb-1.5">Reply from support</p>
                              <p className="text-sm text-emerald-200/80 leading-relaxed whitespace-pre-wrap">
                                {ticket.reply_message}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ARTICLES TAB ── */}
        {tab === "articles" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {ARTICLES.map((article, idx) => {
              const isOpen = openArticle === idx;
              return (
                <div
                  key={idx}
                  onClick={() => setOpenArticle(isOpen ? null : idx)}
                  className={`rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 cursor-pointer transition-all hover:border-white/[0.12] hover:bg-white/[0.035] ${isOpen ? "sm:col-span-2" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40 mb-2">
                        {String(idx + 1).padStart(2, "0")}
                      </div>
                      <p className="text-sm font-semibold text-white/90 leading-snug">{article.title}</p>
                      <p className="mt-1 text-xs text-white/45 leading-relaxed">{article.excerpt}</p>
                      <p className="mt-2 text-[11px] text-white/25">{article.readTime}</p>
                    </div>
                    <svg
                      className={`mt-1 h-4 w-4 shrink-0 text-white/25 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>

                  {isOpen && (
                    <div className="mt-4 border-t border-white/[0.05] pt-4">
                      <div className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
                        {article.content}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
