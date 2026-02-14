# ClipDash (clipdash.org) — Project Context for Claude

**Last updated:** 2026-02-13

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
- **Vercel** — hosting + cron jobs

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
| provider | text | youtube, tiktok, facebook, instagram |
| title | text | |
| description | text | |
| privacy_status | text | private/unlisted/public (YouTube) |
| tiktok_settings | jsonb | privacy_level, allow_comments, etc. |
| scheduled_for | timestamptz | when to post |
| status | text | scheduled / posting / posted / failed / ig_processing |
| ig_container_id | text | Instagram container ID (for split upload flow) |
| ig_container_created_at | timestamptz | When IG container was created (for timeout) |
| platform_post_id | text | ID from the platform after posting |
| last_error | text | error message if failed |
| posted_at | timestamptz | |

### `platform_accounts`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | |
| team_id | uuid | unique constraint on (team_id, provider) |
| provider | text | youtube, tiktok, facebook, instagram |
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
| role | text | owner / member |
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

### TikTok — FULLY WORKING
- OAuth flow: `/api/auth/tiktok/start` → TikTok consent → `/api/auth/tiktok/callback`
- Upload: `src/lib/tiktokUpload.ts` — uses TikTok Content Posting API
- Supports tiktok_settings (privacy_level, allow_comments, allow_duet, allow_stitch)

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

### LinkedIn — NOT STARTED (NEXT PRIORITY)
- Goal: Add LinkedIn as a posting platform (video + text posts)
- Same pattern as other integrations: OAuth start/callback, upload lib, worker support
- Will need: LinkedIn App in LinkedIn Developer Portal, OAuth 2.0, `w_member_social` scope
- Listed in settings UI as "Coming soon" (to be implemented)

### X (Twitter) — NOT STARTED
- Listed in settings UI as "Coming soon"

---

## Webhooks

### Instagram Webhook — BUILT (for future analytics)
- **Route:** `/api/webhooks/instagram` (GET for verification, POST for events)
- **Verify token:** `clipdash_ig_webhook_2026` (or `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` env var)
- **Status:** Endpoint deployed, Meta Console webhook configuration in progress
- **Purpose:** Will receive real-time events (comments, mentions, insights) for a future analytics dashboard
- Currently just logs events — processing logic to be built later

---

## Worker System

- **Route:** `/api/worker/run-scheduled` (GET or POST)
- **Auth:** `WORKER_SECRET` query param (optional locally)
- **Behavior:** Pulls up to 5 due `scheduled_posts`, claims them (concurrency-safe), uploads to the correct platform based on `provider` field, marks as posted/failed
- **Cron:** Runs every minute via Vercel cron

---

## OAuth Architecture

1. User clicks "Connect [Platform]" in Settings
2. Frontend calls `/api/auth/{provider}/start` with Bearer token
3. Start route validates team ownership, builds consent URL with `state=userId`
4. User completes consent on platform
5. Callback route exchanges code for tokens, upserts `platform_accounts`
6. Redirects to `/settings?connected={provider}`

All OAuth flows are team-scoped — only team owners can connect/disconnect accounts.

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
│       │   └── after-signup/route.ts
│       ├── webhooks/
│       │   └── instagram/route.ts        # Instagram webhook (future analytics)
│       ├── worker/run-scheduled/route.ts # Cron worker
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

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_CREATOR_PRICE_ID
STRIPE_TEAM_PRICE_ID
NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID   # client-side access for checkout button
NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID      # client-side access for checkout button

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

### In Progress
1. **Switch Stripe to live mode** — Create live Products/Prices, webhook endpoint, swap env vars in Vercel
2. **LinkedIn integration** — Add as a new platform for users to post to (OAuth + upload, same pattern as other integrations)

### Completed
- Instagram OAuth fully working — posts as Reels, Stories, and image Stories
- Facebook OAuth + video posting working
- YouTube OAuth + video posting working
- TikTok OAuth + video posting working
- Stripe integration built and tested — two paid tiers with 7-day free trials, plan gating, webhook handling
- Calendar view with platform color coding and day detail panel
- Upload + scheduling gating (requires active subscription)
- Cancel button on scheduled posts

### Future
3. X (Twitter) integration
4. Analytics dashboard (Instagram webhook endpoint already deployed)
5. Email notifications
6. AI caption/description generator

---

## Quick Wins / Low-Effort High-Value Tasks

These are small tasks that can be knocked out quickly to improve the product:

- [ ] **Add Facebook webhook endpoint** — Same pattern as Instagram webhook (`/api/webhooks/facebook`), will support future analytics for Facebook Pages
- [ ] **Token refresh cron job** — Facebook/Instagram long-lived tokens expire after ~60 days. Build a scheduled job to refresh them before expiry (libraries already exist: `refreshFacebookToken`, `refreshInstagramToken`)
- [ ] **Add error toast notifications** — Replace `alert()` calls in settings page with proper toast UI
- [x] **Subscription plan enforcement** — Plan gating implemented: scheduling blocked without active plan, team invites blocked on Creator plan
- [ ] **Add `SITE_URL` env var to Vercel** — The code checks `SITE_URL` first before `NEXT_PUBLIC_SITE_URL`. Setting `SITE_URL=https://clipdash.org` in Vercel avoids relying on the public env var for server-side OAuth redirects
- [ ] **Build full LinkedIn integration** — OAuth start/callback + upload lib + worker support, next platform priority
- [ ] **Improve worker error logging** — Add structured logging or Sentry integration for failed uploads to diagnose issues faster
- [ ] **Add a data deletion endpoint** — Privacy policy page links to `/privacy` for data deletion but there's no actual deletion flow. Required for Meta app review
- [ ] **Multi-page Facebook support** — Currently auto-selects first Page. Add UI to let users pick which Page to post to if they manage multiple
- [ ] **Scheduled post editing** — Allow editing title/description/time of scheduled posts before they're posted

---

## Architecture Notes

- All platform accounts are **team-scoped** (keyed on `team_id + provider`)
- Only team **owners** can connect/disconnect platform accounts
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

### PICK UP HERE NEXT SESSION
- **Switch Stripe to live mode** — create live Products/Prices/Webhook in Stripe Dashboard, update Vercel env vars
- **Build LinkedIn integration** — next platform to add

### Key Decisions Made
- NOT upgrading Vercel to Pro ($20/mo) — splitting the worker instead to stay on Hobby plan
- Instagram API only supports Business/Creator accounts for posting (no personal accounts)
- Instagram "Post" option actually uploads as a Reel (Instagram converts all video to Reels) — gives users the feeling of choice
- Instagram Stories: uses STORIES media_type, supports both video and images, no captions
- Supabase Pro ($25/mo) will be needed eventually for the 50MB upload limit (Pro = 5GB)
- Plan to add auto-delete of posted videos after 7 days to manage storage
- Stripe pricing: $9.99/mo Creator (1 member), $19.99/mo Team (up to 5 members), both with 7-day free trials
- Plan gating blocks both uploads and scheduling (not just scheduling)
