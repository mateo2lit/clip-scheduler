// src/app/calendar/types.ts

export type PostStatus = "scheduled" | "ig_processing" | "posted" | "failed";

export type ScheduledPost = {
  id: string;
  title: string | null;
  description: string | null;
  provider: string | null;
  scheduled_for: string;
  status: PostStatus;
  group_id: string | null;
  thumbnail_path: string | null;
  platform_account_id: string | null;
};

export type PostGroup = {
  groupId: string; // group_id ?? id
  title: string | null;
  description: string | null;
  scheduled_for: string;
  status: PostStatus;
  thumbnail_path: string | null;
  posts: ScheduledPost[];
};

export const PROVIDER_META: Record<string, { label: string; dotClass: string }> = {
  youtube:   { label: "YouTube",   dotClass: "bg-red-500"    },
  tiktok:    { label: "TikTok",    dotClass: "bg-white/70"   },
  instagram: { label: "Instagram", dotClass: "bg-pink-500"   },
  facebook:  { label: "Facebook",  dotClass: "bg-blue-500"   },
  linkedin:  { label: "LinkedIn",  dotClass: "bg-sky-500"    },
  bluesky:   { label: "Bluesky",   dotClass: "bg-sky-400"    },
  threads:   { label: "Threads",   dotClass: "bg-white/50"   },
};

export const STATUS_META: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  scheduled:     { label: "Scheduled",   dotClass: "bg-blue-400",  badgeClass: "bg-blue-500/20 text-blue-300"   },
  ig_processing: { label: "Processing",  dotClass: "bg-amber-400", badgeClass: "bg-amber-500/20 text-amber-300" },
  posted:        { label: "Posted",      dotClass: "bg-green-400", badgeClass: "bg-green-500/20 text-green-300" },
  failed:        { label: "Failed",      dotClass: "bg-red-400",   badgeClass: "bg-red-500/20 text-red-300"     },
};

/** Resolve a thumbnail_path to a public URL. Returns null if path is empty. */
export function thumbnailUrl(path: string | null, supabaseUrl: string): string | null {
  if (!path) return null;
  return `${supabaseUrl}/storage/v1/object/public/clips/${path}`;
}

/** Group an array of ScheduledPost into PostGroup[] */
export function groupPosts(posts: ScheduledPost[]): PostGroup[] {
  const map = new Map<string, ScheduledPost[]>();
  for (const post of posts) {
    const key = post.group_id || post.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(post);
  }
  return Array.from(map.entries()).map(([groupId, members]) => ({
    groupId,
    title: members[0].title,
    description: members[0].description,
    scheduled_for: members[0].scheduled_for,
    status: members[0].status,
    thumbnail_path: members[0].thumbnail_path,
    posts: members,
  }));
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
