# Platform Cleanup + Pinterest Full Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Threads and Telegram platforms entirely, then wire up Pinterest's token refresh and analytics so it's fully usable end-to-end.

**Architecture:** Six files are deleted outright (Telegram/Threads auth + upload libs). Eight more files have references stripped. Pinterest gains a `refreshPinterestToken()` helper, a case in the refresh-tokens worker, `fetchRecentPinterestPosts()` + `fetchPinterestMetrics()` in the analytics libs, a block in the analytics route, and a platform pill in the analytics UI.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, Pinterest API v5, Tailwind CSS

---

## Task 1: Delete Threads and Telegram library + auth files

**Files:**
- Delete: `src/lib/telegramUpload.ts`
- Delete: `src/lib/threadsUpload.ts`
- Delete: `src/lib/threads.ts`
- Delete: `src/lib/platformAccess.ts`
- Delete: `src/app/api/auth/telegram/connect/route.ts`
- Delete: `src/app/api/auth/threads/start/route.ts`
- Delete: `src/app/api/auth/threads/callback/route.ts`

- [ ] **Step 1: Delete the files**

```powershell
Remove-Item "src/lib/telegramUpload.ts"
Remove-Item "src/lib/threadsUpload.ts"
Remove-Item "src/lib/threads.ts"
Remove-Item "src/lib/platformAccess.ts"
Remove-Item "src/app/api/auth/telegram/connect/route.ts"
Remove-Item "src/app/api/auth/threads/start/route.ts"
Remove-Item "src/app/api/auth/threads/callback/route.ts"
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: delete Telegram and Threads lib + auth route files"
```

---

## Task 2: Strip Threads from commentFetchers.ts and recentPlatformPosts.ts

**Files:**
- Modify: `src/lib/commentFetchers.ts`
- Modify: `src/lib/recentPlatformPosts.ts`

- [ ] **Step 1: Remove `fetchThreadsComments` from commentFetchers.ts**

In `src/lib/commentFetchers.ts`:
- Change line 6 from:
  ```typescript
  platform: "youtube" | "facebook" | "instagram" | "bluesky" | "x" | "threads";
  ```
  to:
  ```typescript
  platform: "youtube" | "facebook" | "instagram" | "bluesky" | "x";
  ```
- Delete the entire `// ── Threads ──` section (lines 468–536): the comment, the `fetchThreadsComments` export function, and any trailing blank lines.

After edits, the file should end right after the closing brace of `fetchXComments`.

- [ ] **Step 2: Remove `fetchRecentThreadsPosts` from recentPlatformPosts.ts**

In `src/lib/recentPlatformPosts.ts`, delete the entire `// ── Threads ──` section (lines 282–324): the comment line, the `fetchRecentThreadsPosts` export function.

The file should end after the closing brace of `fetchRecentXPosts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/commentFetchers.ts src/lib/recentPlatformPosts.ts
git commit -m "chore: remove Threads from commentFetchers and recentPlatformPosts"
```

---

## Task 3: Strip Threads and Telegram from the comments API route

**Files:**
- Modify: `src/app/api/comments/route.ts`

- [ ] **Step 1: Remove Threads imports**

In `src/app/api/comments/route.ts`, change the import from `@/lib/commentFetchers` to remove `fetchThreadsComments`:
```typescript
import {
  fetchYouTubeComments,
  fetchFacebookComments,
  fetchInstagramComments,
  fetchBlueskyComments,
  fetchXComments,
  type UnifiedComment,
} from "@/lib/commentFetchers";
```

Change the import from `@/lib/recentPlatformPosts` to remove `fetchRecentThreadsPosts`:
```typescript
import {
  fetchRecentYouTubePosts,
  fetchRecentFacebookPosts,
  fetchRecentInstagramPosts,
  fetchRecentBlueskyPosts,
  fetchRecentXPosts,
} from "@/lib/recentPlatformPosts";
```

- [ ] **Step 2: Remove Threads from provider filter**

Change line 37 from:
```typescript
      .in("provider", ["youtube", "facebook", "instagram", "bluesky", "x", "threads"]);
```
to:
```typescript
      .in("provider", ["youtube", "facebook", "instagram", "bluesky", "x"]);
```

- [ ] **Step 3: Delete the Threads fetch block**

