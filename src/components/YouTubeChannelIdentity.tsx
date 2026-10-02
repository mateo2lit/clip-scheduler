import type { YouTubeIdentity } from "@/lib/youtubeIdentity";

export type YouTubeIdentityDisplay = YouTubeIdentity & { verifiedAt?: string | null };

export default function YouTubeChannelIdentity({ identity }: { identity?: YouTubeIdentityDisplay | null }) {
  if (!identity || !/^UC[A-Za-z0-9_-]{22}$/.test(identity.channelId)) return null;
  const handle = identity.customUrl?.startsWith("@") ? identity.customUrl : null;
  return (
    <span className="block text-xs text-white/55 mt-1">
      {identity.verifiedAt ? `${identity.title} · ` : "YouTube channel · "}
      <a className="underline underline-offset-2 hover:text-white" href={`https://www.youtube.com/channel/${identity.channelId}`}
        target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
        {handle || "View channel"}
      </a>
    </span>
  );
}
