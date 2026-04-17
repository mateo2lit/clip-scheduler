# Video Overlay Editor — Spec

**Date:** 2026-04-06
**Status:** Approved for implementation

## Overview

Add an optional "Enhance Video" panel to the regular upload flow (details step) that lets users burn captions, title cards, text overlays, and image overlays (logos, watermarks) directly into their video before scheduling. Uses the same GitHub Actions / FFmpeg infrastructure as AI Clips burn.

## User Flow

1. User uploads video → reaches the details step as normal
2. An "Enhance Video" section is collapsed by default at the bottom of the details form
3. User expands it → sees a live CSS preview pane + controls for captions, title, text layers, image layers
4. User configures overlays → preview updates in real time
5. User clicks "Burn & Schedule" → dispatches `overlay-burn.yml` GitHub Actions workflow
6. Polling UI shows burn progress (transcribing → burning → done)
7. On completion a new `uploads` row is created for the burned video
8. Scheduling continues with the burned video as the active upload

If user skips the panel entirely, scheduling proceeds with the original upload unchanged.

## UI: Enhance Video Panel

Lives in `src/app/uploads/page.tsx` on the details step, below the existing platform/scheduling controls. Collapsed by default. Two tabs inside:

### Captions Tab
- Enable/disable toggle
- Reuses `SubtitleStylePicker` component from `src/components/ai-clips/SubtitleStylePicker.tsx` exactly as-is
- Preview shows a static sample frame (first few words highlighted) — animated karaoke not simulated

### Overlays Tab
Layered list of overlay elements. Users can add multiple of any type:

**Title layer** (add one)
- Text input, position top/bottom, font family, font size, text color, bold toggle
- Optional background box: color + opacity slider
- Optional stroke: color + width

**Text layer** (add many)
- Text input, x/y position (drag handle on preview OR numeric input 0–100%), font, size, color, bold, background

