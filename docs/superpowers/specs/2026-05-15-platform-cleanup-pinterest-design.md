# Platform Cleanup + Pinterest Full Implementation — Design Spec

**Date:** 2026-05-15  
**Scope:** Remove Threads and Telegram platforms; complete Pinterest with token refresh and analytics.

---

## 1. Platform Removals — Threads + Telegram

### Files to Delete

| File | Reason |
|------|--------|
| `src/app/api/auth/telegram/connect/route.ts` | Telegram auth |
| `src/lib/telegramUpload.ts` | Telegram upload logic |
| `src/app/api/auth/threads/start/route.ts` | Threads OAuth start |
| `src/app/api/auth/threads/callback/route.ts` | Threads OAuth callback |
| `src/lib/threadsUpload.ts` | Threads upload logic |
| `src/lib/threads.ts` | Threads OAuth helpers |

### Files to Modify

| File | Change |
|------|--------|
| `src/app/settings/page.tsx` | Remove Telegram + Threads from `PLATFORMS` array; remove `connectTelegram()`, `connectThreads()` functions; remove Telegram bot-token form UI (lines ~1672–1701); remove Threads `threadsEnabled` access check |
| `src/app/uploads/page.tsx` | Remove Telegram + Threads from platform list (`platforms` array), `MAX_BYTES` config, `TEXT_POST_PLATFORMS` set, per-platform settings handling, and platform-specific UI sections |
| `src/app/api/worker/run-scheduled/route.ts` | Remove Telegram and Threads upload cases from the provider switch; remove imports for `uploadToTelegram`, `createThreadsContainer`, `checkAndPublishThreadsContainer` |
| `src/app/api/worker/refresh-tokens/route.ts` | Remove any Threads token refresh case if present |
| `src/app/api/comments/route.ts` | Remove the Threads fetch block (lines ~169–186) |
| `src/lib/commentFetchers.ts` | Remove `fetchThreadsComments()` export and `UnifiedComment.platform` "threads" union member |
| `src/lib/recentPlatformPosts.ts` | Remove `fetchRecentThreadsPosts()` export |
| `src/lib/platformAccess.ts` | Delete the entire file — it only exports Threads access-control functions |

### Effect on Bug

Removing the Threads case from `api/comments/route.ts` eliminates the "error validating access token: session expired" error that appears on the comments page when a stale Threads record exists in `platform_accounts`.

---

## 2. Pinterest — Auth & Posting (wire up existing code)

### Env Vars Required

Add to `.env.local` (dev) and Vercel (prod):

```
PINTEREST_CLIENT_ID=<from Pinterest Developer Portal>
PINTEREST_CLIENT_SECRET=<from Pinterest Developer Portal>
```

Retrieve from: https://developers.pinterest.com — create an app, enable the "Advertising" and "Pins" API products, set the redirect URI to `{NEXT_PUBLIC_SITE_URL}/api/auth/pinterest/callback`.

### DB Migration

```sql
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS pinterest_settings JSONB;
```

The worker already reads `post.pinterest_settings.board_id`. This column may not exist in the schema; add it to be safe.

### OAuth Scope Fix

In `src/app/api/auth/pinterest/start/route.ts`, update scopes from:
```
boards:read,pins:write,user_accounts:read
```
to:
```
boards:read,pins:read,pins:write,user_accounts:read
```

`pins:read` is required for the analytics API (`GET /v5/pins/{pin_id}/analytics`).

---

## 3. Pinterest — Token Refresh

### New Function: `refreshPinterestToken()` in `src/lib/pinterest.ts`

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
  if (!res.ok) throw new Error(`Pinterest token refresh failed: ${res.status}`);
  return res.json();
}
```

### Update `src/app/api/worker/refresh-tokens/route.ts`

Add Pinterest to the provider conditional chain, following the Instagram pattern:

```typescript
else if (acct.provider === "pinterest") {
  const token = acct.refresh_token ?? acct.access_token;
  const refreshed = await refreshPinterestToken(token);
  newToken = refreshed.access_token;
  newExpiry = new Date(Date.now() + (refreshed.expires_in || 2592000) * 1000).toISOString();
  await supabaseAdmin
    .from("platform_accounts")
    .update({
      access_token: newToken,
      refresh_token: refreshed.refresh_token ?? token,
      expiry: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", acct.id);
}
```

Refresh threshold: same as other platforms — when `expiry` is within 7 days.

---

## 4. Pinterest — Analytics

### Type Update: `src/lib/metricsFetchers.ts`

Add `"pinterest"` to the `UnifiedMetric.platform` union:

```typescript
platform: "youtube" | "facebook" | "instagram" | "bluesky" | "tiktok" | "x" | "pinterest";
```

### New Function: `fetchRecentPinterestPosts()` in `src/lib/recentPlatformPosts.ts`

Calls `GET /v5/pins?pin_type=VIDEO&page_size=25`. Maps each pin to `{ id, title, created_at }`. Returns `{ posts, error? }`.

### New Function: `fetchPinterestMetrics()` in `src/lib/metricsFetchers.ts`

**Input:** `posts: PostInfo[]`, `accessToken: string`  
**Behavior:** For each pin ID, calls:
```
GET /v5/pins/{pin_id}/analytics
  ?start_date=YYYY-MM-DD   (30 days ago)
  &end_date=YYYY-MM-DD     (today)
  &metric_types=IMPRESSION,SAVE,VIDEO_VIEW,PIN_CLICK
```
Sums daily values across the window.  
**Mapping:**
- `views` = sum of `VIDEO_VIEW`
- `likes` = sum of `SAVE` (repins)
- `comments` = 0 (not available via Pinterest API)
- No `shares` field

**Output:** `{ metrics: UnifiedMetric[], error?: string }`

Errors are per-pin (using `Promise.allSettled`); failed pins are skipped, not fatal.

### Update `src/app/api/analytics/metrics/route.ts`

Add a Pinterest block following the existing per-provider pattern:

```typescript
const ptResults = await Promise.allSettled(
  (acctsByProvider.get("pinterest") ?? [])
    .filter((a) => a.access_token)
    .map(async (a) => {
      const recent = await fetchRecentPinterestPosts({ accessToken: a.access_token });
      const r = await fetchPinterestMetrics(recent.posts, a.access_token);
      if (r.error) errors.push(r.error);
      return r.metrics;
    })
);
ptResults.forEach((r) => {
  if (r.status === "fulfilled") allMetrics.push(...r.value);
  else errors.push(String(r.reason));
});
```

### Analytics UI

In `src/app/analytics/page.tsx`, add Pinterest to the platform filter tab list. Pinterest shows the "Total Saves" summary card (using the `likes` field from UnifiedMetric, relabeled for Pinterest rows).

---

## Summary of Changes

| Area | Files Touched |
|------|--------------|
| Delete Threads | 4 files deleted |
| Delete Telegram | 2 files deleted |
| Remove references | 8 files modified |
| Pinterest env + DB | `.env.local`, Vercel, 1 migration |
| Pinterest OAuth scope | 1 file |
| Pinterest token refresh | `src/lib/pinterest.ts`, `refresh-tokens/route.ts` |
| Pinterest analytics | `metricsFetchers.ts`, `recentPlatformPosts.ts`, `analytics/metrics/route.ts`, `analytics/page.tsx` |

**Total: 6 files deleted, ~14 files modified, 1 migration SQL**
