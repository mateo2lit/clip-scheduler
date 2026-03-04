import Link from "next/link";
import { notFound } from "next/navigation";

type Feature = { label: string; detail: string };

const PLATFORM_CONTENT: Record<string, { name: string; tagline: string; description: string; features: Feature[]; note?: string }> = {
  youtube: {
    name: "YouTube",
    tagline: "Videos & Shorts",
    description: "Clip Dash publishes to your YouTube channel via the YouTube Data API v3. All metadata fields supported by the API are available directly in the upload configurator.",
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
    tagline: "Short-form Video",
    description: "Clip Dash uses the TikTok Content Posting API to upload videos directly to your account. Privacy and interaction settings are pulled live from your creator profile.",
    features: [
      { label: "Privacy Level", detail: "Options are dynamically loaded from your TikTok creator info: Public, Friends, Followers, or Private (Self Only)." },
      { label: "Allow Comments", detail: "Toggle whether viewers can comment on the post." },
      { label: "Allow Duet", detail: "Enable or disable the Duet feature for this video." },
      { label: "Allow Stitch", detail: "Enable or disable the Stitch feature for this video." },
      { label: "Commercial Disclosure", detail: "Required by TikTok for promotional content. Includes Promotional Content (Your Own Brand) and Paid Partnership options." },
      { label: "AI-Generated Content", detail: "Flag the video as AI-generated per TikTok's disclosure requirements." },
      { label: "Music Usage Confirmation", detail: "Confirm you have the rights to use any music in the video as required by TikTok." },
    ],
    note: "TikTok requires app review and approval for the video.publish scope. Your app must be approved on the TikTok Developer Portal before posts go live.",
  },
  instagram: {
    name: "Instagram",
    tagline: "Reels & Stories",
    description: "Instagram publishing uses the Instagram Graph API and requires a Business or Creator account. Publishing is asynchronous — Instagram processes the video in the background (1–5 minutes) before it goes live.",
    features: [
      { label: "Post Type", detail: "Choose between Reel (standard video post) or Story (disappears after 24 hours)." },
      { label: "First Comment", detail: "Add a pre-written first comment (great for hashtags) that posts immediately after the video goes live." },
      { label: "Async Publishing", detail: "Instagram requires a two-phase publish: Clip Dash creates a media container, then polls until Instagram finishes processing before publishing." },
    ],
    note: "Only Instagram Business and Creator accounts are supported. Personal accounts cannot use the Content Publishing API.",
  },
  facebook: {
    name: "Facebook",
    tagline: "Page Videos",
    description: "Clip Dash posts videos to your connected Facebook Page via the Facebook Graph API. You must be an admin of the Page and have it connected in Settings.",
    features: [
      { label: "Page Publishing", detail: "Videos are posted to your Facebook Page (not your personal profile)." },
      { label: "Title & Description", detail: "The global title and description are used as the video title and description on Facebook." },
      { label: "Thumbnail", detail: "Upload a custom thumbnail to display before the video plays." },
    ],
  },
  linkedin: {
    name: "LinkedIn",
    tagline: "Professional Video",
    description: "Clip Dash uploads videos to your LinkedIn profile via the LinkedIn API. The title and description are combined as commentary on the post.",
    features: [
      { label: "Video Post", detail: "Videos are uploaded as native LinkedIn video posts on your personal profile." },
      { label: "Commentary", detail: "The post title and description are sent as the post text accompanying the video." },
      { label: "Thumbnail", detail: "A custom thumbnail can be uploaded alongside the video." },
    ],
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

      <div className="mx-auto max-w-3xl px-6 py-20">
        <Link href="/platforms" className="inline-flex items-center gap-1 text-sm text-white/40 hover:text-white/70 transition-colors mb-10">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All platforms
        </Link>

        <div className="mb-3 inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
          {content.tagline}
        </div>
        <h1 className="text-4xl font-bold tracking-tight">{content.name}</h1>
        <p className="mt-5 text-base text-white/55 leading-relaxed max-w-2xl">{content.description}</p>

        {content.note && (
          <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-200/80">
            <span className="font-medium">Note: </span>{content.note}
          </div>
        )}

        <div className="mt-12">
          <h2 className="text-xl font-semibold mb-5">Supported Settings</h2>
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