**Image layer** (add many)
- "From saved assets" dropdown (team's brand_assets) OR "Upload image" (PNG/JPG, uploaded to Supabase Storage, optionally saved to brand assets)
- x/y position, width (height auto-scales), drag handle on preview

### Live CSS Preview Pane
- Shows video thumbnail as background (use existing thumbnail_path if available, else black frame)
- All overlay elements rendered as absolutely-positioned HTML elements on top
- Font sizes scaled by `previewHeight / videoPlayResY` to match FFmpeg output
- Positions use `left: x*100%`, `top: y*100%` matching FFmpeg `W*x`/`H*y` coords
- Same Google Fonts loaded (Montserrat, Oswald, Anton, Bebas Neue, Poppins, Rubik)
- Drag handles on image and text layers to reposition (updates x/y fractions)
- Subtitle sample: static text block at configured position with first group of sample words, active word highlighted
- Stroke approximated via CSS `-webkit-text-stroke` (visually close, not pixel-identical)

### Burn & Schedule Button
- Replaces normal "Schedule" button when the panel is active with overlays configured
- Shows a progress indicator during burn (polling every 2.5s):
  - `pending` → Queued
  - `transcribing` → Transcribing audio… (only shown if captions enabled)
  - `burning` → Burning overlays…
  - `done` → Ready
  - `failed` → Error message with retry option

## Data Model

### New table: `brand_assets`
```sql
id          uuid primary key default gen_random_uuid()
team_id     uuid references teams(id) on delete cascade
name        text not null
file_path   text not null
file_size   bigint not null default 0
created_at  timestamptz not null default now()
```
Counts toward team active storage. No hard cap on count.

### New table: `overlay_burn_jobs`
```sql
id                uuid primary key default gen_random_uuid()
team_id           uuid references teams(id) on delete cascade
user_id           uuid not null
source_upload_id  uuid references uploads(id) on delete cascade
status            text not null default 'pending'
  -- pending | transcribing | burning | done | failed
error             text
overlay_config    jsonb not null
result_upload_id  uuid references uploads(id) on delete set null
created_at        timestamptz not null default now()
updated_at        timestamptz not null default now()
```

### `overlay_config` JSONB shape
```json
{
  "captions": {
    "enabled": true,
    "style": { "...SubtitleStyle fields..." }
  },
  "layers": [
    {
      "type": "title",
      "text": "My Video Title",
      "position": "top",
      "customY": null,
      "font": "Montserrat",
      "fontSize": 48,
      "color": "#FFFFFF",
      "bold": true,
      "background": { "enabled": true, "color": "#000000", "opacity": 70 },
      "stroke": { "color": "#000000", "width": 0 }
    },
    {
      "type": "text",
      "text": "Follow for more!",
      "x": 0.5,
      "y": 0.88,
      "font": "Montserrat",
      "fontSize": 36,
      "color": "#FFFFFF",
      "bold": false,
      "background": { "enabled": false, "color": "#000000", "opacity": 60 }
    },
    {
      "type": "image",
      "assetId": "uuid-or-null",
      "filePath": "teamId/filename.png",
      "x": 0.05,
      "y": 0.05,
      "width": 0.15
    }
  ],
  "mode": "landscape"
}
```

All positions are 0–1 fractions of video dimensions. Maps directly to CSS percentages and FFmpeg `W*x`/`H*y`.

## API Routes

### `POST /api/overlay-burn`
Auth: Bearer token (getTeamContext).
Body: `{ sourceUploadId, overlayConfig }`.
- Validates source upload belongs to team
- Creates `overlay_burn_jobs` row
- Dispatches `overlay-burn.yml` via GitHub API
- Returns `{ ok: true, jobId }`

### `GET /api/overlay-burn/[id]`
Auth: Bearer token.
Returns job row: `{ ok: true, job: { id, status, error, result_upload_id } }`.

### `GET /api/brand-assets`
Auth: Bearer token. Returns team's saved brand assets list.

### `POST /api/brand-assets`
Auth: Bearer token. Body: `{ name, filePath, fileSize }`. Creates brand_assets row.

### `DELETE /api/brand-assets/[id]`
Auth: Bearer token. Deletes asset row + Storage file. Owner/admin only.

## GitHub Actions Workflow: `overlay-burn.yml`

New workflow, independent of `ai-clip-burn.yml`.

**Inputs:** `job_id`, `team_id`, `user_id`

**Steps:**
1. Mark job `transcribing` (if captions.enabled) or `burning`
2. Fetch `overlay_config` from DB via Supabase REST
3. Download source video from Supabase Storage (authenticated, same pattern as ai-clip-burn)
4. **If captions.enabled:** Run faster-whisper transcription → word-timed JSON
5. Install fonts (Montserrat, Oswald, Anton, Bebas Neue, Poppins, Rubik — same wget steps as ai-clip-burn)
6. **Download image overlay files** from Supabase Storage (one per `type: image` layer)
7. **Generate ASS file** for: captions (if enabled) + title layer (if present) + text layers (as full-duration ASS events)
8. **Build FFmpeg filter_complex** for image overlays:
   - Each image layer: `[prev][Nv]overlay=x=W*{x}:y=H*{y}:w=W*{width}[vN]`
   - Chain sequentially for multiple images
   - Then apply `ass=` filter for text/captions
9. Run FFmpeg — single pass: portrait conversion (if mode != landscape) + image overlays + ASS burn
10. Upload burned video to Storage at `teamId/overlay_burned_{jobId}.mp4`
11. Create new `uploads` row (file_path, file_size, team_id, user_id)
12. Mark job `done`, set `result_upload_id`

**On failure:** Mark job `failed`, set `error` field.

## CSS Preview Accuracy

| Element | Accuracy | Implementation note |
|---|---|---|
| Title text | ~95% | Same Google Fonts, scale font size by `previewH / videoH` |
| Static text layers | ~95% | Same scaling math |
| Image layers | ~97% | CSS `left/top` as %, `width` as % of container |
| Stroke/outline | ~85% | `-webkit-text-stroke` — close but not libass-identical |
| Subtitle sample | Style only | Static frame; animated karaoke not simulated |

Scale factor: `previewHeight / videoPlayResY` (e.g. 400px preview / 1920px video = 0.208). Applied to all font sizes, stroke widths, and margin values.

## Plan Availability

- All plans (Creator + Team) — this is a core upload feature, not an AI feature
- No credit system needed (burn time is paid by GitHub Actions free tier on public repo)

## Migrations Required
```sql
-- Run manually in Supabase
CREATE TABLE brand_assets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  file_path text not null,
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

CREATE TABLE overlay_burn_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  user_id uuid not null,
  source_upload_id uuid references uploads(id) on delete cascade,
  status text not null default 'pending',
  error text,
  overlay_config jsonb not null,
  result_upload_id uuid references uploads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