Delete the entire `// ── Threads ──` section (lines 169–186) including the `threadsResults` declaration, its `Promise.allSettled` call, and the `for` loop that pushes into `allComments`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/comments/route.ts
git commit -m "chore: remove Threads from comments API route"
```

---

## Task 4: Strip Threads and Telegram from the worker

**Files:**
- Modify: `src/app/api/worker/run-scheduled/route.ts`

- [ ] **Step 1: Remove Telegram import**

Find and delete this import line at the top of the worker file:
```typescript
import { uploadToTelegram } from "@/lib/telegramUpload";
```

- [ ] **Step 2: Remove Threads imports**

Find and delete these import lines:
```typescript
import { createThreadsContainer, checkAndPublishThreadsContainer } from "@/lib/threadsUpload";
```
(The exact import names may differ slightly — search for `threadsUpload` and delete that import line entirely.)

- [ ] **Step 3: Remove the Telegram upload case**

Find and delete the `else if (provider === "telegram")` block (approximately lines 995–1006 in the original):
```typescript
} else if (provider === "telegram") {
  if (!acct.access_token || !acct.platform_user_id) {
    throw new Error("Telegram channel not configured. Please reconnect.");
  }
  const tg = await uploadToTelegram({
    botToken: acct.access_token,
    channelId: acct.platform_user_id,
    bucket,
    storagePath,
    caption: `${post.title ?? ""}\n\n${post.description ?? ""}`.trim(),
  });
  platformPostId = tg.platform_post_id;
}
```

- [ ] **Step 4: Remove the Threads upload case**

Find and delete the `else if (provider === "threads")` block (it will reference `createThreadsContainer` or `checkAndPublishThreadsContainer`). Delete the entire block.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/worker/run-scheduled/route.ts
git commit -m "chore: remove Telegram and Threads upload cases from worker"
```

---

## Task 5: Strip Threads and Telegram from the refresh-tokens worker

**Files:**
- Modify: `src/app/api/worker/refresh-tokens/route.ts`

- [ ] **Step 1: Check if Threads or Telegram appear in refresh-tokens**

Search for `threads` and `telegram` in `src/app/api/worker/refresh-tokens/route.ts`. The current provider filter on line 105 is:
```typescript
.in("provider", ["facebook", "instagram", "x", "linkedin", "bluesky"])
```
Neither threads nor telegram appears — nothing to remove. If they do appear in your version, remove their cases following the same pattern as Tasks 3–4.

- [ ] **Step 2: Commit (no-op if nothing changed)**

If you made changes:
```bash
git add src/app/api/worker/refresh-tokens/route.ts
git commit -m "chore: remove Threads/Telegram from refresh-tokens worker"
```

---

## Task 6: Strip Threads and Telegram from the settings page

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Remove the platformAccess import**

Delete line 6:
```typescript
import { isThreadsEnabledForUserIdClient } from "@/lib/platformAccess";
```

- [ ] **Step 2: Update the ProviderKey type**

Change line 21 from:
```typescript
type ProviderKey = "youtube" | "tiktok" | "instagram" | "facebook" | "linkedin" | "threads" | "bluesky" | "x" | "pinterest" | "telegram";
```
to:
```typescript
type ProviderKey = "youtube" | "tiktok" | "instagram" | "facebook" | "linkedin" | "bluesky" | "x" | "pinterest";
```

- [ ] **Step 3: Remove Threads and Telegram from the PLATFORMS array**

In the `PLATFORMS` array (starting at line 54), delete the entire Threads entry (the object with `key: "threads" as ProviderKey`) and the entire Telegram entry (the object with `key: "telegram" as ProviderKey`).

- [ ] **Step 4: Update the accounts initial state**

Change the `accounts` state initialization (around line 208–219) from:
```typescript
  const [accounts, setAccounts] = useState<Record<ProviderKey, AccountInfo[]>>({
    youtube: [],
    tiktok: [],
    instagram: [],
    facebook: [],
    linkedin: [],
    threads: [],
    bluesky: [],
    x: [],
    pinterest: [],
    telegram: [],
  });
```
to:
```typescript
  const [accounts, setAccounts] = useState<Record<ProviderKey, AccountInfo[]>>({
    youtube: [],
    tiktok: [],
    instagram: [],
    facebook: [],
    linkedin: [],
    bluesky: [],
    x: [],
    pinterest: [],
  });
```

- [ ] **Step 5: Remove threadsEnabled state and visiblePlatforms filter**

Delete lines 239–243:
```typescript
  const threadsEnabled = isThreadsEnabledForUserIdClient(userId);
  const visiblePlatforms = useMemo(
    () => PLATFORMS.filter((p) => p.key !== "threads" || threadsEnabled),
    [threadsEnabled]
  );
```
Replace with:
```typescript
  const visiblePlatforms = PLATFORMS;
```

