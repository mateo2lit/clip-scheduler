# AI Clips — Large Video Support (Browser-as-Worker)

**Date:** 2026-05-07
**Status:** Approved (design)

## Problem

The AI Clips pipeline breaks past ~30-60 minutes of source video. A user uploading a 2-hour, 6.5 GB OBS recording hits two hard walls:

1. **Browser-side `readVideoDuration()`** in `src/app/ai-clips/page.tsx:52` hangs forever on huge MP4s whose `moov` atom is at the end of the file.
2. **Even if duration reading worked**, browser → Supabase upload of multi-GB files is fragile, and the GitHub Actions worker's 30-minute timeout cannot accommodate `faster-whisper` transcription of long audio on CPU.

Goal: support source videos up to and beyond 10 hours **without paid third-party services**, while preserving original video quality and keeping engineering complexity bounded.

---

## Architecture

### Two paths, auto-routed

At file-pick time, branch by source size + codec capability:

- **Small path** (≤ 1 GB AND audio ≤ 30 min) → existing pipeline unchanged. Direct upload to Supabase, single GitHub Actions job.
- **Large path** (> 1 GB OR audio > 30 min) → new browser-as-worker pipeline (described below).

The 1 GB cutoff is conservative — it preserves the simple path for any video the current pipeline already handles reliably.

### Large path — data flow

The original source file **never leaves the user's machine**. The pipeline only ever transports audio (~10 MB/hr as Opus) and the final short clips (~50-90 MB each).

```
Browser                              Server
─────────────────────────────        ──────────────────────────────
1. User picks file
2. mp4box.js demuxes
   (FFmpeg.wasm fallback for
   non-MP4 containers)
3. WebCodecs AudioDecoder →
   AudioEncoder(Opus, 16 kHz mono,
   24 kbps), streamed in 30 s chunks
4. Each chunk uploaded as it      →  POST /api/ai-clips/audio-chunk
   completes (resumable, retry            stores to ai_audio_chunks/
   on chunk-level failure)                bucket, marks chunk in DB

                                       When all chunks uploaded,
                                       browser hits /start endpoint
                                       which dispatches a GitHub
                                       Actions matrix workflow
                                       (one job per audio chunk,
                                       up to 20 parallel).

                                       Each matrix job:
                                         - downloads its chunk
                                         - faster-whisper using
                                           distil-whisper-medium.en
                                           (or large-v3 for non-EN)
                                         - writes transcript +
                                           word_segments to
                                           ai_clip_audio_chunks row

                                       Merge job (depends on matrix):
                                         - reads all chunk results
                                         - dedupes 5 s overlap via
                                           word timestamps
                                         - writes merged transcript
                                           to ai_clip_jobs row

                                       Claude moment detection
                                       (existing logic; map-reduce
                                       for transcripts > 30 min)

                                       Send "your clips are ready"
                                       email; mark job ready to
                                       schedule
                                  ←
5. Browser polls (or returns later)
   Sees moments list
6. User picks one moment, clicks
   Schedule
7. WebCodecs VideoEncoder cuts +
   re-encodes that ONE clip at
   ~8 Mbps H.264 (frame-accurate
   start)
8. Upload single clip            →  Existing burn-in workflow runs
                                       (subtitle burn + vertical
                                       reframe; unchanged from today)
                                  ←  Done
9. Clip appears in AI Clips
   results, schedulable as today
```

### Invariants

- Original source file never leaves user's machine.
- Audio chunks deleted from Supabase Storage at end of merge (or by 24 h cleanup if job fails).
- One AI clip job per team at a time (existing constraint preserved).
- Existing 300 min/month credit limit applies to source duration, same as today.
- URL flow (`prepare-url` + `ai-clips.yml` with yt-dlp) is **unchanged**.

### Status flow comparison

| Status | Small path (existing) | Large path (new) |
|---|---|---|
| `pending` | row created | row created |
| `uploading` | browser PUTs source to Supabase | browser extracts + uploads audio chunks |
| `transcribing` | runner extracts audio + transcribes | matrix transcribes chunks; merge job stitches |
| `detecting` | Claude finds moments | Claude finds moments (map-reduce if long) |
| `cutting` | runner cuts clips with FFmpeg | **skipped** — clip cutting is lazy in browser |
| `done` | clips uploaded to Supabase, ready to schedule | moments stored; clips encoded on-demand in browser |
| `failed` | terminal failure | terminal failure |

