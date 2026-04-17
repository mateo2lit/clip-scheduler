"use client";

import { useEffect, useRef, useState } from "react";
import { PostGroup, PROVIDER_META, STATUS_META, thumbnailUrl, formatTime } from "../types";
import { ProviderIcon } from "./ProviderIcon";
import { X as XIcon } from "@phosphor-icons/react/dist/ssr";

type Props = {
  group: PostGroup;
  anchorRect: DOMRect;
  supabaseUrl: string;
  token: string;
  onClose: () => void;
  onRescheduled: (groupId: string, newIso: string) => void;
  onCancelled: (groupId: string) => void;
  onRetried: (groupId: string) => void;
};

export function PostPopover({ group, anchorRect, supabaseUrl, token, onClose, onRescheduled, onCancelled, onRetried }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDateTime, setNewDateTime] = useState(() => {
    const d = new Date(group.scheduled_for);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [loading, setLoading] = useState(false);

  const thumb = thumbnailUrl(group.thumbnail_path, supabaseUrl);
  const status = STATUS_META[group.status] ?? STATUS_META.scheduled;
  const providers = [...new Set(group.posts.map(p => (p.provider || "").toLowerCase()))];

  const style: React.CSSProperties = {
    position: "fixed",
    top: Math.min(anchorRect.top, window.innerHeight - 360),
    left: Math.min(anchorRect.right + 8, window.innerWidth - 280),
    width: 268,
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

  async function handleReschedule() {
    if (!newDateTime) return;
    setLoading(true);
    const iso = new Date(newDateTime).toISOString();
    const res = await fetch("/api/scheduled-posts/reschedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ groupId: group.groupId, scheduledFor: iso }),
    });
    setLoading(false);
    if (res.ok) { onRescheduled(group.groupId, iso); onClose(); }
  }

  async function handleCancel() {
    if (!confirm("Cancel this scheduled post?")) return;
    setLoading(true);
    const scheduledPosts = group.posts.filter(p => p.status === "scheduled");
    const results = await Promise.all(
      scheduledPosts.map(post =>
        fetch(`/api/scheduled-posts/${post.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).then(res => ({ postId: post.id, ok: res.ok, status: res.status }))
      )
    );
    setLoading(false);
    const anyNotScheduled = results.some(r => r.status === 409);
    if (anyNotScheduled) {
      alert("One or more posts were no longer scheduled. The calendar will update on next refresh.");
    }
    onCancelled(group.groupId);
    onClose();
  }

  async function handleRetry() {
    setLoading(true);
    for (const post of group.posts) {
      if (post.status !== "failed") continue;
      await fetch(`/api/scheduled-posts/${post.id}/retry`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    setLoading(false);
    onRetried(group.groupId);
    onClose();
  }

  return (
    <div ref={ref} style={style} className="rounded-2xl border border-white/[0.10] bg-[#0f0f0f] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
      <div className="relative h-20 w-full bg-white/5 overflow-hidden">
        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/10" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <button onClick={onClose} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white/60 hover:text-white transition-colors">
          <XIcon className="w-3 h-3" weight="bold" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white leading-snug">{group.title || "Untitled"}</h3>
        <div className="flex flex-wrap gap-1.5">
          {providers.map(p => (
            <span key={p} className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60">
              <ProviderIcon provider={p} className="w-2.5 h-2.5" />
              {PROVIDER_META[p]?.label}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">
            {new Date(group.scheduled_for).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {formatTime(group.scheduled_for)}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${status.badgeClass}`}>{status.label}</span>
        </div>
        <div className="border-t border-white/[0.06] pt-3 space-y-2">
          {group.status === "scheduled" && (
            <>
              {rescheduling ? (
                <div className="space-y-2">
                  <input type="datetime-local" value={newDateTime} onChange={e => setNewDateTime(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white [color-scheme:dark]" />
                  <div className="flex gap-2">
                    <button onClick={handleReschedule} disabled={loading} className="flex-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-400 disabled:opacity-50 transition-colors">{loading ? "Saving…" : "Confirm"}</button>
                    <button onClick={() => setRescheduling(false)} className="flex-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setRescheduling(true)} className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.08] transition-colors text-left">Reschedule</button>
              )}
              <button onClick={handleCancel} disabled={loading} className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors text-left disabled:opacity-50">Cancel post</button>
            </>
          )}
          {group.status === "failed" && (
            <>
              <button onClick={handleRetry} disabled={loading} className="w-full rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-400 disabled:opacity-50 transition-colors">{loading ? "Retrying…" : "Retry"}</button>
              <a href="/settings?tab=connections" className="block w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/[0.04] transition-colors text-center">Reconnect account</a>
            </>
          )}
          {group.status === "posted" && (
            <a href="/posted" className="block w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/[0.04] transition-colors text-center">View on Posted page →</a>
          )}
          {group.status === "ig_processing" && (
            <p className="text-xs text-amber-300/70 text-center py-1">Processing on Instagram…</p>
          )}
        </div>
      </div>
    </div>
  );
}
