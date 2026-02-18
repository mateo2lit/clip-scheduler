# Clip Dash — Project Context

## What is this?
Clip Dash is a SaaS for content creators to schedule and auto-publish videos across YouTube, TikTok, Instagram, Facebook, and LinkedIn from one dashboard. Upload once, pick platforms and times, and the worker posts it automatically.

## Tech Stack
- **Framework:** Next.js 14.2 (App Router), React 18, TypeScript, Tailwind CSS v4
- **Database:** Supabase (Postgres) via `@supabase/supabase-js` service role client
- **Auth:** Supabase Auth (email/password), JWT Bearer tokens on all API routes
- **Storage:** Supabase Storage (bucket: `clips`) for video files and thumbnails
- **Payments:** Stripe (Checkout + Customer Portal + Webhooks), two plans: Creator ($9.99) and Team ($19.99)
- **Email:** Resend for transactional emails (post success/failed/reconnect notifications)
- **AI:** Anthropic Claude Haiku for hashtag suggestions
- **Deploy:** Vercel (serverless functions, cron)
- **OAuth Providers:** Google (YouTube), TikTok, Facebook, Instagram (Meta), LinkedIn

## Architecture
- **Auth pattern:** Every API route calls `getTeamContext(req)` from `src/lib/teamAuth.ts` which extracts the Bearer token, validates via Supabase, and returns `{ userId, teamId, role }`.
- **Team model:** Single-team per user. `teams` table has billing fields (`stripe_customer_id`, `plan`, `plan_status`). `team_members` links users to teams with roles (`owner`, `admin`, `member`).
- **Upload flow:** User uploads video to Supabase Storage -> creates `uploads` row -> creates `scheduled_posts` row(s) with target platforms and schedule time -> cron worker picks them up and posts.
- **Worker:** `/api/worker/run-scheduled` processes due posts. Protected by `WORKER_SECRET` query param. Handles YouTube, TikTok, Facebook, Instagram (async container), LinkedIn. Instagram uses two-phase: create container -> poll until ready -> publish.
- **Token refresh:** `/api/worker/refresh-tokens` refreshes Facebook/Instagram tokens expiring within 7 days. YouTube uses refresh_token on each upload. TikTok refreshes inline.

## Key Directories
```
src/
  app/
    api/
      auth/         — OAuth start/callback for each platform
      team/         — Team management (me, invite, role, plan)
      worker/       — Cron endpoints (run-scheduled, refresh-tokens)
      stripe/       — Checkout, portal, webhook
      uploads/      — Upload creation
      scheduled-posts/ — CRUD for scheduled posts
      comments/     — Comment fetching and replies
      analytics/    — Platform metrics aggregation (views, likes, comments)
      ai/           — Hashtag suggestions
      platform-accounts/ — Connected account management
      platform-defaults/ — Per-platform upload default settings
      notifications/ — Email notification preferences
      account/      — Account deletion (also Meta data deletion callback)
    dashboard/    — Post count overview + links to analytics/comments
    analytics/    — Per-video performance metrics with platform filtering
    uploads/      — Main upload + scheduling UI
    scheduled/    — Upcoming posts list
    posted/       — Completed posts
    drafts/       — Draft posts
    calendar/     — Calendar view of scheduled posts
    comments/     — Cross-platform comment inbox
    settings/     — Account, billing, connections, team, notifications, defaults
    login/        — Auth page (login/signup)
  lib/
    teamAuth.ts        — Auth + team context extraction
    useTeam.ts         — Client-side team hook
    supabaseAdmin.ts   — Service role Supabase client
    youtubeUpload.ts   — YouTube upload logic
    tiktokUpload.ts    — TikTok upload logic
    facebookUpload.ts  — Facebook upload logic
    instagramUpload.ts — Instagram container + publish logic
    linkedinUpload.ts  — LinkedIn upload logic
    email.ts           — Transactional email templates via Resend
    commentFetchers.ts — YouTube/Facebook/Instagram comment fetching
    metricsFetchers.ts — YouTube/Facebook/Instagram metrics (views, likes, comments)
    tiktok.ts          — TikTok OAuth helpers
    facebook.ts        — Facebook OAuth helpers
    instagram.ts       — Instagram OAuth helpers
```

## Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
STRIPE_CREATOR_PRICE_ID, STRIPE_TEAM_PRICE_ID
NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID, NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID
NEXT_PUBLIC_SITE_URL (localhost:3000 dev, production domain for prod)
WORKER_SECRET, CRON_SECRET
ANTHROPIC_API_KEY
OAUTH_STATE_SECRET
RESEND_API_KEY (expected by email.ts)
```

## Database Tables
- `teams` — id, name, owner_id, plan, plan_status, trial_ends_at, stripe_customer_id, stripe_subscription_id
- `team_members` — team_id, user_id, role, joined_at (UNIQUE team_id+user_id)
- `team_invites` — id, team_id, email, status, created_at
- `uploads` — id, user_id, team_id, bucket, file_path
- `scheduled_posts` — id, user_id, team_id, upload_id, title, description, provider, status, scheduled_for, privacy_status, youtube_settings, tiktok_settings, instagram_settings, thumbnail_path, group_id, ig_container_id, ig_container_created_at, platform_post_id, platform_media_id, posted_at, last_error
- `platform_accounts` — user_id, team_id, provider, access_token, refresh_token, expiry, platform_user_id, page_id, page_access_token, ig_user_id, profile_name, avatar_url (UNIQUE team_id+provider)
- `notification_preferences` — user_id, notify_post_success, notify_post_failed, notify_reconnect
- `platform_defaults` — user_id, platform, settings (JSONB)

## Conventions
- All API responses use `{ ok: true/false, ... }` shape
- Owner/admin checks via `requireOwner()` or `requireOwnerOrAdmin()` from teamAuth.ts
- Worker endpoints auth via `WORKER_SECRET` query param, not Bearer token
- Frontend pages check Supabase session and redirect to `/login` if missing
- Dark theme UI throughout (#050505 bg, white/opacity text, rounded-3xl cards)

---

# Launch Readiness Plan — Thursday Night

## CRITICAL (Must fix before launch)

### 1. OAuth CSRF vulnerability — state parameter is raw userId
**Files:** All `src/app/api/auth/*/start/route.ts` and `callback/route.ts`
**Issue:** The OAuth `state` parameter is just the userId, not a cryptographically random CSRF token. An attacker could craft a callback URL with a victim's userId and their own OAuth code, linking the attacker's platform account to the victim's team.
**Fix:** Generate a random state token, store it in DB or sign it with `OAUTH_STATE_SECRET` (already in env), and verify on callback. Format: `HMAC(userId + timestamp, OAUTH_STATE_SECRET)` or use a short-lived DB row.

### 2. Remove debug/test routes before production
**Files to delete:**
- `src/app/api/debug/force-scheduled/route.ts` — Has hardcoded userId, lets anyone force-reschedule posts
- `src/app/api/youtube/test-upload/route.ts` — Test upload endpoint, no team scoping
**Fix:** Delete both files.

### 3. Worker auth bypass when WORKER_SECRET is unset
**Files:** `src/app/api/worker/run-scheduled/route.ts`, `refresh-tokens/route.ts`, `debug/force-scheduled/route.ts`
**Issue:** `requireWorkerAuth()` returns early (allows access) if `WORKER_SECRET` env var is not set. In production this should fail closed.
**Fix:** Change to throw error if `WORKER_SECRET` is not set in production.

### 4. TikTok Content Posting API approval required
**Issue:** TikTok requires app review and approval for `video.publish` scope before you can post to ANY user's account (not just your own test account). Your app currently requests `user.info.basic,video.upload,video.publish`.
**Action:** Submit app for review on TikTok Developer Portal NOW — approval can take days to weeks. You can launch without TikTok posting initially and add it when approved. Users can still connect TikTok, but posts will fail until approved.
**Ref:** https://developers.tiktok.com/doc/content-posting-api-get-started

### 5. Vercel cron not configured
**File:** `vercel.json` is empty `{}`
**Issue:** The worker endpoints need to be called on a schedule. Without cron config, no posts will auto-publish.
**Fix:** Add cron configuration:
```json
{
  "crons": [
    { "path": "/api/worker/run-scheduled?token=YOUR_WORKER_SECRET", "schedule": "* * * * *" },
    { "path": "/api/worker/refresh-tokens?token=YOUR_WORKER_SECRET", "schedule": "0 3 * * *" }
  ]
}
```
Note: Vercel Hobby plan only supports 1 cron with max daily frequency. Pro plan needed for minute-level crons.

### 6. Missing security headers in Next.js config
**File:** `next.config.mjs`
**Issue:** No security headers configured (CSP, X-Frame-Options, etc.)
**Fix:** Add headers config to next.config.mjs.

## HIGH (Should fix before launch)

### 7. Settings page missing auth guard
**File:** `src/app/settings/page.tsx`
**Issue:** No redirect to /login if session is missing. Page renders skeleton then silently fails.
**Fix:** Add session check + redirect at top of useEffect, same pattern as dashboard.

### 8. Scheduler page is a dev tool exposed in production
**File:** `src/app/scheduler/page.tsx`
**Issue:** Has "Run worker now" button. Internal dev tool shouldn't be accessible.
**Fix:** Delete or add auth + role guard.

### 9. Delete account button is disabled but referenced in Terms
**File:** `src/app/settings/page.tsx`
**Issue:** Button shows but is `disabled`. Terms of Service (section 11) states users can delete their accounts. The API route (`/api/account/delete`) actually works — just the button isn't wired up.
**Fix:** Wire up the button with a confirmation dialog that calls DELETE `/api/account/delete`.

### 10. Stripe price ID fallback to empty string
**File:** `src/app/settings/page.tsx`
**Issue:** `process.env.NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID || ""` — if env not set, checkout silently fails.
**Fix:** Show error state if price IDs are missing. Ensure `NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID` and `NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID` are set in Vercel env.

### 11. No middleware for route protection
**Issue:** No `middleware.ts` exists. Each page does its own auth check client-side, which means a flash of content before redirect.
**Fix (optional):** Add middleware.ts for server-side route protection on `/dashboard`, `/uploads`, `/scheduled`, `/posted`, `/drafts`, `/calendar`, `/comments`, `/settings`.

## MEDIUM (Nice to have before launch)

### 12. Drafts "Edit" button is non-functional
**File:** `src/app/drafts/page.tsx`
**Fix:** Either wire up editing or remove the button.

### 13. No rate limiting on API routes
**Issue:** No rate limiting on any endpoint. AI suggestions, invites, uploads could be abused.
**Fix:** Add Vercel's `@vercel/kv` rate limiter or use Upstash rate limiting on sensitive endpoints.

### 14. Error states in settings are silent
**File:** `src/app/settings/page.tsx`
**Issue:** Failed API calls for team info, plan, connected accounts, and notification preferences silently fail with no user feedback.
**Fix:** Add error state displays for each section.

### 15. No LinkedIn OAuth approval mentioned
**Issue:** LinkedIn API access also requires app review for production use.
**Action:** Verify LinkedIn app is approved for production use in LinkedIn Developer Portal.

## LOW (Post-launch improvements)

### 16. Console.error statements throughout
~18 instances across settings and uploads pages. Not a security issue but should use a proper logger.

### 17. App name "Clip Dash" hardcoded everywhere
Should be centralized to a config constant.

### 18. Version number hardcoded as "v0.1.0" in settings footer
Should read from package.json.

### 19. Node engine mismatch
package.json specifies `"node": "20.x"` but system is running Node 24. Vercel likely uses 20.x which is fine, but verify.

## Launch Checklist
- [ ] Fix OAuth CSRF (item 1)
- [ ] Delete debug routes (item 2)
- [ ] Harden worker auth (item 3)
- [ ] Submit TikTok app for review (item 4) — can launch without TikTok initially
- [ ] Configure Vercel cron (item 5)
- [ ] Add security headers (item 6)
- [ ] Wire up delete account button (item 9)
- [ ] Verify all env vars set in Vercel production
- [ ] Verify Stripe webhook endpoint configured for production domain
- [ ] Verify Google OAuth redirect URI includes production domain
- [ ] Verify Facebook/Instagram/LinkedIn OAuth redirect URIs include production domain
- [ ] Verify Supabase storage bucket `clips` exists with correct policies
- [ ] Test full upload -> schedule -> auto-publish flow on production
- [ ] Verify YouTube API approval status (you mentioned waiting on this)
- [ ] Check that NEXT_PUBLIC_SITE_URL is set to production domain in Vercel
