import Link from "next/link";
import { notFound } from "next/navigation";

type Feature = { label: string; detail: string };
type Stat = { value: string; label: string };

const PLATFORM_CONTENT: Record<string, {
  name: string;
  tagline: string;
  color: string;
  description: string;
  signupUrl: string;
  signupLabel: string;
  stats: Stat[];
  why: string[];
  features: Feature[];
  note?: string;
}> = {
  youtube: {
    name: "YouTube",
    tagline: "The World's Largest Video Platform",
    color: "from-red-500/[0.08] via-transparent to-transparent",
    description: "YouTube is the second most visited website on the internet with over 2 billion logged-in users per month. It's the top destination for long-form video content, tutorials, vlogs, gaming, and entertainment. Videos on YouTube have an indefinite shelf life — a video you post today can still drive views years from now.",
    signupUrl: "https://www.youtube.com/create_channel",
    signupLabel: "Create a YouTube Channel",
    stats: [
      { value: "2B+", label: "monthly logged-in users" },
      { value: "500hrs", label: "of video uploaded every minute" },
      { value: "#2", label: "most visited site globally" },
      { value: "70%", label: "of watch time on mobile" },
    ],
    why: [
      "YouTube has the best long-term content discovery of any platform — videos rank in Google Search and surface in YouTube recommendations for years.",
      "Monetization is built-in: once you hit 1,000 subscribers and 4,000 watch hours, you can join the YouTube Partner Program and earn ad revenue.",
      "YouTube Shorts lets you repurpose your short-form content to compete in the algorithm alongside TikTok and Instagram Reels.",
      "Subscribers receive notifications and your content appears in their feed, creating a loyal recurring audience unlike on algorithm-only platforms.",
    ],
    features: [
      { label: "Privacy", detail: "Choose Public, Unlisted, or Private for each upload." },
      { label: "Thumbnail", detail: "Upload a custom thumbnail (1280×720 recommended) that replaces the auto-generated preview." },
      { label: "Category", detail: "Select from all 14 YouTube categories including Gaming, Education, Entertainment, and more." },
      { label: "Notify Subscribers", detail: "Toggle whether subscribers receive a notification when the video goes live." },
      { label: "Allow Comments", detail: "Enable or disable the comments section on the video." },
      { label: "Allow Embedding", detail: "Control whether other sites can embed your video." },
      { label: "Made for Kids", detail: "Mark videos as made for kids per YouTube's COPPA requirements." },
      { label: "Show Like Count", detail: "Choose whether to display the public like count on the video." },
    ],
  },
  tiktok: {
    name: "TikTok",
    tagline: "The Short-Form Video Giant",
    color: "from-pink-500/[0.07] via-cyan-500/[0.04] to-transparent",
    description: "TikTok is the fastest-growing social platform in history with over 1 billion active users. Its algorithm is unmatched at surfacing content to new audiences — even a brand-new account with zero followers can go viral overnight. If you want to grow quickly, TikTok is where it happens.",
    signupUrl: "https://www.tiktok.com/signup",
    signupLabel: "Create a TikTok Account",
    stats: [
      { value: "1B+", label: "monthly active users" },
      { value: "95 min", label: "average daily watch time per user" },
      { value: "167M+", label: "videos watched every internet minute" },
      { value: "18–34", label: "largest age demographic" },
    ],
    why: [
      "TikTok's For You Page algorithm is the most powerful organic discovery engine on any platform — you don't need followers to reach millions.",
      "TikTok trends move fast: posting consistently gives you repeated opportunities to catch a trending sound or format and multiply your reach.",
      "The platform skews young (Gen Z and Millennials), making it the best place to build a young, engaged audience from scratch.",
      "TikTok Creator Fund and TikTok Shop open monetization paths once you hit 10,000 followers and 100,000 video views.",
    ],
    features: [
      { label: "Privacy Level", detail: "Options are dynamically loaded from your TikTok creator info: Public, Friends, Followers, or Private (Self Only)." },
      { label: "Allow Comments", detail: "Toggle whether viewers can comment on the post." },
      { label: "Allow Duet", detail: "Enable or disable the Duet feature for this video." },
      { label: "Allow Stitch", detail: "Enable or disable the Stitch feature for this video." },
      { label: "Commercial Disclosure", detail: "Required by TikTok for promotional content. Includes Promotional Content (Your Own Brand) and Paid Partnership options." },
      { label: "AI-Generated Content", detail: "Flag the video as AI-generated per TikTok's disclosure requirements." },
      { label: "Music Usage Confirmation", detail: "Confirm you have the rights to use any music in the video as required by TikTok." },
    ],
    note: "TikTok requires app review and approval for the video.publish scope. Clip Dash has submitted for review — once approved, all scheduled TikTok posts will publish automatically.",
  },
  instagram: {
    name: "Instagram",
    tagline: "Reels, Stories & Visual Content",
    color: "from-purple-500/[0.07] via-pink-500/[0.04] to-transparent",
    description: "Instagram has over 2 billion monthly active users and is the dominant platform for visual storytelling, lifestyle content, and brand building. Instagram Reels get the highest organic reach of any Instagram content type — they're surfaced to non-followers in the Explore tab and Reels feed.",
    signupUrl: "https://www.instagram.com/accounts/emailsignup/",
    signupLabel: "Create an Instagram Account",
    stats: [
      { value: "2B+", label: "monthly active users" },
      { value: "200M+", label: "accounts visit a business profile daily" },
      { value: "70%", label: "of shoppers use Instagram to discover products" },
      { value: "Reels", label: "get 22% more interaction than regular video" },
    ],
    why: [
      "Instagram Reels are currently prioritized in the algorithm — they reach non-followers and are the fastest way to grow an Instagram following in 2025.",
      "Instagram's shopping and brand partnership ecosystem is the most mature of any platform, making it the top choice for product-focused creators.",
      "Stories create daily touchpoints with your existing followers, keeping engagement high between major posts.",
      "Instagram and Facebook share the same Meta ecosystem, so connecting one account makes it easy to cross-post to both platforms.",
    ],
    features: [
      { label: "Post Type", detail: "Choose between Reel (standard video post) or Story (disappears after 24 hours)." },
      { label: "First Comment", detail: "Add a pre-written first comment (great for hashtags) that posts immediately after the video goes live." },
      { label: "Async Publishing", detail: "Instagram requires a two-phase publish: Clip Dash creates a media container, then polls until Instagram finishes processing before publishing." },
    ],
    note: "Only Instagram Business and Creator accounts are supported. Personal accounts cannot use the Content Publishing API. You can switch your account type for free in the Instagram app under Settings → Account → Switch to Professional Account.",
  },
  facebook: {
    name: "Facebook",
    tagline: "The World's Largest Social Network",
    color: "from-blue-500/[0.08] via-transparent to-transparent",
    description: "Facebook has over 3 billion monthly active users, making it the largest social network on the planet. While it skews older than TikTok and Instagram, Facebook's scale means even modest engagement rates translate to large absolute numbers. Facebook Pages are essential for business and brand creators.",
    signupUrl: "https://www.facebook.com/",
    signupLabel: "Create a Facebook Account",
    stats: [
      { value: "3B+", label: "monthly active users" },
      { value: "#1", label: "most used social platform worldwide" },
      { value: "1.5B+", label: "daily active users" },
      { value: "65+", label: "fastest-growing demographic on Facebook" },
    ],
    why: [
      "Facebook's sheer scale means your content can reach audiences that don't use any other platform — particularly users 35 and older.",
      "Facebook Groups are the most powerful community-building tool available: creators can build deeply engaged niche communities around their content.",
      "Facebook video gets over 8 billion views per day — native video (uploaded directly, not linked from YouTube) gets dramatically more reach.",
      "The Meta ads ecosystem lets you promote your best-performing organic posts to precisely targeted audiences when you're ready to invest in growth.",
    ],
    features: [
      { label: "Page Publishing", detail: "Videos are posted to your Facebook Page (not your personal profile)." },
      { label: "Title & Description", detail: "The global title and description are used as the video title and description on Facebook." },
      { label: "Thumbnail", detail: "Upload a custom thumbnail to display before the video plays." },
    ],
  },
  linkedin: {
    name: "LinkedIn",
    tagline: "Professional & B2B Content",
    color: "from-blue-600/[0.07] via-transparent to-transparent",
    description: "LinkedIn has over 1 billion members and is the undisputed #1 platform for professional content, B2B marketing, and thought leadership. LinkedIn video gets 5× more engagement than text posts on average. If your content targets professionals, entrepreneurs, or business audiences, LinkedIn is essential.",
    signupUrl: "https://www.linkedin.com/signup",
    signupLabel: "Create a LinkedIn Account",
    stats: [
      { value: "1B+", label: "members in 200+ countries" },
      { value: "5×", label: "more engagement for video vs. text" },
      { value: "4 in 5", label: "LinkedIn members drive business decisions" },
      { value: "$75K+", label: "average household income of users" },
    ],
    why: [
      "LinkedIn's audience is uniquely high-intent: users come to learn and do business, so professional content converts far better than on entertainment-first platforms.",
      "LinkedIn's algorithm currently rewards video heavily — native video gets more reach than any other content type on the platform.",
      "Thought leadership content compounds over time: a well-performing LinkedIn post can continue to drive profile views and follower growth for weeks.",
      "LinkedIn is the best platform for B2B creators, consultants, coaches, and anyone whose audience includes decision-makers and professionals.",
    ],
    features: [
      { label: "Video Post", detail: "Videos are uploaded as native LinkedIn video posts on your personal profile." },
      { label: "Commentary", detail: "The post title and description are sent as the post text accompanying the video." },
      { label: "Thumbnail", detail: "A custom thumbnail can be uploaded alongside the video." },
    ],
  },
  bluesky: {
    name: "Bluesky",
    tagline: "Decentralized & Creator-First Social",
    color: "from-sky-500/[0.07] via-transparent to-transparent",
    description: "Bluesky is the fastest-growing decentralized social platform built on the AT Protocol, with over 30 million users and growing rapidly. Unlike algorithmic platforms, Bluesky uses a chronological feed by default — your content is seen when it's posted, not buried by an algorithm. It's attracting a tech-savvy, creator-friendly audience.",
    signupUrl: "https://bsky.app",
    signupLabel: "Create a Bluesky Account",
    stats: [
      { value: "30M+", label: "registered users and growing fast" },
      { value: "Chrono", label: "default feed — no algorithm suppression" },
      { value: "Open", label: "protocol (AT Protocol) — you own your data" },
      { value: "2024–25", label: "fastest growing alt-social platform" },
    ],
    why: [
      "Bluesky's chronological feed means your posts reach your followers when you post them — no algorithmic gatekeeping or pay-to-play suppression.",
      "Bluesky's user base skews toward tech, journalism, and creative professionals who are actively seeking alternatives to mainstream platforms.",
      "The AT Protocol means you own your content and identity — you can migrate your account and followers to any AT Protocol server without losing your audience.",
      "Bluesky is still in a growth phase where early creators are building significant followings with relatively little competition compared to mature platforms.",
    ],
    features: [
      { label: "Video Posts", detail: "Videos are uploaded as native Bluesky video embeds using the @atproto/api SDK." },
      { label: "Caption", detail: "The post description is used as the Bluesky post text." },
      { label: "App Password Auth", detail: "Bluesky uses app passwords instead of OAuth — create one at bsky.app → Settings → App Passwords. Your main password is never stored." },
      { label: "Sync Publishing", detail: "Unlike Instagram, Bluesky posts publish synchronously — no container polling needed." },
    ],
    note: "Connect Bluesky using your handle (e.g. @you.bsky.social) and an App Password generated in your Bluesky settings. Regular account passwords are not accepted.",
  },
};

