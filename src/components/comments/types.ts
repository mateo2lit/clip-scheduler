export type Comment = {
  id: string;
  replyId?: string;
  platform: "youtube" | "facebook" | "instagram" | "bluesky" | "x";
  accountId: string;
  accountLabel: string;
  postTitle: string;
  postId: string;
  postUrl?: string;
  commentUrl?: string;
  postThumbnailUrl?: string | null;
  authorName: string;
  authorImageUrl: string | null;
  text: string;
  publishedAt: string;
  likeCount: number;
};

export type Sentiment = "positive" | "negative" | "neutral";
export type CommentType = "question" | "content-request" | "feedback" | "praise" | "general";
export type PlatformFilter = "all" | "youtube" | "facebook" | "instagram" | "bluesky" | "x";
export type SortMode = "priority" | "recent" | "oldest";
export type ReadFilter = "unread" | "read" | "all";
export type ViewMode = "list" | "by-post" | "by-user";
export type SentimentFilter = "all" | "positive" | "negative" | "neutral";

export type EnrichedComment = Comment & {
  sentiment: Sentiment;
  commentType: CommentType;
  priorityScore: number;
};

export type SavedReply = {
  id: string;
  label: string;
  text: string;
  createdAt: string;
};

export type CommentFlags = {
  starred?: boolean;
  archived?: boolean;
};

export type ArchiveFilter = "active" | "archived" | "starred";
export type DateRange = "3d" | "7d" | "14d" | "30d";

export const platformLabels: Record<string, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  bluesky: "Bluesky",
  x: "X (Twitter)",
};

export const platformColors: Record<string, { badge: string; text: string }> = {
  youtube: { badge: "bg-red-500/10 border-red-500/20 text-red-400", text: "text-red-400" },
  facebook: { badge: "bg-blue-500/10 border-blue-500/20 text-blue-400", text: "text-blue-400" },
  instagram: { badge: "bg-pink-500/10 border-pink-500/20 text-pink-400", text: "text-pink-400" },
  bluesky: { badge: "bg-sky-500/10 border-sky-500/20 text-sky-400", text: "text-sky-400" },
  x: { badge: "bg-white/10 border-white/20 text-white/70", text: "text-white/70" },
};

export const commentTypeColors: Record<CommentType, { badge: string; label: string }> = {
  question: { badge: "bg-amber-500/10 border-amber-500/20 text-amber-400", label: "Question" },
  "content-request": { badge: "bg-purple-500/10 border-purple-500/20 text-purple-400", label: "Request" },
  feedback: { badge: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400", label: "Feedback" },
  praise: { badge: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", label: "Praise" },
  general: { badge: "", label: "" },
};
