# AI Clips: post without waiting for captions

**Date:** 2026-10-01 · **Status:** approved in chat, awaiting spec review

## Problem

On an AI Clips result, **Post** starts a caption render (`ai-clip-burn.yml`) and leaves the user on the clip card
behind a "Processing video…" spinner for about 2½ minutes before the scheduling screen opens. Users will read that
as broken. Measured on 4 real runs (2026-10-01): ~35 s installing ffmpeg and fonts, ~5 s face tracking, and
85–108 s for the render itself (libx264 `fast`, 1080×1920 on a 2-core runner).

Separately, posts scheduled from AI Clips (and from link imports) have **no thumbnail**: the Uploads page extracts
one from the preloaded video (`autoThumb`), but only saves it inside the file-upload step, which preloaded clips skip.

## Goals

1. Post opens the scheduling screen immediately; the render finishes in the background.
2. An honest progress label (real stage and percent, with an estimate) on the scheduling screen.
3. A scheduled post never publishes before its captions are ready, and never publishes an uncaptioned video.
4. Renders take about 1 minute instead of 2½ (to be measured, not promised).
5. Every scheduled post from AI Clips or a link import has a thumbnail.

**Not in scope:** render-ahead (rendering every clip as soon as the user picks a batch style). This design must
not block it later. Also out of scope: rendering in the browser.

## Design

### 1. Reserve the captioned upload when Post is clicked

`POST /api/ai-clips/[id]/burn-clip` already creates the `ai_clip_burn_jobs` row and dispatches the workflow. It will
also **insert the `uploads` row for the captioned video up front**: the same `file_path` the workflow will write
(`{teamId}/ai_burned_{burnJobId}.mp4`), `file_size = null`, `render_status = 'rendering'`, and
`render_job_id = burnJobId`. It returns `{ burnJobId, uploadId }`.

`ClipCard` → Post navigates immediately to `/uploads?uploadId=<uploadId>&title=…&renderJob=<burnJobId>`. The clip
card no longer polls. Download keeps polling, since it needs the finished file, but shows the same progress label.

### 2. The render workflow fills the reserved row and reports progress

`ai-clip-burn.yml`:
- **Progress:** PATCH `ai_clip_burn_jobs` with `progress_stage` (`starting` → `preparing` → `rendering` →
  `uploading`) and `progress_pct` (0–100 during `rendering`, parsed from ffmpeg `-progress pipe:1` against the clip
  duration, written at most every 2 s).
- **Result:** PATCH the reserved `uploads` row (`file_size`, `render_status = null`) instead of inserting a new row,
  then mark the burn job `done` with `result_upload_id` as today.
- **Thumbnail:** extract one frame from the finished video (`ffmpeg -ss 1 -frames:v 1`), upload it to
  `{teamId}/thumbnails/ai_burned_{burnJobId}.jpg`, and set `scheduled_posts.thumbnail_path` on any post with that
  `upload_id` and no thumbnail yet (posts may be scheduled before the render finishes).
- **Failure:** set `uploads.render_status = 'failed'` alongside the burn job's `failed` status (jq-built body).

### 3. Uploads page: progress label and preview

When `renderJob` is in the URL, or the preloaded upload has `render_status = 'rendering'`:
- **Preview:** show the uncaptioned source clip, overlaid with a bar: **"Adding captions · Rendering 62% · about
  30 sec left"**. Poll `GET /api/ai-clips/burn/[id]` every 2 s. The estimate comes from elapsed time ÷ percent; until
  `rendering` starts, show the stage name with no number.
- **When done:** swap the preview to the captioned video, then "Captions ready ✓".
- **On failure:** "Couldn't add captions" plus a Retry button. Retry calls burn-clip with `reuse_upload_id`, which
  sets that same reserved row back to `rendering` and renders into it. Posts already scheduled against it then
  publish normally instead of failing. Scheduling stays allowed; the worker guards publishing.
- `GET /api/uploads/[id]` must return `render_status` and `render_job_id`, so a reopened draft knows the video is
  still rendering.
- Scheduling is never blocked by the render. Platform duration checks use the source clip's duration, which captions
  don't change.

### 4. Post worker waits for the render