---

## Components

### Frontend (new under `src/lib/ai-clips/`)

**`codec-detect.ts`** — feature detection at file-pick time. Returns `{ canExtract: boolean, encoder: 'webcodecs' | 'ffmpegwasm' | null, reasons: string[] }`. Probes:
- WebCodecs `AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 16000, numberOfChannels: 1, bitrate: 24000 })`
- WebCodecs `VideoEncoder.isConfigSupported({ codec: 'avc1.42E01E', width: 1920, height: 1080, bitrate: 8_000_000 })`
- Container detection via mime + magic bytes (MP4 vs MKV vs other)
- Mobile UA detection (mobile path is rejected with a friendly message pointing to the URL flow)

If `encoder` is `null`, refuse the large-file path.

**`audio-extractor.ts`** — async generator `extractAudioChunks(file, { chunkSeconds: 30 })` that yields `{ index, blob, startSec, endSec }`. MP4 path uses `mp4box.js` to demux + WebCodecs `AudioDecoder` + `AudioEncoder`. Fallback path lazy-loads FFmpeg.wasm only when container is non-MP4.

**`chunked-uploader.ts`** — consumes the extractor's generator and uploads each chunk to `/api/ai-clips/audio-chunk` as it lands. Per-chunk retry with exponential backoff (3 attempts). Reports overall progress as `{ chunksDone, chunksTotal }`. Uses a per-job HMAC-signed upload token issued by `prepare-large`.

**`clip-encoder.ts`** — `encodeClip(file, { startSec, endSec, bitrate: 8_000_000 })` → returns an MP4 blob. Decodes the requested segment via WebCodecs `VideoDecoder`, re-encodes via `VideoEncoder` at ~8 Mbps H.264. Frame-accurate at the start by seeking to the keyframe before `startSec` and dropping pre-roll frames. Lazy-runs only when user clicks **Schedule** on a clip.

**`src/app/ai-clips/page.tsx`** — modified:
- File-pick handler runs `codec-detect` before reading duration.
- For large path, replaces `readVideoDuration()` (which hangs) with extractor's metadata pass that returns duration without scanning whole file.
- Routes to `/api/ai-clips/prepare-large` instead of `/api/ai-clips/prepare`.
- Shows "extracting audio" + "uploading chunks" progress instead of single upload bar.
- Shows "we'll email you when ready" UX with email-on/off toggle.
- After all chunks uploaded, can stop polling and rely on email — but keeps polling if tab stays open for live status.

### Backend (new under `src/app/api/ai-clips/`)

**`prepare-large/route.ts`** — companion to `prepare/route.ts` for the large path. Validates plan (Team only), credit availability, no active job. Inserts `ai_clip_jobs` row with `processing_path: 'large'`, `audio_chunks_total: null`, status `pending`. Returns:
```json
{
  "ok": true,
  "jobId": "...",
  "chunkUploadToken": "<HMAC-signed, scoped to job, 4 h expiry>",
  "chunkBucket": "clips",
  "chunkPathPrefix": "ai_audio_chunks/<jobId>/"
}
```

**`audio-chunk/route.ts`** — receives a single Opus chunk. Validates HMAC token (must encode `jobId` + chunk index ≤ a max). Streams chunk to Supabase Storage at `ai_audio_chunks/<jobId>/chunk_NNN.opus` (3-digit zero-padded). Inserts/updates `ai_clip_audio_chunks` row with `status: 'uploaded'`, `start_sec`, `end_sec`. Idempotent on `(job_id, chunk_index)`.

Body shape (multipart): `chunk` file part + `index`, `startSec`, `endSec` form fields.

**`large/[id]/start/route.ts`** — called by browser when extraction completes. Verifies caller owns the job. Sets `audio_chunks_total` and updates status to `transcribing`. Increments credit usage on the team (commits the cost). Dispatches the matrix transcription workflow via GitHub API, passing `{ job_id, chunks_total }`.

### GitHub Actions workflows (new in `.github/workflows/`)

