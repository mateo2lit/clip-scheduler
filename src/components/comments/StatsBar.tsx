import type { EnrichedComment } from "./types";
import { platformLabels } from "./types";

export default function StatsBar({
  comments,
  unreadCount,
  lastFetchedAt,
  isRefreshing,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh,
  secondsUntilRefresh,
}: {
  comments: EnrichedComment[];
  unreadCount: number;
  lastFetchedAt: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  secondsUntilRefresh: number;
}) {
  const questionCount = comments.filter(
    (c) => c.commentType === "question" || c.commentType === "content-request"
  ).length;

  const positiveCount = comments.filter((c) => c.sentiment === "positive").length;
  const negativeCount = comments.filter((c) => c.sentiment === "negative").length;
  const neutralCount = comments.filter((c) => c.sentiment === "neutral").length;
  const positivePercent = comments.length > 0 ? Math.round((positiveCount / comments.length) * 100) : 0;
  const negativePercent = comments.length > 0 ? Math.round((negativeCount / comments.length) * 100) : 0;
  const neutralPercent = comments.length > 0 ? Math.round((neutralCount / comments.length) * 100) : 0;

  // Platform breakdown
  const platformCounts: Record<string, number> = {};
  for (const c of comments) platformCounts[c.platform] = (platformCounts[c.platform] || 0) + 1;
  const platforms = Object.entries(platformCounts).sort((a, b) => b[1] - a[1]);

  // Top commenters
  const authorCounts: Record<string, number> = {};
  for (const c of comments) authorCounts[c.authorName] = (authorCounts[c.authorName] || 0) + 1;
  const topCommenters = Object.entries(authorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const avgLikes = comments.length > 0
    ? (comments.reduce((sum, c) => sum + c.likeCount, 0) / comments.length).toFixed(1)
    : "0";

  function relativeTime(date: Date) {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  }

  return (
    <div className="mt-6 space-y-3">
      {/* Main stats row */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6 flex-wrap">
            {/* Total */}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-white/[0.06] flex items-center justify-center">
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-white/90">{comments.length}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Total</p>
              </div>
            </div>

            <div className="h-8 w-px bg-white/[0.06] hidden sm:block" />

            {/* Unread */}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-blue-400">{unreadCount}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Unread</p>
              </div>
            </div>

            <div className="h-8 w-px bg-white/[0.06] hidden sm:block" />

            {/* Questions */}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-amber-400">{questionCount}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Questions</p>
              </div>
            </div>

            <div className="h-8 w-px bg-white/[0.06] hidden sm:block" />

            {/* Avg Likes */}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-red-400">{avgLikes}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Avg Likes</p>
              </div>
            </div>
          </div>

          {/* Refresh controls */}
          <div className="flex items-center gap-2">
            {lastFetchedAt && (
              <span className="text-[11px] text-white/25">Updated {relativeTime(lastFetchedAt)}</span>
            )}

            {/* Auto-refresh toggle */}
            <button
              onClick={onToggleAutoRefresh}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                autoRefresh
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                  : "border-white/10 bg-white/[0.03] text-white/30 hover:text-white/50"
              }`}
              title={autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
              {autoRefresh ? `${secondsUntilRefresh}s` : "Auto"}
            </button>

            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-8 w-8 rounded-lg border border-white/10 bg-white/[0.03] flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all disabled:opacity-40"
              title="Refresh comments"
            >
              <svg
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Analytics row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Sentiment distribution */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">Sentiment</p>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden flex">
                {positivePercent > 0 && (
                  <div className="h-full bg-emerald-400 rounded-l-full" style={{ width: `${positivePercent}%` }} />
                )}
                {neutralPercent > 0 && (
                  <div className="h-full bg-white/20" style={{ width: `${neutralPercent}%` }} />
                )}
                {negativePercent > 0 && (
                  <div className="h-full bg-red-400 rounded-r-full" style={{ width: `${negativePercent}%` }} />
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-white/40">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {positivePercent}%
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                {neutralPercent}%
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                {negativePercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Platform breakdown */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">Platforms</p>
          <div className="mt-3 space-y-1.5">
            {platforms.slice(0, 4).map(([platform, count]) => {
              const pct = Math.round((count / comments.length) * 100);
              const barColors: Record<string, string> = {
                youtube: "bg-red-400",
                facebook: "bg-blue-400",
                instagram: "bg-pink-400",
                bluesky: "bg-sky-400",
                x: "bg-white/50",
                threads: "bg-fuchsia-400",
              };
              return (
                <div key={platform} className="flex items-center gap-2">
                  <span className="text-[11px] text-white/50 w-16 truncate">{platformLabels[platform] || platform}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className={`h-full rounded-full ${barColors[platform] || "bg-white/30"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-white/30 tabular-nums w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top commenters */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">Top Commenters</p>
          <div className="mt-3 space-y-2">
            {topCommenters.length === 0 ? (
              <p className="text-[11px] text-white/20">No data</p>
            ) : (
              topCommenters.map(([name, count], i) => (
                <div key={name} className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold tabular-nums w-4 ${i === 0 ? "text-amber-400" : "text-white/25"}`}>
                    {i + 1}
                  </span>
                  <span className="text-[11px] text-white/60 truncate flex-1">{name}</span>
                  <span className="text-[10px] text-white/30 tabular-nums">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