`/api/worker/run-scheduled`, before claiming a due post with an `upload_id`:
- `render_status = 'rendering'`, rendering for under 20 min since the reservation → **skip without claiming**. The
  post stays `scheduled` and a later run picks it up.
- `render_status = 'failed'`, or rendering for 20+ min → mark the post `failed` ("Captions couldn't be added to this
  video. Open AI Clips and post the clip again.") with the usual notifications.
- Otherwise, unchanged.

The Scheduled page shows **"Waiting for captions"** instead of the countdown for posts whose upload is rendering.

### 5. Thumbnails for preloaded videos

On the Uploads page, if the user hasn't picked a thumbnail, the post has no `thumbnail_path`, and an auto-extracted
frame exists, upload it before creating the posts, the same way the file-upload step already does. This fixes link
imports and uncaptioned AI clips. Captioned AI clips get theirs from the workflow (section 2), because the frame worth
showing is the captioned, cropped one.

### 6. Faster renders

- Replace the per-run `apt-get install ffmpeg` with a pinned static ffmpeg build, cached with `actions/cache`. Cache
  the font install the same way.
- Encoder preset `fast` → `veryfast` (CRF unchanged). Short-form platforms re-encode anyway.
- Measure 3+ real runs afterwards and record the numbers.

### 7. Every wait explains itself

The user asked for this explicitly: whenever something takes a while, the screen says **what** is happening,
**why** it takes time, and **roughly how long**, so a slow step never looks broken. It applies to every wait in the
AI Clips flow:

| Wait | What the user sees |
|---|---|
| Generating clips (existing progress card) | The current stage, plus one plain line on why, e.g. "Transcribing audio: we listen to the whole video to find what's said and when. Longer videos take longer." and "Finding best moments: AI is reading the transcript to pick the strongest clips." Show an estimate based on the video's length. |
| Adding captions (scheduling screen, Download) | "Adding captions · Rendering 62% · about 30 sec left", plus "We're drawing your captions and title into the video so they show on every platform." |
| Post waiting on captions (Scheduled page) | "Waiting for captions": "This post goes out as soon as its captions finish rendering, usually within a minute or two." |
| A stage running longer than expected (over 2× its estimate) | "Taking longer than usual. It's still working, and you can leave this page; we'll keep going." |

**Rules:**
- No bare spinners or "Processing…".
- Estimates are labelled "about".
- Wherever true, tell the user it's safe to leave the page.
- Copy lives in one map (`src/app/ai-clips/waitCopy.ts`) so it stays consistent.

## Data changes (pasted into Supabase by hand; `supabase.skipDbPush=true`)

```sql
alter table uploads add column if not exists render_status text;      -- null = ready | 'rendering' | 'failed'
alter table uploads add column if not exists render_job_id uuid;
alter table uploads add column if not exists render_started_at timestamptz; -- resets on Retry (20-min timeout)
alter table ai_clip_burn_jobs add column if not exists progress_stage text;
alter table ai_clip_burn_jobs add column if not exists progress_pct int;
```

Canonical copy: `supabase/migrations/20261001_render_status.sql`. The code must deploy **after** these run (the burn route writes the new columns).

Storage limits: a reserved row has `file_size = null`, which counts as 0 until the render fills it. That's acceptable.

## Error handling summary

| Situation | Result |
|---|---|
| Render fails | Upload `failed` → Uploads page offers Retry; any scheduled post fails with a clear message and email |
| Render hangs | Worker fails the post after 20 min; existing 3-hour job reaper unaffected |
| Post scheduled for "now" | Publishes when the render finishes (about 1 min late), never uncaptioned |
| User leaves the Uploads page | Render continues; nothing depends on the tab staying open |

## Testing

- **Worker** (mocked-DB pattern in `scripts/test-*.mjs`): skips a rendering upload without claiming; fails a post on
  a failed render or a 20+ min render; publishes normally once ready.
- **burn-clip route:** reserves the upload row with the right path and status; returns `uploadId`.
- **Workflow:** YAML parses; the progress and failure bodies are valid JSON (jq).
- **Manual:** Post → the scheduling screen appears in under 2 s → the label progresses → captioned preview → the
  scheduled post publishes captioned with a thumbnail. Record render times before and after.