**`ai-clips-transcribe-chunk.yml`** — matrix workflow. Inputs: `job_id`, `chunks_total`. Uses GitHub Actions `strategy.matrix` with `chunk_index: [0..N-1]`. Each job:
1. Downloads its chunk from Supabase Storage at `ai_audio_chunks/<jobId>/chunk_<idx>.opus`.
2. Runs `faster-whisper` with model `distil-whisper-medium.en`. v1 assumes English content (matches current product audience). Per-job language selection is out of scope — see "Out of scope for v1".
3. Writes per-chunk `transcript` + `word_segments_json` to `ai_clip_audio_chunks` row, sets `status: 'done'`.
4. Per-chunk `timeout-minutes: 15`.
5. Per-chunk `continue-on-error: true` so matrix completion isn't blocked by one bad chunk; the merge job decides job-level success/failure.

**`ai-clips-merge.yml`** — depends on the matrix workflow via `workflow_run` trigger (or chained `workflow_dispatch` from the matrix completion). Inputs: `job_id`. Steps:
1. Reads all `ai_clip_audio_chunks` rows for the job. If any are not `done`, retries failed ones once via re-dispatch. If still failed, marks parent job `failed` and exits.
2. Stitches transcripts in `chunk_index` order.
3. Dedupes the 5 s overlap windows by walking word_segments and dropping words whose timestamps fall within an already-emitted window (timestamp tolerance 250 ms).
4. Writes merged `transcript` + `word_segments_json` to `ai_clip_jobs`.
5. Updates status to `detecting`, then runs the existing Claude moment-detection logic. For transcripts > 30 min, applies map-reduce: chunk transcript into 30-min windows, ask Claude to score top moments per window, then ask Claude to pick best N across windows.
6. Writes `result_moments_json` (`[{ start_sec, end_sec, title, subtitles_json }, ...]`) to the job row. The large path **skips the server-side `cutting` status entirely** — clip cutting happens lazily in the browser when the user clicks Schedule. Status transitions: `detecting` → `done`.
7. Sends "your clips are ready" email via Resend (gated on `notify_email = true`).
8. Triggers cleanup job to delete `ai_audio_chunks/<jobId>/` from storage.

Existing **`ai-clips.yml`** stays as-is for the URL flow.

### Database

**Migration `supabase/migrations/20260507_ai_clips_chunked.sql`:**

```sql
-- New table for tracking audio chunks
CREATE TABLE IF NOT EXISTS ai_clip_audio_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES ai_clip_jobs(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  start_sec NUMERIC NOT NULL,
  end_sec NUMERIC NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',  -- uploaded | transcribing | done | failed
  transcript TEXT,
  word_segments_json JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (job_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ai_clip_audio_chunks_job_idx
  ON ai_clip_audio_chunks(job_id);

-- New columns on ai_clip_jobs
ALTER TABLE ai_clip_jobs
  ADD COLUMN IF NOT EXISTS processing_path TEXT NOT NULL DEFAULT 'small',  -- 'small' | 'large'
  ADD COLUMN IF NOT EXISTS audio_chunks_total INT,
  ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS result_moments_json JSONB;
```

Note: `ai_clip_jobs.transcript` and `result_moments_json` are added so the merge workflow can persist results without depending on the cutting workflow (which now lives in the browser for the large path).

### Email

New template in `src/lib/email.ts`:

```ts
export async function sendAiClipsReady(opts: {
  to: string;
  jobId: string;
  clipCount: number;
  sourceMinutes: number;
}): Promise<void>
```

Subject: `Your AI clips are ready (${clipCount} clips from ${sourceMinutes} min)`. Body: short HTML with a CTA link to `/ai-clips/${jobId}`. Sent at end of merge workflow, gated on `ai_clip_jobs.notify_email = true`.

### Storage

- New path pattern: `ai_audio_chunks/<jobId>/chunk_NNN.opus` in the existing `clips` bucket.
- Cleanup: merge workflow deletes the directory after successful completion.
- Nightly `refresh-tokens` worker extended to hard-delete any `ai_audio_chunks/*` entries older than 24 h (covers failed/abandoned jobs).

### Auth

- `chunkUploadToken` is HMAC-SHA256 over `<jobId>:<userId>:<exp_ts>` using `OAUTH_STATE_SECRET` (existing env var). Validates `userId` matches the request session and `exp_ts > now()`. Token re-used for all chunks in a job.

