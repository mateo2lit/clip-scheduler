"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { countBlueskyGraphemes } from "@/lib/blueskyUtils";
import { X as XIcon } from "@phosphor-icons/react/dist/ssr";

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
  x: { label: "X", limit: 280 },
};

function getCount(platform: string, text: string): number {
  const cfg = TEXT_PLATFORM_LIMITS[platform];
  if (!cfg) return text.length;
  return cfg.countFn ? cfg.countFn(text) : text.length;
}

type TextPostComposerProps = {
  body: string;
  onBodyChange: (val: string) => void;
  selectedPlatforms: string[];
  linkPreview: LinkPreviewData | null;
  linkPreviewLoading: boolean;
  onLinkPreview: (data: LinkPreviewData | null) => void;
  onLinkPreviewLoadingChange: (loading: boolean) => void;
  platformDescOverrides: Record<string, string>;
  accessToken: string | null;
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
        <XIcon className="h-3.5 w-3.5" weight="bold" />
      </button>
    </div>
  );
}

const URL_REGEX = /https?:\/\/[^\s\])"'>]+/;

export default function TextPostComposer({
  body,
  onBodyChange,
  selectedPlatforms,
  linkPreview,
  linkPreviewLoading,
  onLinkPreview,
  onLinkPreviewLoadingChange,
  platformDescOverrides,
  accessToken,
  textareaRef: externalTextareaRef,
}: TextPostComposerProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalTextareaRef ?? internalRef;
  const [lastDetectedUrl, setLastDetectedUrl] = useState<string | null>(null);

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

  // Counters for the active text
  const platformsToCount = selectedPlatforms.filter((p) => TEXT_PLATFORM_LIMITS[p]);

  return (
    <div className="space-y-4">
      {/* ── Composer textarea ─────────────────────────────────────────────── */}
      <div>
        <textarea
          ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Write your post…"
          rows={6}
          className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-blue-400/40 focus:bg-white/[0.05]"
        />

        {/* Per-platform character counters */}
        {platformsToCount.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {platformsToCount.map((p) => {
              const cfg = TEXT_PLATFORM_LIMITS[p];
              const text = platformDescOverrides[p] || body;
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

    </div>
  );
}
