import { useState } from "react";
import type { EnrichedComment, SavedReply } from "./types";
import { platformLabels, platformColors, commentTypeColors } from "./types";
import ReplyForm from "./ReplyForm";

function relativeTime(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

const sentimentDotColor: Record<string, string> = {
  positive: "bg-emerald-400",
  negative: "bg-red-400",
  neutral: "bg-white/25",
};

export default function CommentCard({
  comment,
  isRead,
  isFocused,
  isSelected,
  isStarred,
  isArchived,
  isLiked,
  bulkMode,
  compact,
  onToggleRead,
  onToggleSelect,
  onToggleStar,
  onToggleArchive,
  onLike,
  onSelect,
  onReply,
  savedReplies,
  onAddSavedReply,
  onDeleteSavedReply,
  authToken,
  sessionEmail,
}: {
  comment: EnrichedComment;
  isRead: boolean;
  isFocused: boolean;
  isSelected: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isLiked: boolean;
  bulkMode: boolean;
  compact?: boolean;
  onToggleRead: () => void;
  onToggleSelect: () => void;
  onToggleStar: () => void;
  onToggleArchive: () => void;
  onLike: () => void;
  onSelect: () => void;
  onReply: () => void;
  savedReplies: SavedReply[];
  onAddSavedReply: (label: string, text: string) => void;
  onDeleteSavedReply: (id: string) => void;
  authToken: string | null;
  sessionEmail: string | null;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replySuccess, setReplySuccess] = useState(false);
  const colors = platformColors[comment.platform];
  const typeInfo = commentTypeColors[comment.commentType];

  return (
    <div
      data-comment-card
      className={`group relative px-6 py-5 transition-all cursor-pointer ${
        isFocused ? "ring-1 ring-inset ring-blue-500/40 bg-white/[0.03]" : "hover:bg-white/[0.02]"
      } ${isSelected ? "bg-blue-500/[0.05]" : ""} ${isArchived ? "opacity-50" : ""}`}
      onClick={() => onSelect()}
    >
      {/* Unread indicator */}
      {!isRead && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2">
          <span className="block h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
        </div>
      )}

      {/* Star indicator */}
      {isStarred && (
        <div className="absolute right-2 top-3">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 0 0-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292Z" />
          </svg>
        </div>
      )}

      <div className={`grid gap-4 items-start ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_9rem]"}`}>
        <div className="flex items-start gap-3">
          {/* Bulk checkbox */}
          {bulkMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
              className={`mt-1 shrink-0 h-4 w-4 rounded border transition-all flex items-center justify-center ${
                isSelected
                  ? "bg-blue-500 border-blue-500"
                  : "border-white/20 bg-white/[0.03] hover:border-white/40"
              }`}
            >
              {isSelected && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </button>
          )}

          {/* Avatar */}
          {comment.authorImageUrl ? (
            <img src={comment.authorImageUrl} alt="" className="h-9 w-9 rounded-full shrink-0 ring-1 ring-white/10" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-white/[0.08] to-white/[0.03] flex items-center justify-center text-xs font-semibold text-white/40 shrink-0 ring-1 ring-white/10">
              {comment.authorName[0]?.toUpperCase() ?? "?"}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sentiment dot */}
              <span className={`h-1.5 w-1.5 rounded-full ${sentimentDotColor[comment.sentiment]}`} title={comment.sentiment} />

              <span className="text-sm font-medium text-white/90">{comment.authorName}</span>

              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${colors.badge}`}>
                {platformLabels[comment.platform]}
              </span>

              {/* Comment type badge */}
              {comment.commentType !== "general" && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${typeInfo.badge}`}>
                  {typeInfo.label}
                </span>
              )}

              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium border border-white/[0.06] bg-white/[0.03] text-white/40 max-w-[140px] truncate" title={comment.accountLabel}>
                {comment.accountLabel}
              </span>

              <span className="text-xs text-white/25">{relativeTime(comment.publishedAt)}</span>

              {/* Read toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleRead(); }}
                className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all opacity-0 group-hover:opacity-100 ${
                  isRead
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 opacity-100"
                    : "border-white/10 bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/[0.06]"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isRead ? "bg-emerald-300" : "bg-white/30"}`} />
                {isRead ? "Read" : "Mark read"}
              </button>
            </div>

            {/* Comment text */}
            <p className={`text-[15px] leading-relaxed text-white/80 mt-1.5 whitespace-pre-line break-words ${compact ? "line-clamp-2" : ""}`}>
              {comment.text}
            </p>

            {/* Actions row */}
            <div className="mt-3 pt-2.5 border-t border-white/[0.04] flex items-center gap-2 flex-wrap">
              {/* Like count / like button */}
              <button
                onClick={(e) => { e.stopPropagation(); onLike(); }}
                disabled={isLiked}
                className={`flex items-center gap-1 text-xs rounded-lg border px-3 py-1.5 font-medium transition-all ${
                  isLiked
                    ? "border-red-500/20 bg-red-500/10 text-red-400"
                    : "border-white/[0.06] bg-white/[0.02] text-white/30 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5"
                }`}
                title={isLiked ? "Liked" : "Like this comment"}
              >
                <svg className="w-3 h-3" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                </svg>
                {comment.likeCount > 0 && <span className="tabular-nums">{comment.likeCount + (isLiked ? 1 : 0)}</span>}
              </button>

              {/* Star */}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
                className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  isStarred
                    ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                    : "border-white/[0.06] bg-white/[0.02] text-white/30 hover:text-amber-400 hover:border-amber-500/20 hover:bg-amber-500/5"
                }`}
                title={isStarred ? "Unstar" : "Star (S)"}
              >
                <svg className="w-3 h-3" fill={isStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
              </button>

              {/* Archive */}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleArchive(); }}
                className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  isArchived
                    ? "border-white/20 bg-white/10 text-white/70"
                    : "border-white/[0.06] bg-white/[0.02] text-white/30 hover:text-white/60 hover:bg-white/[0.05]"
                }`}
                title={isArchived ? "Unarchive" : "Archive (E)"}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                </svg>
                {isArchived ? "Unarchive" : "Archive"}
              </button>

              {comment.commentUrl && (
                <a
                  href={comment.commentUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] hover:border-white/15 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  View
                </a>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setReplyOpen(!replyOpen); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] hover:border-white/15 transition-all"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                Reply
              </button>
            </div>

            {/* Reply form */}
            {replyOpen && (
              <div className="mt-3 overflow-hidden transition-all duration-200">
                <ReplyForm
                  comment={comment}
                  savedReplies={savedReplies}
                  onAddSavedReply={onAddSavedReply}
                  onDeleteSavedReply={onDeleteSavedReply}
                  authToken={authToken}
                  onSuccess={() => {
                    setReplySuccess(true);
                    setTimeout(() => { setReplySuccess(false); setReplyOpen(false); }, 1500);
                  }}
                  onCancel={() => setReplyOpen(false)}
                  replySuccess={replySuccess}
                  sessionEmail={sessionEmail}
                />
              </div>
            )}
          </div>
        </div>

        {/* Post thumbnail */}
        {!compact && (
          <div className="shrink-0 w-36 justify-self-start sm:justify-self-end">
            <a
              href={comment.commentUrl || comment.postUrl || "#"}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 hover:bg-white/[0.04] transition-colors"
              title="Open comment"
            >
              {comment.postThumbnailUrl ? (
                <img
                  src={comment.postThumbnailUrl}
                  alt={comment.postTitle || "Post thumbnail"}
                  className="h-20 w-full rounded-lg object-cover border border-white/[0.06]"
                />
              ) : (
                <div className="h-20 w-full rounded-lg border border-white/[0.06] bg-white/[0.03]" />
              )}
              <p className="mt-2 text-[11px] leading-tight text-white/50 line-clamp-2">
                {comment.postTitle || "Untitled"}
              </p>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
