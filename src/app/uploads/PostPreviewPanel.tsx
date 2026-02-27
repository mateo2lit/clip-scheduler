"use client";

import { useEffect, useState } from "react";

type PostPreviewPanelProps = {
  selectedPlatforms: string[];
  title: string;
  description: string;
  hashtags: string[];
  videoPreviewUrl: string | null;
  thumbnailPreview: string | null;
  platformAccounts: Record<string, { profileName: string | null; avatarUrl: string | null }>;
  ttNickname: string | null;
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

function PlatformIcon({ platform, className = "w-4 h-4" }: { platform: string; className?: string }) {
  if (platform === "youtube")
    return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>;
  if (platform === "tiktok")
    return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" /></svg>;
  if (platform === "instagram")
    return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>;
  if (platform === "facebook")
    return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>;
  if (platform === "linkedin")
    return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>;
  return null;
}

function Avatar({ name, avatarUrl, size = "md" }: { name: string | null; avatarUrl: string | null; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-7 h-7 text-[11px]", md: "w-9 h-9 text-sm", lg: "w-11 h-11 text-base" };
  const initial = (name || "Y")[0].toUpperCase();
  if (avatarUrl)
    return <img src={avatarUrl} alt="" className={`${sizes[size]} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-semibold text-white shrink-0`}>
      {initial}
    </div>
  );
}

// ── TikTok For You Preview ────────────────────────────────────────────────────
function TikTokPreview({ title, description, hashtags, videoPreviewUrl, thumbnailPreview, profileName, avatarUrl }: {
  title: string; description: string; hashtags: string[];
  videoPreviewUrl: string | null; thumbnailPreview: string | null;
  profileName: string | null; avatarUrl: string | null;
}) {
  const handle = profileName ? `@${profileName.replace(/^@/, "")}` : "@yourhandle";
  const caption = (description || title || "Your caption will appear here…").slice(0, 100);
  const tags = hashtags.slice(0, 4).map((t) => `#${t}`).join(" ");

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl" style={{ aspectRatio: "9/16" }}>
      {/* Media background */}
      {videoPreviewUrl ? (
        <video src={videoPreviewUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
      ) : thumbnailPreview ? (
        <img src={thumbnailPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900 via-neutral-900 to-neutral-950" />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent via-40% to-black/75" />

      {/* Top nav */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="w-5" />
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-white/60">Following</span>
          <div className="flex flex-col items-center">
            <span className="text-sm font-bold text-white">For You</span>
            <div className="mt-0.5 h-0.5 w-5 rounded-full bg-white" />
          </div>
        </div>
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m21 21-4.35-4.35" />
        </svg>
      </div>

      {/* Right engagement column */}
      <div className="absolute bottom-20 right-2 z-10 flex flex-col items-center gap-3.5">
        {/* Avatar + follow */}
        <div className="relative mb-1 flex flex-col items-center">
          <Avatar name={profileName} avatarUrl={avatarUrl} size="md" />
          <div className="absolute -bottom-2 flex h-4 w-4 items-center justify-center rounded-full bg-[#fe2c55]">
            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M12 4v16M4 12h16" />
            </svg>
          </div>
        </div>
        {[
          { d: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 4.875 9 11.25 9 11.25s9-6.375 9-11.25z", label: "0" },
          { d: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z", label: "0" },
          { d: "M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0z", label: "" },
          { d: "M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185z", label: "" },
        ].map(({ d, label }, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={d} />
              </svg>
            </div>
            {label && <span className="text-[10px] font-medium text-white">{label}</span>}
          </div>
        ))}
      </div>

      {/* Bottom caption bar */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-3 pr-14">
        <p className="mb-0.5 text-sm font-semibold text-white">{handle}</p>
        {caption && <p className="text-xs leading-relaxed text-white line-clamp-2">{caption}</p>}
        {tags && <p className="mt-0.5 text-[11px] text-white/80 line-clamp-1">{tags}</p>}
        <div className="mt-1.5 flex items-center gap-1.5">
          <svg className="w-3 h-3 shrink-0 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <span className="text-[10px] text-white/60">original sound · {handle}</span>
        </div>
      </div>

      {/* Empty state play icon */}
      {!videoPreviewUrl && !thumbnailPreview && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-sm">
            <svg className="ml-1 h-7 w-7 text-white/60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

// ── YouTube Card Preview ──────────────────────────────────────────────────────
function YouTubePreview({ title, thumbnailPreview, videoPreviewUrl, profileName, avatarUrl }: {
  title: string;
  thumbnailPreview: string | null; videoPreviewUrl: string | null;
  profileName: string | null; avatarUrl: string | null;
}) {
  const channel = profileName || "Your Channel";
  const displayTitle = title || "Your video title will appear here";

  return (
    <div className="overflow-hidden rounded-xl bg-[#0f0f0f] border border-white/10">
      {/* Thumbnail */}
      <div className="relative" style={{ aspectRatio: "16/9" }}>
        {thumbnailPreview ? (
          <img src={thumbnailPreview} alt="" className="h-full w-full object-cover" />
        ) : videoPreviewUrl ? (
          <video src={videoPreviewUrl} className="h-full w-full object-cover" muted />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900">
            <svg className="h-12 w-12 text-white/15" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
        )}
        <div className="absolute bottom-1.5 right-1.5 rounded bg-black/85 px-1 py-0.5 text-[10px] font-medium text-white">0:00</div>
      </div>
      {/* Meta */}
      <div className="flex gap-2.5 p-3">
        <Avatar name={profileName} avatarUrl={avatarUrl} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-white line-clamp-2">{displayTitle}</p>
          <p className="mt-1 text-xs text-white/50">{channel}</p>
          <p className="text-xs text-white/35">0 views · Just now</p>
        </div>
      </div>
    </div>
  );
}

// ── Instagram Reels Preview ───────────────────────────────────────────────────
function InstagramPreview({ title, description, hashtags, videoPreviewUrl, thumbnailPreview, profileName, avatarUrl }: {
  title: string; description: string; hashtags: string[];
  videoPreviewUrl: string | null; thumbnailPreview: string | null;
  profileName: string | null; avatarUrl: string | null;
}) {
  const handle = profileName ? `@${profileName.replace(/^@/, "")}` : "@yourhandle";
  const caption = (description || title || "Your caption will appear here…").slice(0, 80);
  const tags = hashtags.slice(0, 3).map((t) => `#${t}`).join(" ");

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl" style={{ aspectRatio: "9/16" }}>
      {videoPreviewUrl ? (
        <video src={videoPreviewUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
      ) : thumbnailPreview ? (
        <img src={thumbnailPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900 to-neutral-950" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent via-40% to-black/70" />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-3">
        <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <span className="text-sm font-bold text-white tracking-wide">Reels</span>
        <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" />
        </svg>
      </div>

      {/* Right actions */}
      <div className="absolute bottom-24 right-2.5 z-10 flex flex-col items-center gap-5">
        {[
          { d: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 4.875 9 11.25 9 11.25s9-6.375 9-11.25z" },
          { d: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" },
          { d: "M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185z" },
          { d: "M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0z" },
        ].map(({ d }, i) => (
          <svg key={i} className="h-6 w-6 text-white drop-shadow" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={d} />
          </svg>
        ))}
      </div>

      {/* Bottom info */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-3 pr-14">
        <div className="mb-1.5 flex items-center gap-2">
          <Avatar name={profileName} avatarUrl={avatarUrl} size="sm" />
          <span className="text-sm font-semibold text-white">{handle}</span>
          <span className="rounded border border-white/50 px-1.5 py-0.5 text-[10px] text-white/80">Follow</span>
        </div>
        {caption && <p className="text-xs leading-relaxed text-white line-clamp-2">{caption}</p>}
        {tags && <p className="mt-0.5 text-[11px] text-white/70">{tags}</p>}
        <div className="mt-1.5 flex items-center gap-1.5">
          <svg className="h-3 w-3 shrink-0 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <span className="text-[10px] text-white/60">Original audio · {handle}</span>
        </div>
      </div>
    </div>
  );
}

// ── Facebook Post Preview ─────────────────────────────────────────────────────
function FacebookPreview({ title, description, thumbnailPreview, videoPreviewUrl, profileName, avatarUrl }: {
  title: string; description: string;
  thumbnailPreview: string | null; videoPreviewUrl: string | null;
  profileName: string | null; avatarUrl: string | null;
}) {
  const name = profileName || "Your Page";
  const caption = description || title || "";

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#18191a]">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar name={profileName} avatarUrl={avatarUrl} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{name}</p>
          <div className="flex items-center gap-1 text-xs text-white/40">
            <span>Just now ·</span>
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z" />
            </svg>
          </div>
        </div>
        <svg className="h-4 w-4 text-white/30 shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
        </svg>
      </div>
      {caption && <p className="px-3 pb-2 text-sm text-white/75 line-clamp-3">{caption}</p>}
      <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
        {thumbnailPreview ? (
          <img src={thumbnailPreview} alt="" className="h-full w-full object-cover" />
        ) : videoPreviewUrl ? (
          <video src={videoPreviewUrl} className="h-full w-full object-cover" muted />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
            <svg className="h-10 w-10 text-white/15" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <svg className="ml-0.5 h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>
      <div className="flex border-t border-white/5">
        {["Like", "Comment", "Share"].map((label) => (
          <button key={label} className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs text-white/40 transition-colors hover:bg-white/5">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── LinkedIn Post Preview ─────────────────────────────────────────────────────
function LinkedInPreview({ title, description, thumbnailPreview, videoPreviewUrl, profileName, avatarUrl }: {
  title: string; description: string;
  thumbnailPreview: string | null; videoPreviewUrl: string | null;
  profileName: string | null; avatarUrl: string | null;
}) {
  const name = profileName || "Your Name";
  const caption = description || title || "";

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1b1f23]">
      <div className="flex items-start gap-2.5 p-3">
        <Avatar name={profileName} avatarUrl={avatarUrl} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-white leading-tight">{name}</p>
            <span className="text-xs text-blue-400">· 1st</span>
          </div>
          <p className="text-xs text-white/40 leading-tight">Content Creator</p>
          <p className="text-xs text-white/35">Just now · 🌐</p>
        </div>
        <button className="shrink-0 rounded-full border border-blue-500/50 px-3 py-1 text-xs font-semibold text-blue-400">
          + Follow
        </button>
      </div>
      {caption && <p className="px-3 pb-2 text-sm text-white/75 line-clamp-3">{caption}</p>}
      <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
        {thumbnailPreview ? (
          <img src={thumbnailPreview} alt="" className="h-full w-full object-cover" />
        ) : videoPreviewUrl ? (
          <video src={videoPreviewUrl} className="h-full w-full object-cover" muted />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
            <svg className="h-10 w-10 text-white/15" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm ring-1 ring-white/10">
            <svg className="ml-0.5 h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>
      <div className="flex border-t border-white/5 px-1">
        {["Like", "Comment", "Repost", "Send"].map((label) => (
          <button key={label} className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] text-white/35 transition-colors hover:bg-white/5">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function PostPreviewPanel({
  selectedPlatforms,
  title,
  description,
  hashtags,
  videoPreviewUrl,
  thumbnailPreview,
  platformAccounts,
  ttNickname,
}: PostPreviewPanelProps) {
  const [activePlatform, setActivePlatform] = useState(selectedPlatforms[0] || "");

  useEffect(() => {
    if (selectedPlatforms.length === 0) {
      setActivePlatform("");
    } else if (!selectedPlatforms.includes(activePlatform)) {
      setActivePlatform(selectedPlatforms[0]);
    }
  }, [selectedPlatforms, activePlatform]);

  const accts = platformAccounts || {};

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Post Preview</h3>
          <p className="mt-0.5 text-xs text-white/40">How your post will appear on each platform</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-[10px] font-semibold tracking-wide text-emerald-400">LIVE</span>
        </div>
      </div>

      {selectedPlatforms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <svg className="h-5 w-5 text-white/25" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
            </svg>
          </div>
          <p className="text-sm text-white/35">Select a platform above to preview your post</p>
        </div>
      ) : (
        <>
          {/* Platform tabs */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {selectedPlatforms.map((p) => (
              <button
                key={p}
                onClick={() => setActivePlatform(p)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  activePlatform === p
                    ? "border-white/25 bg-white/15 text-white shadow-sm"
                    : "border-white/10 bg-white/5 text-white/45 hover:border-white/20 hover:bg-white/10 hover:text-white/70"
                }`}
              >
                <PlatformIcon platform={p} className="h-3.5 w-3.5" />
                {PLATFORM_LABELS[p] || p}
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="w-full">
            {activePlatform === "tiktok" && (
              <TikTokPreview
                title={title} description={description} hashtags={hashtags}
                videoPreviewUrl={videoPreviewUrl} thumbnailPreview={thumbnailPreview}
                profileName={accts.tiktok?.profileName || ttNickname}
                avatarUrl={accts.tiktok?.avatarUrl || null}
              />
            )}
            {activePlatform === "youtube" && (
              <YouTubePreview
                title={title}
                thumbnailPreview={thumbnailPreview} videoPreviewUrl={videoPreviewUrl}
                profileName={accts.youtube?.profileName || null}
                avatarUrl={accts.youtube?.avatarUrl || null}
              />
            )}
            {activePlatform === "instagram" && (
              <InstagramPreview
                title={title} description={description} hashtags={hashtags}
                videoPreviewUrl={videoPreviewUrl} thumbnailPreview={thumbnailPreview}
                profileName={accts.instagram?.profileName || null}
                avatarUrl={accts.instagram?.avatarUrl || null}
              />
            )}
            {activePlatform === "facebook" && (
              <FacebookPreview
                title={title} description={description}
                thumbnailPreview={thumbnailPreview} videoPreviewUrl={videoPreviewUrl}
                profileName={accts.facebook?.profileName || null}
                avatarUrl={accts.facebook?.avatarUrl || null}
              />
            )}
            {activePlatform === "linkedin" && (
              <LinkedInPreview
                title={title} description={description}
                thumbnailPreview={thumbnailPreview} videoPreviewUrl={videoPreviewUrl}
                profileName={accts.linkedin?.profileName || null}
                avatarUrl={accts.linkedin?.avatarUrl || null}
              />
            )}
          </div>

          <p className="mt-3 text-center text-[10px] text-white/20">
            Preview is approximate · Actual appearance may vary
          </p>
        </>
      )}
    </div>
  );
}