---

## Routing rule (auto-switch)

In `page.tsx` file-pick handler:

```ts
const FILE_SIZE_THRESHOLD_BYTES = 1024 * 1024 * 1024;       // 1 GB
const DURATION_THRESHOLD_SECONDS = 30 * 60;                 // 30 min

const useLargePath =
  file.size > FILE_SIZE_THRESHOLD_BYTES ||
  (estimatedDurationSec ?? 0) > DURATION_THRESHOLD_SECONDS;

if (useLargePath) {
  const caps = await detectCodecCapabilities(file);
  if (!caps.canExtract) {
    showRefusal(caps.reasons);  // e.g. "WebCodecs unavailable"
    return;
  }
  await runLargePath(file, caps);
} else {
  await runSmallPath(file);  // existing logic
}
```

Duration estimation for the large path uses mp4box.js metadata (microseconds, instant) — never the browser `<video>` blob URL approach that currently hangs.

---

## Error handling

### Browser

| Failure | Handling |
|---|---|
| WebCodecs unavailable / no H.264 encoder | `codec-detect.ts` returns `null`. UI shows actionable message ("Try Chrome/Edge, or use the URL flow"). No DB write. |
| mp4box.js demux fails (corrupt MP4) | Lazy-load FFmpeg.wasm fallback. If both fail, mark job `failed` (no credit charged — credits commit only at `start` endpoint). |
| Single chunk extract or upload fails | Per-chunk retry with exponential backoff, 3 attempts. UI shows "retrying chunk N". |
| All retries exhausted | UPDATE the job row to `status = 'failed'`, set `error` field. No credit charged. User sees failure in UI and can retry. |
| User closes tab during extraction | Job stays in `uploading` (or `pending`). Nightly cleanup hard-deletes uploaded chunks at 24 h, marks job `failed`. UI on return shows "previous job was interrupted." |
| User closes tab during lazy clip encode | Only that one clip's encode lost. Other clips remain available. Retry by clicking Schedule again. |
| Browser memory pressure / tab crash | Same as closed tab — recoverable on resume. |

### Server (Vercel API routes)

| Failure | Handling |
|---|---|
| `prepare-large` plan/credit/active-job check fails | Standard 4xx with `{ ok: false, error }`. No DB write. |
| `audio-chunk` Supabase Storage write fails | Return 500. Browser retries the chunk. |
| Invalid or expired `chunkUploadToken` | Return 401. UI prompts re-auth. |
| `start` route fails to dispatch matrix workflow | Return 500. Job stays in `uploading`; user can retry from UI. Cleanup expires it after 24 h. |

### GitHub Actions

| Failure | Handling |
|---|---|
| Single chunk transcribe job fails | Matrix uses `continue-on-error: true`. Merge job re-dispatches failed chunks once. Persistent failure marks chunk `failed`. |
| Any chunk still `failed` at merge | Parent job marked `failed`, "couldn't generate" email sent. **Credits NOT refunded** (we did the work). |
| Matrix exceeds 20-job concurrency limit | GitHub queues automatically. Job-visible status stays `transcribing` with "in queue" hint. |
| Per-chunk timeout | `timeout-minutes: 15`. If exceeded, treated as chunk failure (above). |

### Claude moment detection

| Failure | Handling |
|---|---|
| Anthropic API rate-limited / down | Retry with backoff, 3 attempts. |
| Malformed JSON response | Existing fallback: evenly-spaced moments at `duration / clip_count`. Set `result_warning` for UI banner. |
| Transcript too long for context | Map-reduce: per-window scoring → cross-window selection. Adds ~$0.05 per long-job cost. |

### Email

| Failure | Handling |
|---|---|
| Resend API fails | Log, do not fail the job. Clips are still in the UI. Optional single retry. |

### Credit policy

- Credits **commit** at the `/api/ai-clips/large/[id]/start` endpoint (after audio is fully uploaded, before transcription begins).
- Failures **before commit** (extraction, upload) → no credits charged.
- Failures **after commit** (transcription, merge, detection) → no refund. We did the compute.

This matches the spirit of the existing `prepare/route.ts` credit logic.

---

## Performance targets