- [ ] **Step 6: Remove banner entry for Threads**

In the `banner` useMemo, delete the line:
```typescript
    if (conn === "threads") return { kind: "success" as const, text: "Threads connected successfully" };
```

- [ ] **Step 7: Remove connectThreads and disconnectThreads functions**

Delete the `connectThreads` function (lines 780–790) and the `disconnectThreads` function (lines 792–802).

- [ ] **Step 8: Remove connectFns entries for threads**

In the `connectFns` object (around line 1563), remove:
```typescript
                threads: connectThreads,
```

- [ ] **Step 9: Remove the Telegram connect button exclusion**

Change line 1604 from:
```typescript
                    {canManage && platform.key !== "bluesky" && platform.key !== "telegram" && connectFn && (
```
to:
```typescript
                    {canManage && platform.key !== "bluesky" && connectFn && (
```

- [ ] **Step 10: Remove Telegram state variables and connectTelegram function**

Delete lines 855–883:
```typescript
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChannelId, setTelegramChannelId] = useState("");
  const [telegramLabel, setTelegramLabel] = useState("");
  const [telegramConnecting, setTelegramConnecting] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  async function connectTelegram() {
    // ... entire function body ...
  }
```

- [ ] **Step 11: Remove the Telegram form UI block**

Delete the JSX block for the Telegram form (lines 1672–1705):
```typescript
                  {/* Telegram form */}
                  {platform.key === "telegram" && canManage && (
                    <div ...>
                      ...
                    </div>
                  )}
```

- [ ] **Step 12: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to threads, telegram, or platformAccess.

- [ ] **Step 13: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "chore: remove Threads and Telegram from settings page"
```

---

## Task 7: Strip Threads and Telegram from the uploads page

**Files:**
- Modify: `src/app/uploads/page.tsx`

- [ ] **Step 1: Remove from MAX_BYTES config**

Find the `MAX_BYTES` object (around line 82) and remove:
```typescript
    telegram: { maxBytes: 2 * 1024 * 1024 * 1024, label: "2 GB" },
```
and:
```typescript
    threads: { maxBytes: 1 * 1024 * 1024 * 1024, label: "1 GB" },
```

- [ ] **Step 2: Remove from platform definitions array**

Find the `platforms` array (around line 138–192) and delete the Telegram entry (the object with `id: "telegram"` or `key: "telegram"`) and the Threads entry (the object with `id: "threads"` or `key: "threads"`).

- [ ] **Step 3: Remove Threads from TEXT_POST_PLATFORMS**

Find the `TEXT_POST_PLATFORMS` set (around line 321) and remove `"threads"` from it.

- [ ] **Step 4: Remove Threads-specific settings handling**

Find the block that handles `threads` in the platform settings section (around lines 1763–1769). Delete the Threads case — it handles `title_override` and `description_override` for Threads.

- [ ] **Step 5: Remove Threads and Telegram UI sections**

Search for JSX blocks guarded by `platform === "threads"` or `platform === "telegram"` (or `id === "threads"` / `id === "telegram"`) and delete them. These are the platform-specific form sections in the upload composer (approximately lines 3485–3522 for Threads, and the Telegram equivalent section).

- [ ] **Step 6: Remove any disconnectAccount / connectFns references to Threads/Telegram**

Search the file for `"threads"` and `"telegram"` and remove any remaining references in state maps, connect function mappings, or disconnect handlers.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/uploads/page.tsx
git commit -m "chore: remove Threads and Telegram from uploads page"
```

---

## Task 8: Add Pinterest scope fix + DB migration

**Files:**
- Modify: `src/app/api/auth/pinterest/start/route.ts`
- New migration SQL (run manually in Supabase SQL editor)

- [ ] **Step 1: Update OAuth scope**

In `src/app/api/auth/pinterest/start/route.ts`, change line 22 from:
```typescript
    scope: "boards:read,pins:write,user_accounts:read",
```
to:
```typescript
    scope: "boards:read,pins:read,pins:write,user_accounts:read",
```

- [ ] **Step 2: Run the DB migration**

In the Supabase SQL editor (or via psql), run:
```sql
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS pinterest_settings JSONB;
```

- [ ] **Step 3: Commit the scope change**

```bash
git add src/app/api/auth/pinterest/start/route.ts
git commit -m "feat(pinterest): add pins:read scope for analytics access"
```

---

