import type { PlatformFilter, ReadFilter, EnrichedComment, SentimentFilter, CommentType, ArchiveFilter } from "./types";
import { platformLabels } from "./types";

export default function Sidebar({
  comments,
  filter,
  setFilter,
  readFilter,
  setReadFilter,
  readCounts,
  sentimentFilter,
  setSentimentFilter,
  commentTypeFilter,
  setCommentTypeFilter,
  archiveFilter,
  setArchiveFilter,
  flagCounts,
}: {
  comments: EnrichedComment[];
  filter: PlatformFilter;
  setFilter: (f: PlatformFilter) => void;
  readFilter: ReadFilter;
  setReadFilter: (f: ReadFilter) => void;
  readCounts: { all: number; read: number; unread: number };
  sentimentFilter: SentimentFilter;
  setSentimentFilter: (f: SentimentFilter) => void;
  commentTypeFilter: CommentType | "all";
  setCommentTypeFilter: (f: CommentType | "all") => void;
  archiveFilter: ArchiveFilter;
  setArchiveFilter: (f: ArchiveFilter) => void;
  flagCounts: { starred: number; archived: number };
}) {
  const platformCounts: Record<string, number> = {};
  for (const c of comments) {
    platformCounts[c.platform] = (platformCounts[c.platform] || 0) + 1;
  }

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
  for (const c of comments) sentimentCounts[c.sentiment]++;

  const typeCounts: Record<string, number> = {};
  for (const c of comments) {
    typeCounts[c.commentType] = (typeCounts[c.commentType] || 0) + 1;
  }

  return (
    <aside className="space-y-3 h-fit">
      {/* View: Active / Starred / Archived */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase px-1">View</p>
        <div className="mt-3 flex lg:flex-col flex-wrap gap-1.5">
          {([
            { key: "active" as ArchiveFilter, label: "Inbox", icon: "inbox", count: readCounts.all },
            { key: "starred" as ArchiveFilter, label: "Starred", icon: "star", count: flagCounts.starred },
            { key: "archived" as ArchiveFilter, label: "Archived", icon: "archive", count: flagCounts.archived },
          ]).map(({ key, label, icon, count }) => (
            <button
              key={key}
              onClick={() => setArchiveFilter(key)}
              className={`rounded-full lg:rounded-lg px-3 py-1.5 lg:py-2 text-sm font-medium border transition-all text-left flex items-center justify-between gap-2 ${
                archiveFilter === key
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
              }`}
            >
              <span className="flex items-center gap-2">
                {icon === "inbox" && (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h2.21a2.25 2.25 0 0 0 2.012-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.86M2.25 13.5V6.108c0-1.135.845-2.098 1.976-2.192a48.424 48.424 0 0 1 11.548 0c1.131.094 1.976 1.057 1.976 2.192V13.5" />
                  </svg>
                )}
                {icon === "star" && (
                  <svg className="w-3.5 h-3.5 text-amber-400/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                  </svg>
                )}
                {icon === "archive" && (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                  </svg>
                )}
                {label}
              </span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                archiveFilter === key ? "bg-white/15 text-white/70" : "bg-white/[0.06] text-white/30"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Platform Filters */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase px-1">Platforms</p>
        <div className="mt-3 flex lg:flex-col flex-wrap gap-1.5">
          {(["all", "youtube", "facebook", "instagram", "bluesky", "x"] as PlatformFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`rounded-full lg:rounded-lg px-3 py-1.5 lg:py-2 text-sm font-medium border transition-all text-left flex items-center justify-between gap-2 ${
                filter === p
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
              }`}
            >
              <span>{p === "all" ? "All" : platformLabels[p]}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                filter === p ? "bg-white/15 text-white/70" : "bg-white/[0.06] text-white/30"
              }`}>
                {p === "all" ? comments.length : platformCounts[p] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Read Status */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase px-1">Status</p>
        <div className="mt-3 flex lg:flex-col flex-wrap gap-1.5">
          {(["all", "unread", "read"] as ReadFilter[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setReadFilter(mode)}
              className={`rounded-full lg:rounded-lg px-3 py-1.5 lg:py-2 text-sm font-medium border transition-all text-left flex items-center justify-between gap-2 ${
                readFilter === mode
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
              }`}
            >
              <span className="flex items-center gap-2">
                {mode === "unread" && <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                {mode === "read" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                {mode === "all" && <span className="h-1.5 w-1.5 rounded-full bg-white/30" />}
                {mode === "unread" ? "Unread" : mode === "read" ? "Read" : "All"}
              </span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                readFilter === mode ? "bg-white/15 text-white/70" : "bg-white/[0.06] text-white/30"
              }`}>
                {mode === "unread" ? readCounts.unread : mode === "read" ? readCounts.read : readCounts.all}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Sentiment Filter */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase px-1">Sentiment</p>
        <div className="mt-3 flex lg:flex-col flex-wrap gap-1.5">
          {(["all", "positive", "negative", "neutral"] as SentimentFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setSentimentFilter(s)}
              className={`rounded-full lg:rounded-lg px-3 py-1.5 lg:py-2 text-sm font-medium border transition-all text-left flex items-center justify-between gap-2 ${
                sentimentFilter === s
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
              }`}
            >
              <span className="flex items-center gap-2">
                {s === "positive" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                {s === "negative" && <span className="h-1.5 w-1.5 rounded-full bg-red-400" />}
                {s === "neutral" && <span className="h-1.5 w-1.5 rounded-full bg-white/30" />}
                {s === "all" && <span className="h-1.5 w-1.5 rounded-full bg-white/20" />}
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
              {s !== "all" && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  sentimentFilter === s ? "bg-white/15 text-white/70" : "bg-white/[0.06] text-white/30"
                }`}>
                  {sentimentCounts[s]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Comment Type Filter */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase px-1">Type</p>
        <div className="mt-3 flex lg:flex-col flex-wrap gap-1.5">
          {(["all", "question", "content-request", "feedback", "praise"] as (CommentType | "all")[]).map((t) => {
            const labels: Record<string, string> = {
              all: "All",
              question: "Questions",
              "content-request": "Requests",
              feedback: "Feedback",
              praise: "Praise",
            };
            const dotColors: Record<string, string> = {
              question: "bg-amber-400",
              "content-request": "bg-purple-400",
              feedback: "bg-cyan-400",
              praise: "bg-emerald-400",
            };
            return (
              <button
                key={t}
                onClick={() => setCommentTypeFilter(t)}
                className={`rounded-full lg:rounded-lg px-3 py-1.5 lg:py-2 text-sm font-medium border transition-all text-left flex items-center justify-between gap-2 ${
                  commentTypeFilter === t
                    ? "bg-white/10 border-white/20 text-white"
                    : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
                }`}
              >
                <span className="flex items-center gap-2">
                  {dotColors[t] && <span className={`h-1.5 w-1.5 rounded-full ${dotColors[t]}`} />}
                  {t === "all" && <span className="h-1.5 w-1.5 rounded-full bg-white/20" />}
                  {labels[t]}
                </span>
                {t !== "all" && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                    commentTypeFilter === t ? "bg-white/15 text-white/70" : "bg-white/[0.06] text-white/30"
                  }`}>
                    {typeCounts[t] || 0}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
