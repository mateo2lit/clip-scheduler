# AI Clips Parity + Link-in-Bio Marketing — Design

Date: 2026-08-04

Five independent workstreams requested in one pass. They touch disjoint files, so
they can be built and verified separately.

---

## 1. AI Clips — closer to Opus Clips

### Current state

`ai-clips.yml` transcribes with faster-whisper, asks Claude Haiku for
`{start, end, title}` moments, and cuts them with a plain FFmpeg time cut. No
reframing happens at generation time. `ai-clip-burn.yml` later converts geometry
(`portrait_blur` letterbox-on-blur, `portrait_crop` static center crop, or
`landscape` passthrough) and burns ASS subtitles.

### Gaps being closed

| Gap | Fix |
| --- | --- |
| No virality score, no ranking, no "why this clip" | Claude returns `score`, `reason`, `hook_title`; clips ranked best-first |
| Only 3 output formats, all 9:16 or 16:9 | Add 1:1 square and 4:5 portrait |
| Center crop only — subject drifts out of frame | Add `portrait_auto`: OpenCV face tracking → smoothed keyframed crop |
| Large-video path is dead code | Detail API omits `processing_path`/`result_moments_json`; add them |

### 1A. Virality scoring

The Claude prompt in `.github/workflows/ai-clips.yml` gains three fields:

```json
[{"start": 45.2, "end": 98.7, "title": "...", "hook_title": "...",
  "score": 87, "reason": "..."}]
```

- `score` — 0-100 virality estimate, with the prompt spelling out what earns a
  high vs. low score so the numbers mean something rather than clustering at 80.
- `hook_title` — a punchy ≤8-word overlay hook, distinct from the descriptive title.
- `reason` — one sentence on why the moment works.

Claude is asked to return moments **ranked best-first**. Validation clamps score
to 0-100 (default 50 when absent/unparseable), truncates `reason` to 300 chars
and `hook_title` to 100.

**No migration needed.** Results are written to the existing
`ai_clip_jobs.result_moments_json` column (added by `20260507_ai_clips_chunked.sql`,
currently only written by the large path) as
`[{index, start_sec, end_sec, title, hook_title, score, reason}]`. Index `i`
aligns with `result_upload_ids[i]`.

### 1B. Detail API returns the new fields

`src/app/api/ai-clips/[id]/route.ts` adds `result_moments_json`,
`processing_path`, and `source_url` to its select. This is also the one-line fix
that revives the large-video branch of the detail page, which currently renders
an empty grid because `job.processing_path` is always `undefined`.

### 1C. Score UI

`ClipCard` takes optional `score` and `reason` props and renders a virality badge
in the top-left of the card: green ≥80, amber ≥60, white below. The reason shows
as the badge's `title` tooltip and as a line under the card in the expanded modal.
The projects grid on `/ai-clips` shows the top clip's score on each project tile.

### 1D. Two more aspect ratios

`square` (1080×1080) and `portrait_45` (1080×1350) join the geometry block in
`ai-clip-burn.yml`. Both are scale-to-fill + center crop, sharing the existing
`portrait_crop` math generalised over a target width/height. The format pill row
on the detail page becomes five options. `ConvertMode` widens in both
`[id]/page.tsx` and `ClipCard.tsx`.

### 1E. Auto-reframe (`portrait_auto`)

The headline parity feature. In `ai-clip-burn.yml`, before the geometry pass:

1. Sample the clip at 2 fps with OpenCV (`opencv-python-headless`, Haar frontal-face
   cascade shipped with the wheel — no model download).
2. Per sample, take the largest detected face's center-x, normalised to source width.
3. Fill gaps by holding the last known position; if **no** face is ever found, fall
   back to a static center crop (identical to `portrait_crop`).
4. Smooth with a centered moving average (±2s window), then apply a dead-zone: the
   crop only moves when the target drifts more than 4% of frame width, which stops
   the jitter that makes naive tracking look broken.
5. Emit an ffmpeg `sendcmd` script issuing `crop x <px>` at each sample time, and
   run `scale=…,sendcmd=f=…,crop=…` as pass 1.