export function generateStaticParams() {
  return Object.keys(PLATFORM_CONTENT).map((key) => ({ platform: key }));
}

export default function PlatformDetailPage({ params }: { params: { platform: string } }) {
  const content = PLATFORM_CONTENT[params.platform];
  if (!content) notFound();

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className={`absolute top-0 left-1/2 h-[700px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b ${content.color} blur-3xl`} />
      </div>

      <nav className="border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight">Clip Dash</Link>
          <Link href="/login" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-20">
        <Link href="/platforms" className="inline-flex items-center gap-1 text-sm text-white/40 hover:text-white/70 transition-colors mb-10">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All platforms
        </Link>

        <h1 className="text-4xl font-bold tracking-tight">{content.name}</h1>
        <p className="mt-2 text-base text-white/40">{content.tagline}</p>
        <p className="mt-5 text-base text-white/55 leading-relaxed max-w-2xl">{content.description}</p>

        <a
          href={content.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          {content.signupLabel}
          <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {content.stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-5 text-center">
              <p className="text-2xl font-bold tracking-tight">{s.value}</p>
              <p className="mt-1 text-xs text-white/40 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Why post here */}
        <div className="mt-14">
          <h2 className="text-xl font-semibold mb-5">Why post on {content.name}?</h2>
          <div className="space-y-3">
            {content.why.map((reason, i) => (
              <div key={i} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
                <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/50 font-semibold">
                  {i + 1}
                </div>
                <p className="text-sm text-white/60 leading-relaxed">{reason}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="mt-14">
          <h2 className="text-xl font-semibold mb-5">Clip Dash Settings for {content.name}</h2>

          {content.note && (
            <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-200/80">
              <span className="font-medium">Note: </span>{content.note}
            </div>
          )}

          <div className="space-y-3">
            {content.features.map((f) => (
              <div key={f.label} className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
                <p className="text-sm font-semibold text-white">{f.label}</p>
                <p className="mt-1 text-sm text-white/50">{f.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-6 text-center">
          <p className="text-base font-semibold">Ready to schedule your first post?</p>
          <p className="mt-2 text-sm text-white/50">Connect your {content.name} account in Settings and start scheduling.</p>
          <Link
            href="/login"
            className="mt-5 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </div>

      <footer className="border-t border-white/5 mt-10">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/30">
          <span>&copy; {new Date().getFullYear()} Clip Dash</span>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
            <Link href="/platforms" className="hover:text-white/60 transition-colors">Platforms</Link>
            <Link href="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
