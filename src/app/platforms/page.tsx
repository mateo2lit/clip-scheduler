import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";

const PLATFORMS = [
  {
    key: "youtube",
    name: "YouTube",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    tagline: "Videos & Shorts",
    stat: "2B+ logged-in users per month",
    description: "Schedule and auto-publish videos and Shorts to your YouTube channel with full control over privacy, categories, comments, and thumbnails.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
      </svg>
    ),
  },
  {
    key: "tiktok",
    name: "TikTok",
    color: "text-white",
    bg: "bg-white/10",
    border: "border-white/20",
    tagline: "Short-form Video",
    stat: "1B+ users, 95 min avg daily watch time",
    description: "Publish videos directly to your TikTok account with privacy settings, interaction controls, and commercial disclosure options.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
      </svg>
    ),
  },
  {
    key: "instagram",
    name: "Instagram",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    tagline: "Reels & Stories",
    stat: "2B+ monthly active users",
    description: "Post Reels and Stories to your Instagram Business or Creator account. Includes async publishing with first-comment support.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
      </svg>
    ),
  },
  {
    key: "facebook",
    name: "Facebook",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    tagline: "Page Videos",
    stat: "3B+ monthly active users",
    description: "Post videos to your connected Facebook Page with title, description, and thumbnail support.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
      </svg>
    ),
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    color: "text-blue-300",
    bg: "bg-blue-400/10",
    border: "border-blue-400/20",
    tagline: "Professional Video",
    stat: "1B+ members, best B2B reach",
    description: "Share video posts on your LinkedIn profile with title and description commentary for professional audiences.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z" />
      </svg>
    ),
  },
  {
    key: "bluesky",
    name: "Bluesky",
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    tagline: "Open & Decentralized",
    stat: "30M+ users, chronological feed",
    description: "Publish to Bluesky via the AT Protocol. Reach a highly engaged, creator-friendly community with no algorithm suppression and full post ownership.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 360 320" fill="currentColor">
        <path d="M180 142c-16.3-31.7-60.7-90.8-102-120C38 2 27.5-2 20 2 10 7.5 10 25.5 10 35V90c0 50 38 65 76 73-38 8-76 23-76 73v55c0 9.5 0 27.5 10 33 7.5 4 18 0 58-20 41.3-29.2 85.7-88.3 102-120zm0 0c16.3-31.7 60.7-90.8 102-120 40-20 50.5-24 58-20 10 5.5 10 23.5 10 33v55c0 50-38 65-76 73 38 8 76 23 76 73v55c0 9.5 0 27.5-10 33-7.5 4-18 0-58-20C240.7 230.8 196.3 171.7 180 142z" />
      </svg>
    ),
  },
  {
    key: "x",
    name: "X (Twitter)",
    color: "text-white",
    bg: "bg-white/10",
    border: "border-white/20",
    tagline: "Tweets & Video",
    stat: "500M+ monthly users, real-time feed",
    description: "Post videos directly to X as tweets with reply controls and per-tweet text customization. Pay-as-you-go API means no fixed monthly platform fee.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/>
      </svg>
    ),
  },
];

export default function PlatformsPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      </div>

      <nav className="border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center"><img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" /></Link>
          <Link href="/login" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Supported Platforms</h1>
          <p className="mt-5 text-lg text-white/50 max-w-2xl mx-auto">
            Upload once and publish to all seven platforms simultaneously. Every platform gets its own native settings so your content looks exactly right, everywhere.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORMS.map((p) => (
            <Link
              key={p.key}
              href={`/platforms/${p.key}`}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
            >
              <div className={`inline-flex rounded-xl p-3 mb-4 ${p.bg} ${p.color} ${p.border} border`}>
                {p.icon}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  <p className="text-xs text-white/40 mt-0.5">{p.tagline}</p>
                </div>
                <CaretRight className="w-4 h-4 text-white/30 mt-1 group-hover:text-white/60 transition-colors shrink-0" weight="bold" />
              </div>
              <p className="mt-1 text-xs font-medium text-white/30">{p.stat}</p>
              <p className="mt-3 text-sm text-white/50 leading-relaxed">{p.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-white/40 group-hover:text-white/70 transition-colors">
                Learn more
                <CaretRight className="w-4 h-4" weight="bold" />
              </span>
            </Link>
          ))}
        </div>
      </div>

      <footer className="border-t border-white/5 mt-10">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/30">
          <span>&copy; {new Date().getFullYear()} Clip Dash</span>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
            <Link href="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
