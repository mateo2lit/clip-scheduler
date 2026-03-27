"use client";

import { useEffect, useRef } from "react";
import { PostGroup, formatTime, thumbnailUrl } from "../types";
import { ProviderIcon } from "./ProviderIcon";

type Props = {
  groups: PostGroup[];
  anchorRect: DOMRect;
  supabaseUrl: string;
  onCardClick: (group: PostGroup, rect: DOMRect) => void;
  onClose: () => void;
};

export function DayOverflowPanel({ groups, anchorRect, supabaseUrl, onCardClick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const style: React.CSSProperties = {
    position: "fixed",
    top: Math.min(anchorRect.bottom + 4, window.innerHeight - 300),
    left: Math.max(4, Math.min(anchorRect.left, window.innerWidth - 240)),
    width: 232,
    zIndex: 50,
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onOutside); };
  }, [onClose]);

  function handleRowClick(e: React.MouseEvent, group: PostGroup) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onClose();
    setTimeout(() => onCardClick(group, rect), 0);
  }

  return (
    <div ref={ref} style={style} className="rounded-2xl border border-white/[0.10] bg-[#0f0f0f] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-xs text-white/40 font-medium">{groups.length} posts</span>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
        {groups.map(group => {
          const providers = [...new Set(group.posts.map(p => (p.provider || "").toLowerCase()))];
          const thumb = thumbnailUrl(group.thumbnail_path, supabaseUrl);
          return (
            <button key={group.groupId} onClick={e => handleRowClick(e, group)} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
              <div className="w-7 h-7 rounded shrink-0 overflow-hidden bg-white/10">
                {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/80 truncate">{group.title || "Untitled"}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {providers.slice(0, 3).map(p => <ProviderIcon key={p} provider={p} className="w-3 h-3" />)}
                  <span className="text-[9px] text-white/30 ml-0.5">{formatTime(group.scheduled_for)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
