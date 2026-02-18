# ClipDash (clipdash.org) — Project Context for Claude

**Last updated:** 2026-02-18

## Instructions for Claude

- **Always commit and push** after making code changes — the site runs on Vercel and deploys from `main`, so changes aren't live until pushed.
- When committing, use descriptive messages and include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`.
- Do not commit `.env.local` (it's gitignored). Environment variable changes for production must be set manually in Vercel Dashboard.

---

## Project Summary

ClipDash is a web app that lets creators upload video clips, schedule them, and automatically post them to multiple social platforms. The core pipeline is:

**Upload → Store → Schedule → Cron Worker → Auto-Post → Mark Posted**

The site is live at clipdash.org.

---

## Tech Stack

### Frontend
- **Next.js 14** (App Router, `app/` directory)
- **React 18**
- **TypeScript**
- **Tailwind CSS v4**

### Backend
- **Supabase** — Auth (email login), Storage (video files), Postgres database
- **Neon Postgres** — additional serverless Postgres connection (`@neondatabase/serverless`, `pg`)
- **Next.js API Routes** — all backend logic in `src/app/api/`

### Deployment
- **Vercel** — hosting (Hobby plan)
- **GitHub Actions** — cron worker (runs every minute) and token refresh

### Design
- Dark theme (`bg-[#050505]`), gradient orbs, rounded cards with `border-white/10`, emerald accents for success states
- Consistent design system across all pages

---

## Database Structure

### `uploads`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | |
| bucket | text | defaults to "uploads" |
| file_path | text | storage path in Supabase |
| created_at | timestamptz | |

### `scheduled_posts`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | |
| team_id | uuid | team-scoped |
| upload_id | uuid | FK → uploads |
| provider | text | youtube, tiktok, facebook, instagram, linkedin |
| title | text | |
| description | text | |
| privacy_status | text | private/unlisted/public (YouTube) |
| tiktok_settings | jsonb | privacy_level, allow_comments, allow_duet, allow_stitch, brand_organic_toggle, brand_content_toggle |
| scheduled_for | timestamptz | when to post |
| status | text | scheduled / posting / posted / failed / ig_processing |
| ig_container_id | text | Instagram container ID (for split upload flow) |
| ig_container_created_at | timestamptz | When IG container was created (for timeout) |
| platform_post_id | text | ID from the platform after posting |
| thumbnail_path | text | Storage path for YouTube thumbnail |
| last_error | text | error message if failed |
| posted_at | timestamptz | |

### `platform_accounts`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | |
| team_id | uuid | unique constraint on (team_id, provider) |
| provider | text | youtube, tiktok, facebook, instagram, linkedin |
| access_token | text | |
| refresh_token | text | |
| expiry | timestamptz | |
| platform_user_id | text | |
| page_id | text | Facebook Page ID |
| page_access_token | text | Facebook Page token |
| ig_user_id | text | Instagram user ID |
| profile_name | text | display name |
| avatar_url | text | profile picture |
| updated_at | timestamptz | |

### `teams`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | |
| owner_id | uuid | |
| stripe_customer_id | text | Stripe Customer ID |
| stripe_subscription_id | text | Stripe Subscription ID |
| plan | text | 'none' / 'creator' / 'team' (default: 'none') |
| plan_status | text | 'inactive' / 'trialing' / 'active' / 'past_due' / 'canceled' (default: 'inactive') |
| trial_ends_at | timestamptz | When trial expires |

### `team_members`
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | |
| team_id | uuid | |
| role | text | owner / member / admin |
| joined_at | timestamptz | |

### `team_invites`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| email | text | |
| status | text | pending/accepted |
| created_at | timestamptz | |

---

## Platform Integrations — Current Status

### YouTube — FULLY WORKING
- OAuth2 via Google (`googleapis` package)
- OAuth flow: `/api/auth/youtube/start` → Google consent → `/api/auth/youtube/callback`
- Upload: `src/lib/youtubeUpload.ts` — uses refresh_token to get access_token, uploads via YouTube Data API v3
- Supports privacy_status: private/unlisted/public

### TikTok — FULLY WORKING (UX compliance updated)
- OAuth flow: `/api/auth/tiktok/start` → TikTok consent → `/api/auth/tiktok/callback`
- Upload: `src/lib/tiktokUpload.ts` — uses TikTok Content Posting API
- Creator info API: `/api/tiktok/creator-info` — fetches nickname, privacy options, interaction flags
- Supports tiktok_settings: privacy_level, allow_comments, allow_duet, allow_stitch, brand_organic_toggle, brand_content_toggle
- **UX compliance (TikTok Required Points 1-5):**
  - Creator nickname shown in TikTok settings card header
  - Privacy options populated dynamically from creator_info (not hardcoded)
  - Comment/duet/stitch default OFF, greyed out if creator disabled them
  - Commercial content disclosure toggle with "Your Brand" / "Branded Content" checkboxes
  - Branded content disables SELF_ONLY privacy option
  - Compliance text: Music Usage Confirmation + conditional Branded Content Policy
  - Processing notice: "Content may take several minutes to appear"
  - Validation blocks scheduling if privacy not selected or commercial toggle incomplete

### Facebook — CONNECTED, needs upload testing
- OAuth flow: `/api/auth/facebook/start` → Facebook Login → `/api/auth/facebook/callback`
- OAuth is working — Facebook account connects successfully in Settings
- Uses Facebook Business Login API (no Facebook Page required for auth, but Page needed for posting)
- Scopes: `pages_manage_posts, pages_read_engagement, pages_show_list`
- Token exchange: short-lived → long-lived (~60 days) via `src/lib/facebook.ts`
- Auto-selects first Facebook Page, stores page_id + page_access_token
- Upload: `src/lib/facebookUpload.ts` — posts via `/{page_id}/videos` with signed Supabase URL
- Graph API version: v21.0
- **TODO:** Test end-to-end video upload to Facebook Page

### Instagram — FULLY WORKING
- OAuth flow: `/api/auth/instagram/start` → Instagram Business Login → `/api/auth/instagram/callback`
- Uses Instagram Business Login API with **separate Instagram App ID** (not the Facebook App ID)
- OAuth endpoint: `https://www.instagram.com/oauth/authorize` (NOT api.instagram.com)
- Scopes: `instagram_business_basic, instagram_business_content_publish`
- Token exchange: short-lived → long-lived (~60 days) via `src/lib/instagram.ts`
- Upload: `src/lib/instagramUpload.ts` — split container flow (create → poll → publish across cron ticks)
- **Supports 3 types:** Post (uploads as Reel), Reel, and Story (STORIES media_type)
- **Image Stories supported:** detects image files by extension and uses `image_url` instead of `video_url`
- Stories don't support captions (Instagram API limitation)
- Graph API: `graph.instagram.com` v21.0
- Webhook endpoint ready at `/api/webhooks/instagram` (for future analytics)

### LinkedIn — FULLY WORKING
- OAuth flow: `/api/auth/linkedin/start` → LinkedIn consent → `/api/auth/linkedin/callback`
- Scopes: `openid profile w_member_social`
- Auth helper: `src/lib/linkedin.ts` (token exchange, profile fetch, token refresh)
- Upload: `src/lib/linkedinUpload.ts` — LinkedIn Video API (initialize upload → PUT binary → create post)
- Worker support added — posts video with title + description as commentary
- LinkedIn App created, env vars set, frontend connect/disconnect in settings, platform option in uploads
- Uses LinkedIn-Version: 202402 header, personUrn format for posts

### X (Twitter) — REMOVED
- Removed from settings and uploads pages due to $100/month API cost for video uploads

---

## Webhooks

### Instagram Webhook — BUILT (for future analytics)
- **Route:** `/api/webhooks/instagram` (GET for verification, POST for events)
- **Verify token:** `clipdash_ig_webhook_2026` (or `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` env var)
- **Status:** Endpoint deployed, Meta Console webhook configuration in progress
- **Purpose:** Will receive real-time events (comments, mentions, insights) for a future analytics dashboard
- Currently just logs events — processing logic to be built later

### Facebook Webhook — BUILT (for future analytics)
- **Route:** `/api/webhooks/facebook` (GET for verification, POST for events)
- **Verify token:** `clipdash_fb_webhook_2026` (or `FACEBOOK_WEBHOOK_VERIFY_TOKEN` env var)
- Same pattern as Instagram webhook — logs events for now

---

## Worker System

- **Route:** `/api/worker/run-scheduled` (GET or POST)
- **Auth:** `WORKER_SECRET` query param (optional locally)
- **Behavior:** Pulls up to 5 due `scheduled_posts`, claims them (concurrency-safe), uploads to the correct platform based on `provider` field, marks as posted/failed
- **Cron:** Runs every minute via GitHub Actions (not Vercel cron — Hobby plan has limitations)
- **Supports:** YouTube (with optional thumbnail), TikTok, Facebook, Instagram, LinkedIn

### Token Refresh Worker
- **Route:** `/api/worker/refresh-tokens` (GET or POST)
- **Cron:** Runs daily at 3:00 AM UTC via GitHub Actions
- **Behavior:** Finds Facebook/Instagram tokens expiring within 7 days, refreshes them, updates DB
- Also refreshes Facebook Page access tokens when refreshing the user token

### Data Deletion
- **Route:** `/api/account/delete` (DELETE for authenticated users, POST for Meta callback)
- DELETE: Removes all user data (scheduled posts, uploads + storage files, platform accounts, team, auth user)
- POST: Handles Meta's data deletion callback (signed_request), returns confirmation URL per Meta requirements

---

## OAuth Architecture

1. User clicks "Connect [Platform]" in Settings
2. Frontend calls `/api/auth/{provider}/start` with Bearer token
3. Start route validates team ownership, builds consent URL with `state=userId`
4. User completes consent on platform
5. Callback route exchanges code for tokens, upserts `platform_accounts`
6. Redirects to `/settings?connected={provider}`

All OAuth flows are team-scoped — team **owners and admins** can connect/disconnect accounts. Only owners can manage billing, invites, and role assignments.

**Important Instagram note:** Instagram Business Login uses a separate Instagram App ID (not the Facebook App ID). The OAuth authorize endpoint is `www.instagram.com`, not `api.instagram.com`. The token exchange endpoint remains `api.instagram.com/oauth/access_token`.

---

## Key Files

```
src/
├── app/
│   ├── page.tsx                          # Landing page
│   ├── login/
│   │   ├── page.tsx                      # Login page
│   │   ├── LoginClient.tsx               # Login form component
│   │   └── supabaseClient.ts             # Browser Supabase client
│   ├── dashboard/page.tsx                # Main dashboard
│   ├── upload/page.tsx                   # Upload page
│   ├── scheduler/page.tsx                # Schedule posts
│   ├── uploads/page.tsx                  # View uploads
│   ├── scheduled/page.tsx                # View scheduled posts
│   ├── calendar/page.tsx                 # Calendar view (month grid, day detail)
│   ├── posted/page.tsx                   # View posted items
│   ├── drafts/page.tsx                   # Drafts
│   ├── settings/page.tsx                 # Settings (accounts, team, subscription)
│   ├── terms/page.tsx                    # Terms of service
│   ├── privacy/page.tsx                  # Privacy policy
│   ├── reset-password/page.tsx           # Password reset
│   ├── auth/callback/page.tsx            # Supabase auth callback
│   ├── layout.tsx                        # Root layout
│   └── api/
│       ├── auth/
│       │   ├── youtube/start/route.ts
│       │   ├── youtube/callback/route.ts
│       │   ├── tiktok/start/route.ts
│       │   ├── tiktok/callback/route.ts
│       │   ├── facebook/start/route.ts
│       │   ├── facebook/callback/route.ts
│       │   ├── instagram/start/route.ts
│       │   ├── instagram/callback/route.ts
│       │   ├── linkedin/start/route.ts
│       │   ├── linkedin/callback/route.ts
│       │   └── after-signup/route.ts
│       ├── account/
│       │   └── delete/route.ts             # Data deletion (user + Meta callback)
│       ├── webhooks/
│       │   ├── instagram/route.ts          # Instagram webhook (future analytics)
│       │   └── facebook/route.ts           # Facebook webhook (future analytics)
│       ├── worker/
│       │   ├── run-scheduled/route.ts      # Cron worker (every minute)
│       │   └── refresh-tokens/route.ts     # Token refresh worker (daily)
│       ├── ai/
│       │   └── suggest/route.ts              # AI hashtag suggestions (Claude Haiku)
│       ├── tiktok/
│       │   └── creator-info/route.ts      # TikTok creator info (privacy options, nickname)
│       ├── uploads/create/route.ts
│       ├── scheduled-posts/
│       │   ├── create/route.ts
│       │   └── route.ts
│       ├── platform-accounts/route.ts
│       ├── stripe/
│       │   ├── checkout/route.ts           # Create Stripe Checkout session
│       │   ├── portal/route.ts             # Create Stripe Customer Portal session
│       │   └── webhook/route.ts            # Stripe webhook handler
│       ├── team/
│       │   ├── me/route.ts
│       │   ├── invite/route.ts
│       │   ├── role/route.ts               # Update member role (admin/member)
│       │   └── plan/route.ts               # Get team plan status
│       ├── ping/route.ts
│       ├── version/route.ts
│       └── debug/force-scheduled/route.ts
├── lib/
│   ├── supabaseAdmin.ts                  # Service role client
│   ├── supabaseServer.ts                 # Server-side client
│   ├── youtube.ts                        # YouTube helpers
│   ├── youtubeUpload.ts                  # YouTube upload logic
│   ├── tiktok.ts                         # TikTok helpers
│   ├── tiktokUpload.ts                   # TikTok upload logic
│   ├── facebook.ts                       # Facebook auth helpers
│   ├── facebookUpload.ts                 # Facebook upload logic
│   ├── instagram.ts                      # Instagram auth helpers
│   ├── instagramUpload.ts               # Instagram upload logic
│   ├── linkedin.ts                       # LinkedIn auth helpers
│   ├── linkedinUpload.ts                # LinkedIn upload logic
│   ├── stripe.ts                         # Stripe client + plan helpers
│   ├── teamAuth.ts                       # Team/role auth helpers
│   └── useTeam.ts                        # Client-side team hook
```

---

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# Database
DATABASE_URL
POSTGRES_URL

# Site
NEXT_PUBLIC_SITE_URL

# Google / YouTube
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET

# TikTok
TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET

# Facebook
FACEBOOK_APP_ID
FACEBOOK_APP_SECRET

# Instagram (REQUIRED — different from Facebook credentials)
INSTAGRAM_APP_ID              # Instagram-specific App ID from Meta Console
INSTAGRAM_APP_SECRET          # Instagram-specific App Secret from Meta Console

# Instagram Webhook (optional, has default)
INSTAGRAM_WEBHOOK_VERIFY_TOKEN  # defaults to "clipdash_ig_webhook_2026"

# LinkedIn
LINKEDIN_CLIENT_ID
LINKEDIN_CLIENT_SECRET

# Facebook Webhook (optional, has default)
FACEBOOK_WEBHOOK_VERIFY_TOKEN   # defaults to "clipdash_fb_webhook_2026"

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_CREATOR_PRICE_ID
STRIPE_TEAM_PRICE_ID
NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID   # client-side access for checkout button
NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID      # client-side access for checkout button

# AI Suggestions
ANTHROPIC_API_KEY              # Claude API key for AI hashtag suggestions

# Worker
WORKER_SECRET
CRON_SECRET

# Auth
OAUTH_STATE_SECRET

# Vercel
VERCEL_OIDC_TOKEN
```

---

## Current Goals

### Completed
- Instagram OAuth fully working — posts as Reels, Stories, and image Stories
- Facebook OAuth + video posting working
- YouTube OAuth + video posting working (with thumbnail support on frontend + backend)
- TikTok OAuth + video posting working
- LinkedIn full stack — OAuth, upload lib, worker, settings connect/disconnect, platform option in uploads
- Stripe integration built, tested, and switched to live mode
- Calendar view with platform color coding and day detail panel
- Upload + scheduling gating (requires active subscription)
- Cancel button on scheduled posts
- Facebook webhook endpoint built
- Token refresh cron job (daily, refreshes FB/IG tokens expiring within 7 days)
- Data deletion endpoint (for users + Meta app review compliance)
- AI-powered hashtag suggestions (Claude Haiku) with context prompt and selectable tags
- X (Twitter) removed from all pages (API too expensive for video)
- TikTok UX compliance for Direct Post API (creator info, dynamic privacy, commercial disclosure, compliance text)

### Future (Post-Launch)
1. **Multi-account YouTube support** — Let users link multiple YouTube channels and pick which one to post to when scheduling. Requires: relax `(team_id, provider)` unique constraint on `platform_accounts`, add `platform_account_id` column to `scheduled_posts`, account picker UI on upload page, update worker to load credentials by `platform_account_id` instead of `team_id + provider`
2. Analytics dashboard (Instagram webhook endpoint already deployed)
3. Email notifications
4. AI caption/description generator (expand beyond hashtags)
5. **Multi-page Facebook support** — Let users pick which Page to post to if they manage multiple
6. **Scheduled post editing** — Allow editing title/description/time before posting
7. **Multi-team support** — Scrapped for initial launch (keep product simple). May revisit later for editor workflows.

---

## Quick Wins / Low-Effort High-Value Tasks

These are small tasks that can be knocked out quickly to improve the product:

- [x] **Add Facebook webhook endpoint** — Built at `/api/webhooks/facebook`
- [x] **Token refresh cron job** — Built at `/api/worker/refresh-tokens`, runs daily via GitHub Actions
- [ ] **Add error toast notifications** — Replace `alert()` calls in settings page with proper toast UI
- [x] **Subscription plan enforcement** — Plan gating implemented: scheduling blocked without active plan, team invites blocked on Creator plan
- [ ] **Add `SITE_URL` env var to Vercel** — The code checks `SITE_URL` first before `NEXT_PUBLIC_SITE_URL`. Setting `SITE_URL=https://clipdash.org` in Vercel avoids relying on the public env var for server-side OAuth redirects
- [x] **Build full LinkedIn integration** — Fully complete: backend + frontend (settings + uploads)
- [ ] **Improve worker error logging** — Add structured logging or Sentry integration for failed uploads to diagnose issues faster
- [x] **Add a data deletion endpoint** — Built at `/api/account/delete` (DELETE for users, POST for Meta callback)
- [ ] **Multi-page Facebook support** — Currently auto-selects first Page. Add UI to let users pick which Page to post to if they manage multiple
- [ ] **Scheduled post editing** — Allow editing title/description/time of scheduled posts before they're posted
- [x] **LinkedIn settings UI** — Connect/disconnect button in settings page
- [x] **LinkedIn platform option in uploads** — LinkedIn added to platform picker
- [x] **YouTube thumbnail frontend** — Thumbnail picker uploads to storage, passes `thumbnail_path` when scheduling
- [x] **AI hashtag suggestions** — Claude Haiku-powered tag suggestions with context prompt and selectable chips

---

## Architecture Notes

- All platform accounts are **team-scoped** (keyed on `team_id + provider`)
- Team **owners and admins** can connect/disconnect platform accounts; only owners can manage billing/invites/roles
- The worker uses **concurrency-safe claiming** (atomic status update + row count check)
- Video files are stored in Supabase Storage and accessed via **signed URLs** for platform uploads
- Facebook uses **Page Access Tokens** (not user tokens) for posting
- Instagram uses a **split Reels container** flow to work within Vercel Hobby's 10s timeout:
  1. Worker creates container → sets status to `ig_processing` with `ig_container_id` and `ig_container_created_at`
  2. Next cron tick(s) poll container status via `checkAndPublishInstagramContainer()`
  3. When `FINISHED` → publishes and marks `posted`. If >10 min → marks `failed` with timeout error
  - Each step completes in 2-3 seconds. Total flow takes 1-5 minutes across multiple cron runs
- Instagram Business Login uses a **separate App ID and Secret** from the Facebook app — must be set via `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`
- **Stripe integration** uses Checkout Sessions (hosted by Stripe) — no client-side Stripe.js needed
  - Two plans: Creator ($9.99/mo, 1 member) and Team ($19.99/mo, up to 5 members), both with 7-day free trials
  - Plans are team-scoped (one subscription per team)
  - Webhook at `/api/stripe/webhook` handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
  - Plan gating: scheduling posts requires `plan_status` of `trialing` or `active`; team invites require `plan === 'team'`
  - Self-serve billing via Stripe Customer Portal at `/api/stripe/portal`
- **AI Hashtag Suggestions** use Claude Haiku (`claude-haiku-4-5-20251001`) via `@anthropic-ai/sdk`
  - User provides optional context ("What's this video about?") for better relevance
  - Returns 10-15 tags with reasons, mix of high-volume, medium-niche, and long-tail
  - Platform-specific optimization (YouTube SEO, TikTok FYP, IG explore, LinkedIn feed, Facebook reach)
  - Tags shown as selectable purple chips — users pick which ones to add
- **Vercel Hobby plan limitations:** Cannot use `vercel.json` crons on Hobby plan (causes build failures). All cron scheduling done via GitHub Actions workflows instead

---

## Session Log (2026-02-13)

### Completed
- Fixed Instagram OAuth endpoint: changed from `api.instagram.com` to `www.instagram.com/oauth/authorize`
- Added `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` env vars (separate from Facebook credentials)
- Changed "Overdue" label to "Posting soon..." with amber color on scheduled posts page
- Built Instagram webhook endpoint at `/api/webhooks/instagram` for future analytics
- Created this `CLAUDE_CONTEXT.md` file
- Instagram OAuth fully working — users can connect Instagram accounts
- Added "Business or Creator account required" hint for Instagram in settings
- Facebook posting tested and confirmed working (video posted to Facebook Page)
- Changed Meta app display name to ClipDash.org for attribution on Facebook posts
- Removed Switch account button for Instagram (force_authentication not supported by Business Login API)

### Stripe Integration Built
- Two paid tiers: Creator ($9.99/mo) and Team ($19.99/mo), both with 7-day free trials
- **DB migration needed:** Run in Supabase SQL editor:
  ```sql
  ALTER TABLE teams ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
  ALTER TABLE teams ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
  ALTER TABLE teams ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'none';
  ALTER TABLE teams ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'inactive';
  ALTER TABLE teams ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
  ```
- **Stripe Dashboard setup needed:** Create Products/Prices, webhook endpoint, Customer Portal config
- **Vercel env vars needed:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_CREATOR_PRICE_ID`, `STRIPE_TEAM_PRICE_ID`, `NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID`, `NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID`
- API routes: `/api/stripe/checkout`, `/api/stripe/portal`, `/api/stripe/webhook`, `/api/team/plan`
- Plan gating: scheduling requires active plan; team invites require Team plan
- Settings page: dynamic plan picker / subscription display
- Landing page: updated from 3 tiers to 2 tiers (Creator + Team)
- Uploads page: shows subscribe banner when no active plan

### Session 2 Progress (2026-02-13)
- Updated Stripe pricing to $9.99/mo Creator and $19.99/mo Team
- Stripe tested end-to-end in test mode (checkout, webhook, plan updates, portal, cancel all working)
- Added cancel button to scheduled posts page (with remove button for failed posts)
- Built calendar view at `/calendar` — month grid with platform color-coded posts, clickable day detail panel
- Added calendar link from dashboard and scheduled page
- Added upload gating — uploads blocked without active plan (API + client-side)
- Instagram Story support: users can choose Post, Reel, or Story when scheduling
- Instagram image Story support: detects image files and uses `image_url` instead of `video_url`
- Wider calendar layout with taller day cells and platform legend on side panel
- `scheduled_posts` now has `instagram_settings` jsonb column with `ig_type` field (post/reel/story)

### Session 3 (2026-02-14) — Full Stack Sprint

#### Backend (early session)
- **LinkedIn integration (backend):** OAuth start/callback routes, auth helper lib (`linkedin.ts`), video upload lib (`linkedinUpload.ts`), worker support
- **YouTube thumbnail upload (backend):** `scheduled-posts/create` API accepts `thumbnail_path`, worker passes it to YouTube upload, `youtubeUpload.ts` sets thumbnail via `youtube.thumbnails.set()` after video upload (gracefully fails if channel not verified)
- **Facebook webhook endpoint:** `/api/webhooks/facebook` — same pattern as Instagram webhook
- **Token refresh cron job:** `/api/worker/refresh-tokens` — refreshes Facebook/Instagram tokens expiring within 7 days, runs daily at 3 AM UTC
- **Data deletion endpoint:** `/api/account/delete` — DELETE for authenticated users (full account wipe), POST for Meta's data deletion callback (signed_request)

#### Frontend (mid session)
- **LinkedIn settings UI:** Connect/disconnect button in settings page, LinkedIn SVG icon, banner on connect
- **LinkedIn uploads UI:** Added LinkedIn as selectable platform (3000 char limit)
- **YouTube thumbnail wiring:** Moved thumbnail upload from `doUpload()` to `handleSchedule()` — fixed bug where thumbnail was always null because user picks it on the details step AFTER video upload
- **AI hashtag suggestions:** Built `/api/ai/suggest` route using Claude Haiku, "Suggest Tags" button in uploads page, "What's this video about?" context prompt, selectable purple chips with reasons, "Add all" and individual add buttons

#### Fixes & Issues Resolved
- **TypeScript errors:** Missing `linkedin` in accounts state objects (4 separate instances with different formatting)
- **YouTube thumbnail not applying:** Was uploading in `doUpload()` but thumbnail selected after on details step — moved to `handleSchedule()`
- **Vercel deployments failing:** `vercel.json` crons incompatible with Hobby plan — emptied to `{}` since GitHub Actions already handles cron
- **AI suggestions "not configured" error:** User needed to redeploy Vercel after setting `ANTHROPIC_API_KEY` env var

#### Manual Steps Completed by User
- Created LinkedIn App in LinkedIn Developer Portal (Privately held org type)
- Requested "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect" products
- Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in Vercel
- Set `ANTHROPIC_API_KEY` in Vercel
- Switched Stripe to live mode
- Ran DB migration: `ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;`

#### X (Twitter) Removed
- Removed from settings page (ProviderKey, PLATFORMS array, accounts state)
- Removed from uploads page (platform picker)
- Decision: $100/month Twitter API cost for video uploads is not worth it

### Session 4 (2026-02-16) — Admin Role + Stripe Live Mode

#### Admin Role System
- Added "admin" role to `team_members` (migration: `20260216_admin_role.sql`)
- New `requireOwnerOrAdmin()` helper in `teamAuth.ts`
- All platform connect/disconnect routes now allow admin (11 route files updated)
- New `/api/team/role` POST endpoint — owner can promote/demote members between admin and member
- Settings page: admin badge on admin members, promote/demote buttons for owner, connect/disconnect visible for admins
- Owner-only routes unchanged: `team/invite`, `stripe/checkout`, `stripe/portal`

#### Stripe Live Mode Migration
- Switched from test mode to live mode
- Cleared stale test-mode `stripe_customer_id` from teams table
- Created live mode products/prices in Stripe Dashboard
- Updated Vercel env vars: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID`, `NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID` to live mode values
- Configured Stripe Customer Portal in live mode
- Cleaned up orphaned team for duplicate owner

### Session 5 (2026-02-17) — Multi-Team Scrapped + Launch Audit

#### Multi-Team Feature — SCRAPPED
- Implemented full multi-team support (team switcher, create team, rename team, `x-team-id` header, localStorage persistence)
- User decided to scrap it: "I want to ship a simple product" — multi-team adds complexity and billing issues (subscriptions are per-team)
- All changes reverted via `git checkout`, new API routes deleted
- Test team deleted from database
- Decision: keep single-team model for launch; revisit multi-team post-launch if needed

#### Launch Readiness Audit
- Full security + frontend + config audit performed
- Findings documented in "LAUNCH CHECKLIST" section below

---

## LAUNCH CHECKLIST — Must Complete Before Thursday Launch

### CRITICAL (blocks launch)

1. **Delete debug/test routes**
   - `src/app/api/debug/force-scheduled/route.ts` — has hardcoded userId, bypasses auth
   - `src/app/api/youtube/test-upload/route.ts` — test upload endpoint
   - Delete these files entirely

2. **Fix OAuth CSRF vulnerability**
   - All OAuth start routes use `state=userId` (raw user ID) — attacker can forge this
   - Fix: generate a random token, store in a short-lived DB/cache table mapping `token → userId`, pass token as `state`, validate in callback
   - Or: use HMAC — `state = userId + "." + HMAC(userId, OAUTH_STATE_SECRET)`, verify in callback
   - Affected files: all `/api/auth/*/start/route.ts` and `/api/auth/*/callback/route.ts`

3. **Fix worker auth bypass**
   - `src/app/api/worker/run-scheduled/route.ts` line: `if (!expected) return;` — if `WORKER_SECRET` env var is unset, auth check is silently skipped
   - Fix: if `WORKER_SECRET` is not set, return 500 error instead of silently skipping
   - Same issue in `refresh-tokens/route.ts`

4. **TikTok Content Posting API approval**
   - TikTok `video.publish` scope requires app review approval
   - Must apply at TikTok Developer Portal → App Review → Content Posting API
   - Without this, TikTok uploads will fail for any user
   - YouTube also needs Google API approval (user is waiting on this)

5. **Verify Vercel cron / GitHub Actions are running**
   - The worker (`run-scheduled`) and token refresh (`refresh-tokens`) need to run on schedule
   - Confirm GitHub Actions workflows are enabled and running correctly
   - Without this, scheduled posts will never publish

### HIGH PRIORITY (should fix before launch)

6. **Move webhook verify tokens to env vars only**
   - `src/app/api/webhooks/facebook/route.ts` and `instagram/route.ts` have hardcoded fallback tokens (`clipdash_fb_webhook_2026`, `clipdash_ig_webhook_2026`)
   - Remove hardcoded fallbacks — require env vars in production

7. **Add security headers**
   - `next.config.mjs` has no security headers
   - Add: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 1; mode=block`

8. **Settings page auth guard**
   - Settings page fetches data client-side but doesn't redirect unauthenticated users
   - Add auth check on mount — redirect to `/login` if no session

9. **Enable "Delete Account" button**
   - Settings page has a disabled "Delete Account" button but Terms of Service references it
   - Either enable it (the API endpoint `/api/account/delete` already works) or remove from Terms

### MEDIUM PRIORITY (fix soon after launch)

10. **Add rate limiting to auth endpoints**
    - Login, signup, OAuth start routes have no rate limiting
    - Consider Vercel Edge Middleware or `upstash/ratelimit`

11. **Add error toast notifications**
    - Replace `alert()` calls in settings page with proper toast UI

12. **Facebook end-to-end upload test**
    - Facebook is marked "needs upload testing" — verify video posts work in production

13. **Add `SITE_URL` env var to Vercel**
    - Set `SITE_URL=https://clipdash.org` to avoid relying on `NEXT_PUBLIC_SITE_URL` for server-side OAuth redirects

14. **Worker error logging**
    - Add structured logging or Sentry for failed uploads to diagnose production issues

---

### Session 6 (2026-02-18) — TikTok UX Compliance

#### TikTok Direct Post API — UX Compliance (Required Points 1-5)
TikTok rejected the app review because the UX didn't meet their Required UX Implementation guidelines. All 5 points addressed:

**New file: `src/app/api/tiktok/creator-info/route.ts`**
- Calls TikTok's `/v2/post/publish/creator_info/query/` endpoint
- Returns: creator nickname, available privacy_level_options, comment/duet/stitch disabled flags, max video duration
- Auth via `getTeamContext(req)`, refreshes access token if needed

**Backend changes (`src/lib/tiktokUpload.ts`):**
- Added `brandOrganicToggle` and `brandContentToggle` to upload args and `post_info`
- Fixed `title.slice(0, 150)` → `title.slice(0, 2200)` (TikTok allows 2200 chars)
- Removed `description` from `post_info` (TikTok API has no separate description field)
- Changed defaults: `allowComments/Duet/Stitch` now default to `false`

**Worker changes (`src/app/api/worker/run-scheduled/route.ts`):**
- Passes `brandOrganicToggle` and `brandContentToggle` from `tiktok_settings`
- Removed `description` param from TikTok upload call
- Changed fallback defaults to `false` for comments/duet/stitch

**Frontend changes (`src/app/uploads/page.tsx`):**
- Point 1 (Creator info): Shows TikTok nickname in settings card header
- Point 2 (Privacy options): Dropdown populated from creator_info `privacy_level_options`, not hardcoded
- Point 3 (Interaction defaults): Comment/duet/stitch default OFF, greyed out if creator disabled
- Point 4 (Commercial disclosure): Toggle + "Your Brand" / "Branded Content" checkboxes; branded content disables SELF_ONLY privacy
- Point 5 (Compliance text): Music Usage Confirmation link, conditional Branded Content Policy link, processing notice
- Validation: blocks scheduling if privacy not selected or commercial toggle on with no checkbox selected
- `tiktok_settings` payload now includes `brand_organic_toggle` and `brand_content_toggle`

**Settings page changes (`src/app/settings/page.tsx`):**
- TikTok defaults updated: privacy fallback `""` (user must select), comments/duet/stitch fallback `false`
- Added "No default (user must select)" option for privacy dropdown
- Added note about dynamic privacy options

---

### PICK UP HERE NEXT SESSION

**Launch target: Thursday night (2026-02-20), pending YouTube API approval**

Priority order:
1. Re-submit TikTok app for Content Posting API review (UX compliance now implemented)
2. Delete debug routes (5 min)
3. Fix OAuth CSRF — use HMAC-signed state param (30 min)
4. Fix worker auth bypass (5 min)
5. Add security headers to `next.config.mjs` (10 min)
6. Remove hardcoded webhook tokens (5 min)
7. Add settings page auth guard (10 min)
8. Enable Delete Account button (15 min)
9. Verify GitHub Actions crons are running (manual check)
10. Test full end-to-end flow: signup → subscribe → upload → schedule → auto-post

### Key Decisions Made
- NOT upgrading Vercel to Pro ($20/mo) — splitting the worker instead to stay on Hobby plan
- **Multi-team SCRAPPED** — keeping single-team model for simplicity at launch
- Instagram API only supports Business/Creator accounts for posting (no personal accounts)
- Instagram "Post" option actually uploads as a Reel (Instagram converts all video to Reels) — gives users the feeling of choice
- Instagram Stories: uses STORIES media_type, supports both video and images, no captions
- Supabase Pro ($25/mo) will be needed eventually for the 50MB upload limit (Pro = 5GB)
- Plan to add auto-delete of posted videos after 7 days to manage storage
- Stripe pricing: $9.99/mo Creator (1 member), $19.99/mo Team (up to 5 members), both with 7-day free trials
- Plan gating blocks both uploads and scheduling (not just scheduling)
- X (Twitter) removed — $100/month API cost for video is not viable
- Vercel crons don't work on Hobby plan — use GitHub Actions for all cron jobs
- AI suggestions use separate Anthropic API billing (not Claude Pro subscription credits)
- TikTok Content Posting API requires app review approval (`video.publish` scope)
