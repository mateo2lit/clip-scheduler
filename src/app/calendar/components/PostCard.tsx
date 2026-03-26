"use client";

import { PostGroup, PROVIDER_META, STATUS_META, thumbnailUrl, formatTime } from "../types";
import { ProviderIcon } from "./ProviderIcon";

type Props = {
  group: PostGroup;
  variant: "compact" | "full";
  supabaseUrl: string;
  onClick: (group: PostGroup, rect: DOMRect) => void;
  dimmed?: boolean;
};

export function PostCard({ group, variant, supabaseUrl, onClick, dimmed }: Props) {
  const thumb = thumbnailUrl(group.thumbnail_path, supabaseUrl);
  const status = STATUS_META[group.status] ?? STATUS_META.scheduled;
  const time = formatTime(group.scheduled_for);
  const providers = [...new Set(group.posts.map(p => (p.provider || "").toLowerCase()))];

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    onClick(group, rect);
  }

  if (variant === "compact") {
    return (
      <div
        onClick={handleClick}
        className={`w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 cursor-pointer select-none bg-white/[0.06] hover:bg-white/[0.10] transition-colors text-white/80 ${dimmed ? "opacity-40" : ""}`}
      >
        <div className="w-6 h-6 rounded shrink-0 overflow-hidden bg-white/10">
          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/5" />}
        </div>
        <div className="flex items-center gap-px shrink-0">
          {providers.slice(0, 4).map((p) => (
            <span key={p} className={`w-1.5 h-1.5 rounded-full ${PROVIDER_META[p]?.dotClass ?? "bg-white/30"}`} />
          ))}
          {providers.length > 4 && <span className="text-[9px] text-white/30 ml-0.5">+{providers.length - 4}</span>}
        </div>
        <span className="flex-1 truncate text-[10px] leading-none">{group.title || "Untitled"}</span>
        <span className="text-[9px] text-white/35 shrink-0 tabular-nums">{time}</span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dotClass}`} />
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`w-full rounded-lg overflow-hidden cursor-pointer select-none bg-white/[0.06] hover:bg-white/[0.10] transition-colors border border-white/[0.08] ${dimmed ? "opacity-40" : ""}`}
    >
      <div className="relative w-full h-12 bg-white/5 overflow-hidden">
        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/10" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>
      <div className="px-2 py-1.5">
        {providers[0] && (
          <div className="flex items-center gap-1 mb-1">
            <ProviderIcon provider={providers[0]} className="w-3 h-3" />
            <span className="text-[9px] text-white/40 uppercase tracking-wide">{PROVIDER_META[providers[0]]?.label}</span>
          </div>
        )}
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
