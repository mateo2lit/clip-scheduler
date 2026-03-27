"use client";

import { PostGroup, PROVIDER_META, STATUS_META, thumbnailUrl, formatTime } from "../types";
import { ProviderIcon } from "./ProviderIcon";

type Props = {
  group: PostGroup;
  variant: "compact" | "week" | "full";
  supabaseUrl: string;
  onClick: (group: PostGroup, rect: DOMRect) => void;
  dimmed?: boolean;
};

const PLATFORM_BORDER: Record<string, string> = {
  youtube:   "border-red-500/70",
  tiktok:    "border-white/40",
  instagram: "border-pink-500/70",
  facebook:  "border-blue-500/70",
  linkedin:  "border-sky-500/70",
  bluesky:   "border-cyan-500/70",
  threads:   "border-zinc-400/60",
};

const PLATFORM_GRADIENT: Record<string, string> = {
  youtube:   "bg-gradient-to-br from-red-950 to-red-900/60",
  tiktok:    "bg-gradient-to-br from-zinc-900 to-zinc-800",
  instagram: "bg-gradient-to-br from-pink-950 to-purple-900/60",
  facebook:  "bg-gradient-to-br from-blue-950 to-blue-900/60",
  linkedin:  "bg-gradient-to-br from-sky-950 to-sky-900/60",
  bluesky:   "bg-gradient-to-br from-sky-950 to-cyan-900/60",
  threads:   "bg-gradient-to-br from-zinc-900 to-zinc-800",
};

function ThumbnailBox({ thumb, provider, size }: { thumb: string | null; provider: string; size: "sm" | "md" }) {
  const gradient = PLATFORM_GRADIENT[provider] ?? "bg-gradient-to-br from-zinc-900 to-zinc-800";
  const cls = size === "sm" ? "w-[22px] h-[22px]" : "w-[40px] h-[40px]";
  const iconCls = size === "sm" ? "w-2.5 h-2.5" : "w-4 h-4";
  return (
    <div className={`${cls} rounded shrink-0 overflow-hidden`}>
      {thumb
        ? <img src={thumb} alt="" className="w-full h-full object-cover" />
        : <div className={`w-full h-full flex items-center justify-center ${gradient}`}>
            <ProviderIcon provider={provider} className={iconCls} />
          </div>
      }
    </div>
  );
}

export function PostCard({ group, variant, supabaseUrl, onClick, dimmed }: Props) {
  const thumb = thumbnailUrl(group.thumbnail_path, supabaseUrl);
  const status = STATUS_META[group.status] ?? STATUS_META.scheduled;
  const time = formatTime(group.scheduled_for);
  const providers = [...new Set(group.posts.map(p => (p.provider || "").toLowerCase()))];
  const primaryProvider = providers[0] ?? "youtube";

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    onClick(group, rect);
  }

  // ── Compact (month view) ──────────────────────────────────────────────────
  if (variant === "compact") {
    return (
      <div
        onClick={handleClick}
        className={`w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 cursor-pointer select-none bg-white/[0.06] hover:bg-white/[0.10] transition-colors text-white/80 ${dimmed ? "opacity-40" : ""}`}
      >
        <ThumbnailBox thumb={thumb} provider={primaryProvider} size="sm" />
        <div className="flex items-center gap-px shrink-0">
          {providers.slice(0, 3).map(p => (
            <ProviderIcon key={p} provider={p} className="w-2.5 h-2.5" />
          ))}
          {providers.length > 3 && (
            <span className="text-[9px] text-white/30 ml-0.5">+{providers.length - 3}</span>
          )}
        </div>
        <span className="flex-1 truncate text-[10px] leading-none">{group.title || "Untitled"}</span>
        <span className="text-[9px] text-white/35 shrink-0 tabular-nums">{time}</span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dotClass}`} />
      </div>
    );
  }

  // ── Week (week view) — compact chip, Metricool-style ─────────────────────
  if (variant === "week") {
    const borderColor = PLATFORM_BORDER[primaryProvider] ?? "border-white/20";
    return (
      <div
        onClick={handleClick}
        className={`w-full h-[22px] flex items-center gap-1 rounded-sm border-l-2 ${borderColor} px-1 cursor-pointer select-none bg-white/[0.07] hover:bg-white/[0.13] transition-colors overflow-hidden ${dimmed ? "opacity-40" : ""}`}
      >
        <ProviderIcon provider={primaryProvider} className="w-2.5 h-2.5 shrink-0" />
        {providers.length > 1 && (
          <div className="flex items-center gap-px shrink-0">
            {providers.slice(1, 3).map(p => (
              <ProviderIcon key={p} provider={p} className="w-2 h-2 opacity-70" />
            ))}
            {providers.length > 3 && <span className="text-[7px] text-white/30">+{providers.length - 3}</span>}
          </div>
        )}
        <span className="flex-1 truncate text-[9px] font-medium text-white/80 leading-none">{group.title || "Untitled"}</span>
        <span className="text-[8px] text-white/40 tabular-nums shrink-0 ml-0.5">{time}</span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ml-0.5 ${status.dotClass}`} />
      </div>
    );
  }

  // ── Full (drag overlay / legacy) ──────────────────────────────────────────
  return (
    <div
      onClick={handleClick}
      className={`w-full rounded-lg overflow-hidden cursor-pointer select-none bg-white/[0.06] hover:bg-white/[0.10] transition-colors border border-white/[0.08] ${dimmed ? "opacity-40" : ""}`}
    >
      <div className="relative w-full h-12 overflow-hidden">
        {thumb
          ? <img src={thumb} alt="" className="w-full h-full object-cover" />
          : <div className={`w-full h-full flex items-center justify-center ${PLATFORM_GRADIENT[primaryProvider] ?? "bg-zinc-900"}`}>
              <ProviderIcon provider={primaryProvider} className="w-5 h-5 opacity-60" />
            </div>
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-px mb-1">
          {providers.slice(0, 4).map(p => (
            <ProviderIcon key={p} provider={p} className="w-3 h-3" />
          ))}
          {providers.length > 4 && <span className="text-[9px] text-white/30 ml-0.5">+{providers.length - 4}</span>}
        </div>
        <p className="text-[11px] font-medium text-white/85 leading-tight truncate">{group.title || "Untitled"}</p>
        {group.description && <p className="text-[10px] text-white/40 leading-tight truncate mt-0.5">{group.description}</p>}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-white/35 tabular-nums">{time}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${status.badgeClass}`}>{status.label}</span>
        </div>
      </div>
    </div>
  );
}