## Task 9: Add Pinterest token refresh

**Files:**
- Modify: `src/lib/pinterest.ts`
- Modify: `src/app/api/worker/refresh-tokens/route.ts`

- [ ] **Step 1: Add `refreshPinterestToken` to pinterest.ts**

Append to the end of `src/lib/pinterest.ts`:

```typescript
export async function refreshPinterestToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const { clientId, clientSecret } = getPinterestAuthConfig();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest token refresh failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token ?? refreshToken) as string,
    expires_in: (data.expires_in ?? 2592000) as number,
  };
}
```

- [ ] **Step 2: Add Pinterest import to refresh-tokens worker**

In `src/app/api/worker/refresh-tokens/route.ts`, add to the imports at the top:
```typescript
import { refreshPinterestToken } from "@/lib/pinterest";
```

- [ ] **Step 3: Add Pinterest to the provider filter in refresh-tokens**

Change line 105 from:
```typescript
    .in("provider", ["facebook", "instagram", "x", "linkedin", "bluesky"])
```
to:
```typescript
    .in("provider", ["facebook", "instagram", "x", "linkedin", "bluesky", "pinterest"])
```

- [ ] **Step 4: Add Pinterest to the `due` filter**

The `due` filter (around line 117) already handles Bluesky differently. Pinterest should refresh when expiry is within 7 days or missing — the existing `else` clause handles this correctly (no change needed to the filter logic).

- [ ] **Step 5: Add Pinterest case in the for-loop**

In the `for (const acct of due)` loop, after the `bluesky` case (the `else if (acct.provider === "bluesky")` block) and before the `else { continue; }` line, add:

```typescript
      } else if (acct.provider === "pinterest") {
        const token = acct.refresh_token ?? acct.access_token;
        if (!token) throw new Error("No token to refresh");

        const refreshed = await refreshPinterestToken(token);
        newToken = refreshed.access_token;
        newExpiry = new Date(Date.now() + (refreshed.expires_in || 2592000) * 1000).toISOString();

        await supabaseAdmin
          .from("platform_accounts")
          .update({
            access_token: newToken,
            refresh_token: refreshed.refresh_token,
            expiry: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", acct.id);
```

The `newToken` and `newExpiry` variables are already declared at the top of the `try` block as `let newToken: string; let newExpiry: string;` — no new declarations needed.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pinterest.ts src/app/api/worker/refresh-tokens/route.ts
git commit -m "feat(pinterest): add token refresh in pinterest.ts and refresh-tokens worker"
```

---

## Task 10: Add Pinterest recent posts fetcher

**Files:**
- Modify: `src/lib/recentPlatformPosts.ts`

- [ ] **Step 1: Append `fetchRecentPinterestPosts` to recentPlatformPosts.ts**

Append to the end of `src/lib/recentPlatformPosts.ts`:

```typescript
// ── Pinterest ────────────────────────────────────────────────────────