| Source duration | Audio upload size | Audio extract time (browser) | Transcribe wall time (matrix) | Total wall clock |
|---|---|---|---|---|
| 2 hr | ~20 MB | 30-90 s (WebCodecs) | ~5 min (8 parallel chunks) | ~5-10 min |
| 5 hr | ~50 MB | 1-3 min | ~7 min (12 chunks) | ~10-15 min |
| 10 hr | ~100 MB | 3-7 min | ~10 min (20 chunks) | ~15-25 min |

End-to-end cost per job: **~$0.05-$0.10** (Claude moment detection only; transcription is free on GitHub Actions matrix).

---

## Browser compatibility

| Browser | Audio extract | Clip encode | Status |
|---|---|---|---|
| Chrome / Edge desktop | WebCodecs ✓ | WebCodecs (HW) ✓ | Full support |
| Safari 16+ desktop | WebCodecs ✓ | WebCodecs (HW) ✓ | Full support |
| Firefox 130+ | WebCodecs ✓ | WebCodecs ✓ | Full support |
| Mobile Safari / Android Chrome | Refused | n/a | Show URL-flow fallback |
| Older browsers | FFmpeg.wasm ✓ (slow) | FFmpeg.wasm ✓ (slow, 15-40 min for 8 clips) | Functional but degraded |

For browsers without WebCodecs entirely, the lazy-encode mitigation (only encode on Schedule click) keeps the user-facing wait to one clip at a time.

---

## Testing strategy

### Unit (Vitest, browser-environment)

- `codec-detect.test.ts` — mock `AudioEncoder.isConfigSupported` / `VideoEncoder.isConfigSupported` returns; assert correct routing for capable / non-capable browsers, mobile UA detection.
- `audio-extractor.test.ts` — feed a small known MP4 fixture, assert chunk count matches expected `chunkSeconds`, assert duration sum within tolerance.
- `chunked-uploader.test.ts` — mock fetch, assert per-chunk retry on 5xx, assert give-up after 3 attempts.

### Integration

- API: spin up a Supabase test instance, exercise `prepare-large` + `audio-chunk` round-trip with mock chunks, assert DB rows + storage objects.
- Workflow merge logic: extract the merge/dedupe code into a pure module, unit-test against synthetic chunked transcripts with overlap (verify dedup correctness at boundaries).

### Manual (required before ship)

- 1 GB MP4/H.264 (boundary case)
- 6.5 GB MP4/H.264 (the user's actual case)
- 15 GB MP4/H.264 (stress)
- 2 GB MKV (fallback path)
- 5 GB MP4 with very high keyframe interval (worst case for clip cutting)
- Cross-browser: Chrome desktop, Safari desktop, Firefox desktop, mobile Safari (verify rejection)
- Network failure injection mid-upload (verify retry + resume)
- User closes tab mid-extract (verify cleanup)

GitHub Actions matrix can't easily be tested locally; smoke-test on a feature branch with a dispatch action against the staging Supabase instance.

---

## Out of scope for v1

- **Resumable browser sessions across page reloads.** Interrupted jobs require re-uploading.
- **Mid-job plan downgrade handling.** Job continues to completion.
- **Multi-tab editing.** Behavior undefined.
- **Speaker diarization, language detection, custom vocab.** Whisper handles language detection automatically; the rest are future enhancements.
- **WebGPU in-browser Whisper.** Considered and rejected — too slow on long audio (5-10× realtime).
- **Real-time progress streaming over WebSockets.** Polling is good enough.
- **URL flow changes.** Stays exactly as it is today.

---

## Migration / rollout

1. Apply DB migration `20260507_ai_clips_chunked.sql` manually (per project convention `supabase.skipDbPush=true`).
2. Deploy frontend + API routes behind a feature flag (`NEXT_PUBLIC_AI_CLIPS_LARGE_ENABLED`). Default off.
3. Manual smoke test the full pipeline with the user's actual 6.5 GB recording.
4. Enable flag for the dev account, then for all Team plan users.
5. Monitor: failed-job rate, average wall time, GitHub Actions concurrency saturation.
6. Once stable for a week, raise the small-path size threshold cap from 1 GB if desired (or leave it — the 1 GB cutoff is defensible).

No client-visible breaking change. Existing small files use the existing path with no behavior change. Large files unlock the new flow.