Every failure mode — import error, cascade missing, zero detections, sendcmd error —
degrades to the existing center crop rather than failing the burn. The whole
detection step is wrapped so a broken OpenCV install can never take down a burn
that would otherwise have succeeded.

### Out of scope (documented, not built)

Trim/extend handles, transcript editing, B-roll, emoji captions, filler-word
removal, brand kits. Trim in particular is blocked upstream: `ai-clips.yml`
deletes the source video from Storage after cutting, so a clip can only ever be
trimmed inward, and that is not worth a schema change in this pass.

---

## 2. Pinterest on the homepage

`src/app/page.tsx` says "8 platforms" in three places but renders seven icons.
Pinterest is added to:

- the floating hero icon row (the reported bug),
- the "8 Platforms, One Workflow" feature-card icon strip (also missing X),
- the Supported Platforms grid (7 → 8 tiles, `sm:grid-cols-4 lg:grid-cols-8`),
- the calendar screenshot legend.

The Supported Platforms tiles link to `/platforms/{key}`, so Pinterest also needs
entries in `src/app/platforms/page.tsx` and `PLATFORM_CONTENT` in
`src/app/platforms/[platform]/page.tsx` — otherwise the new tile 404s.

---

## 3. Dashboard — drop the Likes card

Remove the Likes stat card from `src/app/dashboard/page.tsx`, leaving Views,
Posted, Scheduled, Drafts. The stats row goes `grid-cols-4` → `grid-cols-3` on
its first group. `likes`/`prevLikes` come out of the `Totals` type, the reducer,
and the localStorage cache; the cache key bumps to `v3` so browsers holding a v2
payload don't matter.

---

## 4. Bio page — thumbnails and platform badges

**Why only 2 of 9 show:** `resolveThumbnailUrl` only resolves
`scheduled_posts.thumbnail_path`, which is populated solely when the user
uploaded a custom thumbnail. Worse, the dedup loop in
`src/app/api/bio/[slug]/route.ts` keeps the *first* row per `group_id` — often a
Bluesky or LinkedIn sibling with no thumbnail — and discards the YouTube row that
did have one.

Two fixes in the API:

1. **Pick the best row per group**, not the first: prefer a sibling with a stored
   `thumbnail_path`, then one with a derivable platform thumbnail, then anything.
   Keep the newest row's `posted_at` for ordering.
2. **Derive YouTube thumbnails** from `platform_post_id`
   (`https://i.ytimg.com/vi/{id}/hqdefault.jpg`), mirroring the existing posted-page
   behaviour, via a new `resolvePlatformThumbnail(provider, platformPostId)` in
   `src/lib/bioHelpers.ts`.

On the page, each tile gets a small frosted platform badge in the bottom-right
with the provider's logo, using a compact inline-SVG map for the eight providers.
Tiles with no image at all get a provider-tinted gradient behind the title text
instead of a flat grey box.

---

## 5. Link in Bio marketing + SEO article

Link in Bio ships today but is advertised nowhere outside the dashboard tile.

**Homepage:** a sixth feature card ("Free Link in Bio Page"), a bullet in the
Creator plan's Included list, an FAQ entry, and a mention in the hero platform
line. Framed consistently as *included free with any subscription* — that framing
is the wedge against Linktree's paid tiers.

**Blog:** `src/content/blog/free-link-in-bio-for-creators.mdx`, targeting
"free link in bio", "linktree alternative for creators", and "link in bio for
video creators". Follows the existing frontmatter contract
(`title, description, date, slug, readTime, tags`) so `getAllPosts()` and the
sitemap pick it up with no other change. Content angle: creators pay for a link
page and a scheduler separately; here the link page is free with the scheduler,
and it auto-populates with the videos you already posted — which no standalone
link-in-bio tool can do.

---

## Migrations

None. Everything reuses existing columns.

## Verification

`npx tsc --noEmit` and `npm run build` must both pass. The two GitHub Actions
workflows are validated by parsing their YAML and by running the new Python
reframe/geometry logic standalone against synthetic inputs, since a real burn
can only be exercised by dispatching the workflow.