export async function fetchRecentPinterestPosts(params: {
  accessToken: string;
  maxResults: number;
  sinceIso?: string;
}): Promise<{ posts: RecentPost[]; error?: string }> {
  try {
    const pageSize = Math.min(Math.max(params.maxResults, 1), 25);
    const url = `https://api.pinterest.com/v5/pins?pin_type=VIDEO&page_size=${pageSize}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        posts: [],
        error: `Pinterest recent posts: ${errBody?.message || `HTTP ${res.status}`}`,
      };
    }

    const json = await res.json();
    const posts: RecentPost[] = [];
    for (const item of json.items ?? []) {
      const createdAt: string | null = item.created_at ?? null;
      if (!isAfterSince(createdAt, params.sinceIso)) continue;
      posts.push({
        id: `pt-${item.id}`,
        title: item.title || "Pinterest pin",
        platform_post_id: item.id ?? null,
        posted_at: createdAt,
        thumbnail_url: item.media?.images?.["150x150"]?.url ?? null,
      });
    }

    return { posts };
  } catch (e: any) {
    return { posts: [], error: `Pinterest recent posts: ${e?.message || "Unknown error"}` };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/recentPlatformPosts.ts
git commit -m "feat(pinterest): add fetchRecentPinterestPosts"
```

---

## Task 11: Add Pinterest metrics fetcher

**Files:**
- Modify: `src/lib/metricsFetchers.ts`

- [ ] **Step 1: Add "pinterest" to UnifiedMetric platform type**

Change line 5 from:
```typescript
  platform: "youtube" | "facebook" | "instagram" | "bluesky" | "tiktok" | "x";
```
to:
```typescript
  platform: "youtube" | "facebook" | "instagram" | "bluesky" | "tiktok" | "x" | "pinterest";
```

- [ ] **Step 2: Append `fetchPinterestMetrics` to metricsFetchers.ts**

Append to the end of `src/lib/metricsFetchers.ts`:

```typescript
// ── Pinterest ────────────────────────────────────────────────────────

export async function fetchPinterestMetrics(
  posts: PostInfo[],
  accessToken: string
): Promise<{ metrics: UnifiedMetric[]; error?: string }> {
  try {
    const today = new Date();
    const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const results = await Promise.allSettled(
      posts.map(async (post) => {
        const pinId = post.platform_post_id;
        if (!pinId) return null;

        const url = `https://api.pinterest.com/v5/pins/${encodeURIComponent(pinId)}/analytics?start_date=${fmt(startDate)}&end_date=${fmt(today)}&metric_types=IMPRESSION,SAVE,VIDEO_VIEW,PIN_CLICK`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) return null;

        const json = await res.json();
        const daily: Record<string, number[]> = json.all?.daily_metrics?.reduce(
          (acc: Record<string, number[]>, day: any) => {
            for (const [k, v] of Object.entries(day.metrics ?? {})) {
              acc[k] = (acc[k] ?? []);
              acc[k].push(v as number);
            }
            return acc;
          },
          {} as Record<string, number[]>
        ) ?? {};

        const sum = (key: string) => (daily[key] ?? []).reduce((a, b) => a + b, 0);

        return {
          videoId: pinId,
          platform: "pinterest" as const,
          title: post.title ?? "Pinterest pin",
          views: sum("VIDEO_VIEW"),
          likes: sum("SAVE"),
          comments: 0,
          postedAt: post.posted_at ?? new Date().toISOString(),
        };
      })
    );

    const metrics: UnifiedMetric[] = [];
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) metrics.push(r.value);
      else if (r.status === "rejected") errors.push(r.reason?.message);
    }

    return {
      metrics,
      error: errors.length > 0 ? `Pinterest: ${errors[0]}` : undefined,
    };
  } catch (e: any) {
    return { metrics: [], error: `Pinterest: ${e?.message || "Unknown error"}` };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/metricsFetchers.ts
git commit -m "feat(pinterest): add fetchPinterestMetrics"
```

---

## Task 12: Add Pinterest to the analytics metrics route

**Files:**
- Modify: `src/app/api/analytics/metrics/route.ts`

- [ ] **Step 1: Add Pinterest imports**

In `src/app/api/analytics/metrics/route.ts`, add `fetchPinterestMetrics` to the metricsFetchers import:
```typescript
import {
  fetchYouTubeMetrics,
  fetchFacebookMetrics,
  fetchInstagramMetrics,
  fetchBlueskyMetrics,
  fetchTikTokMetrics,
  fetchXMetrics,
  fetchPinterestMetrics,
  type UnifiedMetric,
} from "@/lib/metricsFetchers";
```

Add `fetchRecentPinterestPosts` to the recentPlatformPosts import:
```typescript
import {
  fetchRecentYouTubePosts,
  fetchRecentFacebookPosts,
  fetchRecentInstagramPosts,
  fetchRecentBlueskyPosts,
  fetchRecentTikTokPosts,
  fetchRecentXPosts,
  fetchRecentPinterestPosts,
} from "@/lib/recentPlatformPosts";
```

- [ ] **Step 2: Add Pinterest to the provider filter**

Change line 36 from:
```typescript
      .in("provider", ["youtube", "facebook", "instagram", "bluesky", "tiktok", "x"]);
```
to:
```typescript
      .in("provider", ["youtube", "facebook", "instagram", "bluesky", "tiktok", "x", "pinterest"]);
```

- [ ] **Step 3: Add Pinterest fetch block**

After the X results block (after the second `for (const r of xResults)` loop and before the `// Sort by most recent first` comment), add:

```typescript
    // Fetch from all Pinterest accounts
    const ptResults = await Promise.allSettled(
      (acctsByProvider.get("pinterest") ?? [])
        .filter((a) => a.access_token)
        .map(async (a) => {
          const recent = await fetchRecentPinterestPosts({ accessToken: a.access_token, maxResults, sinceIso });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedMetric[];
          const r = await fetchPinterestMetrics(recent.posts, a.access_token);
          if (r.error) errors.push(r.error);
          return r.metrics;
        })
    );
    for (const r of ptResults) {
      if (r.status === "fulfilled") allMetrics.push(...r.value);
      else errors.push(r.reason?.message || "Pinterest fetch error");
    }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/analytics/metrics/route.ts
git commit -m "feat(pinterest): add Pinterest to analytics metrics route"
```

---

## Task 13: Add Pinterest to the analytics page UI

**Files:**
- Modify: `src/app/analytics/page.tsx`

- [ ] **Step 1: Add "pinterest" to the Metric type**

Change line 19 from:
```typescript
  platform: "youtube" | "facebook" | "instagram" | "bluesky" | "tiktok" | "x";
```
to:
```typescript
  platform: "youtube" | "facebook" | "instagram" | "bluesky" | "tiktok" | "x" | "pinterest";
```

- [ ] **Step 2: Add "pinterest" to PlatformFilter type**

Change line 30 from:
```typescript
type PlatformFilter = "all" | "youtube" | "facebook" | "instagram" | "bluesky" | "tiktok" | "x";
```
to:
```typescript
type PlatformFilter = "all" | "youtube" | "facebook" | "instagram" | "bluesky" | "tiktok" | "x" | "pinterest";
```

- [ ] **Step 3: Add Pinterest to platformLabels**

In the `platformLabels` object (lines 33–40), add:
```typescript
  pinterest: "Pinterest",
```

- [ ] **Step 4: Add Pinterest to PLATFORM_STATS**

In the `PLATFORM_STATS` object (lines 42–49), add:
```typescript
  pinterest: { views: true,  likes: true, comments: false, shares: false },
```

(Pinterest VIDEO_VIEW → views, SAVE → likes, no comments available.)

- [ ] **Step 5: Add Pinterest to PlatformPill colorMap**

In the `colorMap` object inside `PlatformPill` (lines 127–134), add:
```typescript
    pinterest: "border-red-600/40 bg-red-600/10 text-red-300",
```

- [ ] **Step 6: Add Pinterest pill to platform filter list**

Change line 370 from:
```typescript
            {(["all", "youtube", "tiktok", "instagram", "facebook", "bluesky", "x"] as PlatformFilter[]).map((p) => (
```
to:
```typescript
            {(["all", "youtube", "tiktok", "instagram", "facebook", "bluesky", "x", "pinterest"] as PlatformFilter[]).map((p) => (
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/analytics/page.tsx
git commit -m "feat(pinterest): add Pinterest to analytics page UI"
```

---

## Task 14: Final verification

- [ ] **Step 1: Check for any remaining Threads or Telegram references**

```bash
grep -r "threads\|telegram" src/ --include="*.ts" --include="*.tsx" -l
```

Expected files that may still mention these: none that matter. Acceptable remaining references: any error message text, `platform_post_id` that happens to reference an existing DB record, or comments. If you see any file containing functional code for threads/telegram, remove it.

- [ ] **Step 2: Check TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: zero errors.

- [ ] **Step 3: Check for remaining Pinterest-specific items**

```bash
grep -r "pinterest" src/ --include="*.ts" --include="*.tsx" -l
```

Expected files: `src/lib/pinterest.ts`, `src/lib/pinterestUpload.ts`, `src/app/api/auth/pinterest/`, `src/app/api/pinterest/`, `src/app/api/worker/run-scheduled/route.ts`, `src/app/api/worker/refresh-tokens/route.ts`, `src/lib/metricsFetchers.ts`, `src/lib/recentPlatformPosts.ts`, `src/app/api/analytics/metrics/route.ts`, `src/app/analytics/page.tsx`, `src/app/settings/page.tsx`, `src/app/uploads/page.tsx`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup — platform removal and Pinterest analytics complete"
```

---

## Post-Implementation: Pinterest env vars (manual step)

**Not code — do this in your environment:**

1. Go to [developers.pinterest.com](https://developers.pinterest.com) → your app → "Configure" → copy the App ID and App Secret.
2. Set the redirect URI to `{NEXT_PUBLIC_SITE_URL}/api/auth/pinterest/callback` in the Pinterest app settings.
3. Add to `.env.local`:
   ```
   PINTEREST_CLIENT_ID=<your-app-id>
   PINTEREST_CLIENT_SECRET=<your-app-secret>
   ```
4. Add the same two vars in Vercel → your project → Settings → Environment Variables → Production + Preview.
5. Redeploy on Vercel after saving env vars.
6. Reconnect any existing Pinterest accounts in Settings so they pick up the new `pins:read` scope.
