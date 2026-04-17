import { useState } from "react";
import type { EnrichedComment, SavedReply } from "./types";
import { platformLabels, platformColors, commentTypeColors } from "./types";
import ReplyForm from "./ReplyForm";
import { Star, Check, Heart, Archive, ArrowSquareOut, ArrowBendUpLeft } from "@phosphor-icons/react/dist/ssr";

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
          <Star className="w-3.5 h-3.5 text-amber-400" weight="fill" />
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
                <Check className="w-2.5 h-2.5 text-white" weight="bold" />
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
                <Heart className="w-3 h-3" weight={isLiked ? "fill" : "regular"} />
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
                <Star className="w-3 h-3" weight={isStarred ? "fill" : "regular"} />
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
                <Archive className="w-3 h-3" weight="duotone" />
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
                  <ArrowSquareOut className="w-3 h-3" weight="bold" />
                  View
                </a>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setReplyOpen(!replyOpen); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] hover:border-white/15 transition-all"
              >
                <ArrowBendUpLeft className="w-3 h-3" weight="bold" />
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
