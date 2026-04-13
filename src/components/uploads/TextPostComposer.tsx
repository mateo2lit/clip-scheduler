"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { countBlueskyGraphemes } from "@/lib/blueskyUpload";

export type LinkPreviewData = {
  url: string;
  title: string;
  description: string;
  image: string | null;
  domain: string;
};

export type SavedHashtagGroup = {
  id: string;
  name: string;
  hashtags: string[];
};

const TEXT_PLATFORM_LIMITS: Record<string, { label: string; limit: number; countFn?: (t: string) => number }> = {
  linkedin: { label: "LinkedIn", limit: 3000 },
  facebook: { label: "Facebook", limit: 63206 },
  threads: { label: "Threads", limit: 500 },
  bluesky: { label: "Bluesky", limit: 300, countFn: countBlueskyGraphemes },
};

function getCount(platform: string, text: string): number {
  const cfg = TEXT_PLATFORM_LIMITS[platform];
  if (!cfg) return text.length;
  return cfg.countFn ? cfg.countFn(text) : text.length;
}

type TextPostComposerProps = {
  body: string;
  onBodyChange: (val: string) => void;
  hashtags: string[];
  onHashtagsChange: (tags: string[]) => void;
  selectedPlatforms: string[];
  linkPreview: LinkPreviewData | null;
  linkPreviewLoading: boolean;
  onLinkPreview: (data: LinkPreviewData | null) => void;
  onLinkPreviewLoadingChange: (loading: boolean) => void;
  platformDescOverrides: Record<string, string>;
  onPlatformDescOverride: (platform: string, val: string) => void;
  savedHashtagGroups: SavedHashtagGroup[];
  onSavedHashtagGroups: (groups: SavedHashtagGroup[]) => void;
  accessToken: string | null;
  // Emoji picker passthrough
  onInsertEmoji?: (emoji: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
};

function LinkPreviewCard({
  preview,
  onDismiss,
}: {
  preview: LinkPreviewData;
  onDismiss: () => void;
}) {
  return (
    <div className="relative mt-3 flex gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/30">{preview.domain}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-white/80">{preview.title}</p>
        {preview.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-white/40">{preview.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded-full p-1 text-white/30 transition-colors hover:bg-white/10 hover:text-white/70"
        aria-label="Dismiss link preview"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

const URL_REGEX = /https?:\/\/[^\s\])"'>]+/;

export default function TextPostComposer({
  body,
  onBodyChange,
  hashtags,
  onHashtagsChange,
  selectedPlatforms,
  linkPreview,
  linkPreviewLoading,
  onLinkPreview,
  onLinkPreviewLoadingChange,
  platformDescOverrides,
  onPlatformDescOverride,
  savedHashtagGroups,
  onSavedHashtagGroups,
  accessToken,
  onInsertEmoji,
  textareaRef: externalTextareaRef,
}: TextPostComposerProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalTextareaRef ?? internalRef;
  const [activePlatformTab, setActivePlatformTab] = useState<string | null>(null);
  const [lastDetectedUrl, setLastDetectedUrl] = useState<string | null>(null);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [showSaveGroup, setShowSaveGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const groupPickerRef = useRef<HTMLDivElement>(null);

  // Close group picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (groupPickerRef.current && !groupPickerRef.current.contains(e.target as Node)) {
        setShowGroupPicker(false);
        setShowSaveGroup(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced URL detection → link preview
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedUrls = useRef<Set<string>>(new Set());

  const fetchLinkPreview = useCallback(
    async (url: string) => {
      if (dismissedUrls.current.has(url)) return;
      if (linkPreview?.url === url) return;
      onLinkPreviewLoadingChange(true);
      try {
        const res = await fetch(
          `/api/link-preview?url=${encodeURIComponent(url)}`,
          { headers: { Authorization: `Bearer ${accessToken || ""}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.title) {
            onLinkPreview({ url, title: data.title, description: data.description || "", image: data.image || null, domain: data.domain || "" });
          }
        }
      } catch {
        // Non-fatal
      } finally {
        onLinkPreviewLoadingChange(false);
      }
    },
    [accessToken, linkPreview, onLinkPreview, onLinkPreviewLoadingChange]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const match = URL_REGEX.exec(body);
      if (match) {
        const url = match[0];
        if (url !== lastDetectedUrl) {
          setLastDetectedUrl(url);
          fetchLinkPreview(url);
        }
      } else if (linkPreview) {
        // URL removed from text — clear preview
        onLinkPreview(null);
        setLastDetectedUrl(null);
      }
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [body, lastDetectedUrl, linkPreview, fetchLinkPreview, onLinkPreview]);

  // Load hashtag groups on mount
  useEffect(() => {
    if (!accessToken || savedHashtagGroups.length > 0) return;
    fetch("/api/hashtag-groups", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => { if (d.groups) onSavedHashtagGroups(d.groups); })
      .catch(() => {});
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveGroup() {
    if (!newGroupName.trim() || hashtags.length === 0 || !accessToken) return;
    setSavingGroup(true);
    try {
      const res = await fetch("/api/hashtag-groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name: newGroupName.trim(), hashtags }),
      });
      const data = await res.json();
      if (data.group) {
        onSavedHashtagGroups([data.group, ...savedHashtagGroups]);
        setNewGroupName("");
        setShowSaveGroup(false);
      }
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!accessToken) return;
    await fetch(`/api/hashtag-groups?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    onSavedHashtagGroups(savedHashtagGroups.filter((g) => g.id !== id));
  }

  function applyGroup(group: SavedHashtagGroup) {
    const existing = new Set(hashtags);
    const added = group.hashtags.filter((t) => !existing.has(t));
    if (added.length > 0) onHashtagsChange([...hashtags, ...added]);
    setShowGroupPicker(false);
  }

  const activeText =
    activePlatformTab && activePlatformTab !== "__base"
      ? platformDescOverrides[activePlatformTab] ?? body
      : body;

  const isOverrideTab = activePlatformTab && activePlatformTab !== "__base";

  // Counters for the active text
  const platformsToCount = selectedPlatforms.filter((p) => TEXT_PLATFORM_LIMITS[p]);

  return (
    <div className="space-y-4">
      {/* ── Platform tabs for per-platform customization ─────────────────── */}
      {selectedPlatforms.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActivePlatformTab("__base")}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
              !activePlatformTab || activePlatformTab === "__base"
                ? "border-blue-400/50 bg-blue-400/15 text-blue-200"
                : "border-white/10 bg-white/5 text-white/50 hover:border-blue-300/20 hover:text-white/80"
            }`}
          >
            Base text
          </button>
          {selectedPlatforms
            .filter((p) => TEXT_PLATFORM_LIMITS[p])
            .map((p) => {
              const cfg = TEXT_PLATFORM_LIMITS[p];
              const text = platformDescOverrides[p] ?? body;
              const count = getCount(p, text);
              const isOver = count > cfg.limit;
              const isCustomised = !!platformDescOverrides[p] && platformDescOverrides[p] !== body;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActivePlatformTab(p)}
                  className={`relative flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    activePlatformTab === p
                      ? "border-blue-400/50 bg-blue-400/15 text-blue-200"
                      : "border-white/10 bg-white/5 text-white/50 hover:border-blue-300/20 hover:text-white/80"
                  } ${isOver ? "!border-red-500/40 !text-red-400" : ""}`}
                >
                  {cfg.label}
                  {isCustomised && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Custom text" />
                  )}
                  {isOver && (
                    <span className="text-[10px] text-red-400">{count}/{cfg.limit}</span>
                  )}
                </button>
              );
            })}
        </div>
      )}

      {/* ── Composer textarea ─────────────────────────────────────────────── */}
      <div>
        {isOverrideTab && (
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-white/40">
              Custom text for <span className="font-medium text-white/60">{TEXT_PLATFORM_LIMITS[activePlatformTab!]?.label}</span>. Overrides the base text.
            </p>
            {platformDescOverrides[activePlatformTab!] !== undefined && (
              <button
                type="button"
                onClick={() => {
                  const next = { ...platformDescOverrides };
                  delete next[activePlatformTab!];
                  onPlatformDescOverride(activePlatformTab!, "");
                  // Signal deletion by passing empty string; caller should strip empties
                }}
                className="text-xs text-white/30 hover:text-red-400 transition-colors"
              >
                Reset to base
              </button>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
          value={isOverrideTab ? (platformDescOverrides[activePlatformTab!] ?? body) : body}
          onChange={(e) => {
            if (isOverrideTab) {
              onPlatformDescOverride(activePlatformTab!, e.target.value);
            } else {
              onBodyChange(e.target.value);
            }
          }}
          placeholder={
            isOverrideTab
              ? `Custom text for ${TEXT_PLATFORM_LIMITS[activePlatformTab!]?.label}…`
              : "Write your post…"
          }
          rows={6}
          className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-blue-400/40 focus:bg-white/[0.05]"
        />

        {/* Per-platform character counters */}
        {platformsToCount.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {platformsToCount.map((p) => {
              const cfg = TEXT_PLATFORM_LIMITS[p];
              const text = isOverrideTab && activePlatformTab === p
                ? (platformDescOverrides[p] ?? body)
                : body;
              const count = getCount(p, text);
              const pct = count / cfg.limit;
              const isOver = count > cfg.limit;
              const isWarning = pct > 0.85 && !isOver;
              return (
                <span
                  key={p}
                  className={`text-[11px] font-medium tabular-nums ${
                    isOver
                      ? "text-red-400"
                      : isWarning
                      ? "text-amber-400"
                      : "text-white/35"
                  }`}
                >
                  {cfg.label} {count}/{cfg.limit}
                </span>
              );
            })}
          </div>
        )}

        {/* Link preview */}
        {linkPreviewLoading && !linkPreview && (
          <div className="mt-3 flex items-center gap-2 text-xs text-white/30">
            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Fetching link preview…
          </div>
        )}
        {linkPreview && (
          <LinkPreviewCard
            preview={linkPreview}
            onDismiss={() => {
              dismissedUrls.current.add(linkPreview.url);
              onLinkPreview(null);
            }}
          />
        )}
      </div>

      {/* ── Hashtag section ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-white/50">Hashtags</p>
          <div className="flex items-center gap-2">
            {/* Hashtag group picker */}
            <div className="relative" ref={groupPickerRef}>
              <button
                type="button"
                onClick={() => { setShowGroupPicker((v) => !v); setShowSaveGroup(false); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/50 hover:bg-white/[0.07] transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                Saved groups
              </button>
              {showGroupPicker && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0e1118] shadow-[0_24px_60px_rgba(2,6,23,0.6)]">
                  {savedHashtagGroups.length === 0 && (
                    <p className="px-4 py-3 text-xs text-white/40">No saved groups yet.</p>
                  )}
                  {savedHashtagGroups.map((g) => (
                    <div key={g.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2 last:border-0 hover:bg-white/[0.05]">
                      <button
                        type="button"
                        onClick={() => applyGroup(g)}
                        className="flex-1 text-left"
                      >
                        <p className="text-sm text-white/80">{g.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-white/40">
                          {g.hashtags.map((t) => `#${t}`).join(" ")}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(g.id)}
                        className="shrink-0 rounded p-1 text-white/25 hover:bg-white/10 hover:text-red-400 transition-colors"
                        aria-label="Delete group"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {hashtags.length > 0 && (
                    <div className="border-t border-white/10 p-2">
                      {!showSaveGroup ? (
                        <button
                          type="button"
                          onClick={() => setShowSaveGroup(true)}
                          className="w-full rounded-xl py-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
                        >
                          + Save current tags as group
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && newGroupName.trim()) handleSaveGroup(); }}
                            placeholder="Group name…"
                            autoFocus
                            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-blue-300/40"
                          />
                          <button
                            type="button"
                            onClick={handleSaveGroup}
                            disabled={!newGroupName.trim() || savingGroup}
                            className="shrink-0 rounded-lg bg-blue-500/20 px-2.5 py-1.5 text-xs text-blue-300 hover:bg-blue-500/30 disabled:opacity-40 transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Current hashtags */}
        {hashtags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-xs text-blue-300"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => onHashtagsChange(hashtags.filter((t) => t !== tag))}
                  className="ml-0.5 rounded-full text-blue-400/50 hover:text-blue-300 transition-colors"
                  aria-label={`Remove #${tag}`}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/25">No hashtags added yet. Type below or apply a saved group.</p>
        )}
      </div>
    </div>
  );
}
