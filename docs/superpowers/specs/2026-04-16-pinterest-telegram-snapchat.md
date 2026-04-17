# Pinterest, Telegram, and Snapchat Integrations

**Date:** 2026-04-16  
**Status:** Approved

## Overview

Add Pinterest and Telegram as fully wired publishing platforms. Build all Snapchat infrastructure (OAuth, upload lib, worker handler) without wiring it into any UI. All three follow existing ClipDash patterns exactly.

---

## Pinterest

### OAuth Flow
- `src/app/api/auth/pinterest/start/route.ts` — GET+POST, calls `generateOAuthState(userId)`, redirects to Pinterest OAuth with scopes `boards:read,pins:write,user_accounts:read`
- `src/app/api/auth/pinterest/callback/route.ts` — `verifyOAuthState(state)` → userId, looks up team, checks owner/admin, exchanges code for token, fetches `/v5/user_account`, upserts `platform_accounts` with `onConflict: "team_id,provider,platform_user_id"`, redirects to `/settings?connected=pinterest` (or `/onboarding?connected=pinterest` if onboarding cookie set)

### Board Selector API
- `src/app/api/pinterest/boards/route.ts` — GET, `getTeamContext`, fetches team's Pinterest `platform_accounts` row, calls `GET /v5/boards?page_size=50` with access token, returns `[{ id, name }]`

### Upload Library
- `src/lib/pinterestUpload.ts` — `pinterestUpload(post, account)` function:
  1. `POST /v5/media` to register video upload, returns `media_id` + signed upload URL
  2. PUT video bytes to signed URL (using Supabase `createSignedUrl` to stream)
  3. Poll `GET /v5/media/{media_id}` until `status === "succeeded"` (max 60 attempts, 5s apart)
  4. `POST /v5/pins` with `{ title, description, board_id, media_source: { media_id } }`
  5. Returns `{ platform_post_id: pin.id }`

### Worker Integration
- `src/app/api/worker/run-scheduled/route.ts` — add `else if (provider === "pinterest")` case calling `pinterestUpload()`. Reads `pinterest_settings.board_id` from the scheduled post.

### Settings UI
- `src/app/settings/page.tsx` — Pinterest section in Connections tab: "Connect Pinterest" button (calls `/api/auth/pinterest/start`), shows connected account label + avatar with "Disconnect" button (DELETE `/api/platform-accounts?provider=pinterest`). Same pattern as LinkedIn.

### Uploads UI
- `src/app/uploads/page.tsx`:
  - Add `"pinterest"` to `ProviderKey` union type
  - Add Pinterest to platform list with checkbox
  - When Pinterest is checked: render a `<select>` board dropdown. Fetch boards from `/api/pinterest/boards` once on mount when a Pinterest account is connected. Store selected `board_id` in per-platform settings state.
  - Include `pinterest_settings: { board_id }` in scheduled post creation body

### Database
- `supabase/migrations/20260416_pinterest_settings.sql`:
  ```sql
  ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS pinterest_settings JSONB;
  ```

### New Env Vars
- `PINTEREST_CLIENT_ID`
- `PINTEREST_CLIENT_SECRET`

---

## Telegram

### Manual Connect Flow (no OAuth)
- `src/app/api/auth/telegram/connect/route.ts` — POST `{ botToken, channelId, label }`:
  1. `getTeamContext`, requireOwnerOrAdmin
  2. Call Telegram `getMe` API to validate bot token
  3. Call Telegram `getChat` API to validate channel ID and get chat title
  4. Upsert to `platform_accounts`: `provider = "telegram"`, `platform_user_id = channelId`, `access_token = botToken`, `label = label || chat.title`
  5. Return `{ ok: true, account: { ... } }`

### Upload Library
- `src/lib/telegramUpload.ts` — `telegramUpload(post, account)` function:
  1. Get Supabase signed URL for the video file
  2. Call `POST https://api.telegram.org/bot{token}/sendVideo` with `{ chat_id: channelId, video: signedUrl, caption: title + description }`
  3. Returns `{ platform_post_id: message.message_id.toString() }`

### Worker Integration
- `src/app/api/worker/run-scheduled/route.ts` — add `else if (provider === "telegram")` case calling `telegramUpload()`

### Settings UI
- `src/app/settings/page.tsx` — Telegram section in Connections tab:
  - Form with inputs: Bot Token, Channel ID (e.g. `@mychannel` or `-100123456`), Label (optional)
  - "Add Channel" button calling POST `/api/auth/telegram/connect`
  - List of connected channels, each with label + disconnect button (DELETE `/api/platform-accounts` by account id)
  - Supports multiple channel/bot combos (same multi-account pattern as YouTube)

### Uploads UI
- `src/app/uploads/page.tsx`:
  - Add `"telegram"` to `ProviderKey`
  - Add Telegram to platform list — when multiple channels connected, show per-channel checkboxes (same as YouTube multi-account pattern)
  - No special settings JSONB needed (caption derived from title + description)

### No New Env Vars
Bot tokens are stored per-account in `platform_accounts.access_token`.

---

## Snapchat (infrastructure only — no UI wiring)

### OAuth Flow
- `src/app/api/auth/snapchat/start/route.ts` — GET+POST, `generateOAuthState(userId)`, redirects to Snapchat OAuth with scopes `snapchat-marketing-api`
- `src/app/api/auth/snapchat/callback/route.ts` — `verifyOAuthState(state)`, exchange code, fetch profile, upsert `platform_accounts`. Redirects to `/settings?connected=snapchat` but since no settings UI exists, this URL param is simply ignored.

### Upload Library
- `src/lib/snapchatUpload.ts` — `snapchatUpload(post, account)` function:
  - Handles both `Spotlight` and `Stories` post types (determined by `snapchat_settings.post_type` on the scheduled post, defaults to `"spotlight"`)
  - Uses Snapchat Marketing API: upload video media → create snap
  - Returns `{ platform_post_id }`

### Worker Integration
- `src/app/api/worker/run-scheduled/route.ts` — add `else if (provider === "snapchat")` case calling `snapchatUpload()`. Since no UI sets `provider = "snapchat"`, this case never fires in practice.

### No Settings UI, No Uploads UI, No DB Migration
Snapchat is entirely non-user-facing until a future activation sprint.

### New Env Vars
- `SNAPCHAT_CLIENT_ID`
- `SNAPCHAT_CLIENT_SECRET`

---

## Implementation Order

1. DB migration (Pinterest settings column)
2. Pinterest OAuth start + callback
3. Pinterest boards API
4. `pinterestUpload.ts`
5. Worker: Pinterest case
6. Settings UI: Pinterest connect
7. Uploads UI: Pinterest checkbox + board selector
8. Telegram connect endpoint
9. `telegramUpload.ts`
10. Worker: Telegram case
11. Settings UI: Telegram multi-channel form
12. Uploads UI: Telegram checkboxes
13. Snapchat OAuth start + callback
14. `snapchatUpload.ts`
15. Worker: Snapchat dead case
