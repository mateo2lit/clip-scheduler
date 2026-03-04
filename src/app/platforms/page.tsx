import Link from "next/link";

const PLATFORMS = [
  {
    key: "youtube",
    name: "YouTube",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    tagline: "Videos & Shorts",
    description: "Schedule and auto-publish videos and Shorts to your YouTube channel with full control over privacy, categories, comments, and thumbnails.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
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
    description: "Post Reels and Stories to your Instagram Business or Creator account. Includes async publishing with first-comment support.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
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
    description: "Post videos to your connected Facebook Page with title, description, and thumbnail support.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
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
    description: "Share video posts on your LinkedIn profile with title and description commentary for professional audiences.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
];

export default function PlatformsPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent blur-3xl" />
      </div>

      <nav className="border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight">Clip Dash</Link>
          <Link href="/login" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Supported Platforms</h1>
          <p className="mt-5 text-lg text-white/50 max-w-xl mx-auto">
            Upload once and publish to all five platforms simultaneously, each with platform-native settings.
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
                <svg className="w-4 h-4 text-white/30 mt-1 group-hover:text-white/60 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <p className="mt-3 text-sm text-white/50 leading-relaxed">{p.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-white/40 group-hover:text-white/70 transition-colors">
                Learn more
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          ))}

          {/* Coming soon card */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-6 opacity-50">
            <div className="inline-flex rounded-xl p-3 mb-4 bg-white/5 text-white/30">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white/40">More coming soon</h2>
            <p className="mt-3 text-sm text-white/30 leading-relaxed">Threads and Bluesky support are in development. Connect your account early when they launch.</p>
          </div>
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
