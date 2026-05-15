# AI Clips Large Video Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "browser-as-worker" pipeline to AI Clips so source videos > 1 GB or > 30 min are processed without uploading the source to the server. The browser extracts audio (small), the server transcribes audio chunks in parallel on GitHub Actions (free), and the browser cuts the final clips locally on demand.

**Architecture:** Two coexisting paths, auto-routed at file-pick time by size + duration. Small files keep the existing flow. Large files extract audio in WebCodecs to ~10 MB/hr Opus, stream-upload chunks to a new API, dispatch a GitHub Actions matrix workflow (one job per chunk, up to 20 parallel) using `faster-whisper` + `distil-whisper-medium.en`, merge results server-side, run the existing Claude moment detector, then notify the user by email. Lazy clip cutting in the browser via WebCodecs runs only when the user clicks Schedule.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind v4, Supabase (service-role admin client + Storage), GitHub Actions matrix workflows, mp4box.js for MP4 demux, WebCodecs API for audio + video encode/decode, FFmpeg.wasm (lazy-loaded fallback for non-MP4), `faster-whisper` with `distil-whisper-medium.en` model, Resend for email.

---

## Spec reference

See `docs/superpowers/specs/2026-05-07-ai-clips-large-video-design.md` for the full design.

---

## File Map

**Create:**
- `supabase/migrations/20260507_ai_clips_chunked.sql` — `ai_clip_audio_chunks` table + new columns on `ai_clip_jobs`
- `src/types/aiClipsLarge.ts` — `ChunkUploadToken`, `AudioChunkMeta`, `MomentResult`, `CodecCapabilities` shared types
- `src/lib/aiClipsTokens.ts` — HMAC sign/verify of `chunkUploadToken` (server side)
- `src/lib/aiClipsTranscriptMerge.ts` — pure dedup/merge of chunked word_segments (server side, called from workflow via Node)
- `src/lib/aiClips/codecDetect.ts` — feature detection for WebCodecs + container (browser side)
- `src/lib/aiClips/audioExtractor.ts` — WebCodecs + mp4box.js streaming audio extraction (browser side)
- `src/lib/aiClips/ffmpegFallback.ts` — lazy-loaded FFmpeg.wasm path for non-MP4 containers (browser side)
- `src/lib/aiClips/chunkedUploader.ts` — chunked resumable upload with retry (browser side)
- `src/lib/aiClips/clipEncoder.ts` — WebCodecs lazy clip cut + re-encode (browser side)
- `src/app/api/ai-clips/prepare-large/route.ts` — POST: validate plan, create job row, issue chunk upload token
- `src/app/api/ai-clips/audio-chunk/route.ts` — POST: receive one chunk, store in Supabase, mark in DB
- `src/app/api/ai-clips/large/[id]/start/route.ts` — POST: commit credits, dispatch matrix workflow
- `.github/workflows/ai-clips-transcribe-chunk.yml` — matrix workflow, one job per chunk
- `.github/workflows/ai-clips-merge.yml` — merge transcripts, run Claude detection, send email

**Modify:**
- `src/lib/email.ts` — add `sendAiClipsReady` template + sender
- `src/app/ai-clips/page.tsx` — auto-routing at file-pick + new progress UI for large path
- `src/app/api/worker/refresh-tokens/route.ts` — add nightly cleanup of orphaned `ai_audio_chunks/*` (> 24h old)
- `package.json` — add `mp4box` and `@ffmpeg/ffmpeg`/`@ffmpeg/util` dependencies

---

## Test approach

This codebase ships without a unit test framework, by project convention. Each task uses **manual verification** with explicit curl commands, browser console snippets, or smoke-test workflows. Pure logic that benefits from tests (token sign/verify, transcript merge dedup) gets a small Node REPL verification step the engineer can paste.

If the engineer wants stronger coverage later, a Vitest addition is a clean separate task — none of these files have hidden test dependencies.

---

## Task 1: DB migration

**Files:**
- Create: `supabase/migrations/20260507_ai_clips_chunked.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260507_ai_clips_chunked.sql
-- Run manually in Supabase SQL editor (project convention: supabase.skipDbPush=true)

CREATE TABLE IF NOT EXISTS ai_clip_audio_chunks (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references ai_clip_jobs(id) on delete cascade,
  chunk_index           int not null,
  start_sec             numeric not null,
  end_sec               numeric not null,
  storage_path          text not null,
  status                text not null default 'uploaded',  -- uploaded | transcribing | done | failed
  transcript            text,
  word_segments_json    jsonb,
  error                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  unique (job_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ai_clip_audio_chunks_job_idx
  ON ai_clip_audio_chunks(job_id);

ALTER TABLE ai_clip_jobs
  ADD COLUMN IF NOT EXISTS processing_path        text not null default 'small',  -- 'small' | 'large'
  ADD COLUMN IF NOT EXISTS audio_chunks_total     int,
  ADD COLUMN IF NOT EXISTS notify_email           boolean not null default true,
  ADD COLUMN IF NOT EXISTS notify_email_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS transcript             text,
  ADD COLUMN IF NOT EXISTS result_moments_json    jsonb;
```

- [ ] **Step 2: Run in Supabase SQL editor**

Open the Supabase dashboard → SQL Editor → paste the file contents → Run. Verify in Table Editor:
- `ai_clip_audio_chunks` table exists with expected columns
- `ai_clip_jobs` shows the 6 new columns

- [ ] **Step 3: Commit migration file**

```bash
git add supabase/migrations/20260507_ai_clips_chunked.sql
git commit -m "feat(ai-clips): migration for chunked audio processing"
```

---

## Task 2: Add npm dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install mp4box@^1.4.0 @ffmpeg/ffmpeg@^0.12.10 @ffmpeg/util@^0.12.1
```

`mp4box` parses MP4 boxes for the demux step. `@ffmpeg/ffmpeg` and `@ffmpeg/util` are lazy-loaded only on the FFmpeg.wasm fallback path (for MKV/MOV/AV1 sources).

- [ ] **Step 2: Verify install**

```bash
npm ls mp4box @ffmpeg/ffmpeg @ffmpeg/util
```

Expected: each lists its version, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(ai-clips): add mp4box + ffmpeg.wasm dependencies"
```

---

## Task 3: Shared types

**Files:**
- Create: `src/types/aiClipsLarge.ts`

- [ ] **Step 1: Create the types file**

```ts
// src/types/aiClipsLarge.ts

export type ChunkUploadToken = string;  // opaque HMAC token

export type AudioChunkMeta = {
  index: number;
  startSec: number;
  endSec: number;
};

export type CodecEncoder = "webcodecs" | "ffmpegwasm" | null;

export type CodecCapabilities = {
  canExtract: boolean;
  encoder: CodecEncoder;
  container: "mp4" | "mkv" | "mov" | "webm" | "other";
  isMobile: boolean;
  reasons: string[];  // human-readable reasons for refusal, if any
};

export type MomentResult = {
  index: number;
  startSec: number;
  endSec: number;
  title: string;
  subtitlesJson?: any;
};

export type PrepareLargeResponse = {
  ok: true;
  jobId: string;
  chunkUploadToken: ChunkUploadToken;
  chunkBucket: string;
  chunkPathPrefix: string;
} | {
  ok: false;
  error: string;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/types/aiClipsLarge.ts
git commit -m "feat(ai-clips): shared types for large video path"
```

---

## Task 4: HMAC chunk upload tokens

**Files:**
- Create: `src/lib/aiClipsTokens.ts`

The chunk upload token authenticates a job's audio uploads without re-checking the user's session on every chunk. HMAC over `<jobId>:<userId>:<exp_ts>` keyed with `OAUTH_STATE_SECRET`.

- [ ] **Step 1: Create the tokens module**

```ts
// src/lib/aiClipsTokens.ts
import { createHmac, timingSafeEqual } from "crypto";

const SECRET_ENV = "OAUTH_STATE_SECRET";
const TOKEN_TTL_SECONDS = 4 * 60 * 60;  // 4 hours

function getSecret(): string {
  const s = process.env[SECRET_ENV];
  if (!s) throw new Error(`${SECRET_ENV} is not set`);
  return s;
}

function hmacHex(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function signChunkUploadToken(jobId: string, userId: string, ttlSeconds = TOKEN_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${jobId}:${userId}:${exp}`;
  return `${payload}:${hmacHex(payload)}`;
}

export type VerifyResult =
  | { ok: true; jobId: string; userId: string }
  | { ok: false; reason: "malformed" | "expired" | "bad_signature" };

export function verifyChunkUploadToken(token: string): VerifyResult {
  const parts = token.split(":");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [jobId, userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: "malformed" };
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };

  const expected = hmacHex(`${jobId}:${userId}:${exp}`);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, jobId, userId };
}
```

- [ ] **Step 2: Verify with a Node REPL**

```bash
node -e "
process.env.OAUTH_STATE_SECRET = 'test-secret-32-chars-min-1234567';
const { signChunkUploadToken, verifyChunkUploadToken } = require('./src/lib/aiClipsTokens.ts');
"
```

If the project is TypeScript-only, instead use `npx tsx` or skip and rely on the API-route smoke test in Task 6.

Quick alternative: paste the same logic into a `.js` scratch file in the repo, run `node scratch.js`, confirm sign + verify round-trip works, then delete the scratch file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiClipsTokens.ts
git commit -m "feat(ai-clips): HMAC chunk upload tokens"
```

---

## Task 5: `prepare-large` API route

**Files:**
- Create: `src/app/api/ai-clips/prepare-large/route.ts`

This route mirrors the existing `prepare/route.ts` plan/credit checks but does NOT issue a Supabase signed upload URL. Instead it returns an HMAC token the browser uses on the new `audio-chunk` route.

- [ ] **Step 1: Create the route**

```ts
// src/app/api/ai-clips/prepare-large/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { signChunkUploadToken } from "@/lib/aiClipsTokens";

export const runtime = "nodejs";
export const maxDuration = 30;

const MONTHLY_CREDIT_LIMIT = 300;

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId } = result.ctx;

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("plan, plan_status")
      .eq("id", teamId)
      .single();

    if (
      !team ||
      team.plan !== "team" ||
      (team.plan_status !== "active" && team.plan_status !== "trialing")
    ) {
      return NextResponse.json(
        { ok: false, error: "AI Clips is available on the Team plan only." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const clip_count = Math.min(10, Math.max(3, Number(body.clip_count) || 5));
    const source_duration_minutes = Number(body.source_duration_minutes) || 0;
    const genre = body.genre || "auto";
    const clip_length = body.clip_length || "auto";
    const auto_hook = body.auto_hook !== false;
    const moment_prompt = String(body.moment_prompt || "").slice(0, 500);
    const notify_email = body.notify_email !== false;

    if (source_duration_minutes <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid video duration." }, { status: 400 });
    }
    if (source_duration_minutes > 600) {
      return NextResponse.json(
        { ok: false, error: "Source video exceeds the 10-hour maximum." },
        { status: 400 }
      );
    }

    // One active job per team
    const { data: activeJobs } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id")
      .eq("team_id", teamId)
      .in("status", ["pending", "uploading", "transcribing", "detecting", "cutting"])
      .limit(1);

    if (activeJobs && activeJobs.length > 0) {
      return NextResponse.json(
        { ok: false, error: "A job is already running. Please wait for it to finish before starting another." },
        { status: 409 }
      );
    }

    // Monthly credit check (same logic as prepare/route.ts)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usageRows } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("source_duration_minutes")
      .eq("team_id", teamId)
      .neq("status", "failed")
      .gte("created_at", startOfMonth.toISOString());

    const creditsUsed = (usageRows ?? []).reduce(
      (sum, row) => sum + (row.source_duration_minutes ?? 0),
      0
    );

    if (creditsUsed + source_duration_minutes > MONTHLY_CREDIT_LIMIT) {
      const remaining = Math.max(0, MONTHLY_CREDIT_LIMIT - creditsUsed);
      return NextResponse.json(
        {
          ok: false,
          error: `Monthly credit limit reached. You have ${remaining.toFixed(0)} minutes remaining (${Math.round(creditsUsed)}/${MONTHLY_CREDIT_LIMIT} used).`,
        },
        { status: 429 }
      );
    }

    const jobId = crypto.randomUUID();

    const { error: insertErr } = await supabaseAdmin
      .from("ai_clip_jobs")
      .insert({
        id: jobId,
        team_id: teamId,
        user_id: userId,
        source_file_path: null,                                // never uploaded for large path
        source_bucket: "clips",
        source_duration_minutes,
        clip_count,
        status: "pending",
        genre,
        clip_length,
        auto_hook,
        moment_prompt,
        processing_path: "large",
        notify_email,
      });

    if (insertErr) {
      return NextResponse.json({ ok: false, error: "Failed to create job." }, { status: 500 });
    }

    const chunkUploadToken = signChunkUploadToken(jobId, userId);

    return NextResponse.json({
      ok: true,
      jobId,
      chunkUploadToken,
      chunkBucket: "clips",
      chunkPathPrefix: `ai_audio_chunks/${jobId}/`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke test with curl**

Start dev server (`npm run dev`) and call the route with your real session token (grab from devtools → cookie `sb-access-token`):

```bash
curl -X POST http://localhost:3000/api/ai-clips/prepare-large \
  -H "Authorization: Bearer <your-supabase-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"clip_count": 5, "source_duration_minutes": 120}'
```

Expected: `{ "ok": true, "jobId": "...", "chunkUploadToken": "<hash>", "chunkBucket": "clips", "chunkPathPrefix": "ai_audio_chunks/<jobId>/" }`. A new row appears in `ai_clip_jobs` with `processing_path = 'large'`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai-clips/prepare-large/route.ts
git commit -m "feat(ai-clips): prepare-large API route"
```

---

## Task 6: `audio-chunk` API route

**Files:**
- Create: `src/app/api/ai-clips/audio-chunk/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/ai-clips/audio-chunk/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyChunkUploadToken } from "@/lib/aiClipsTokens";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHUNK_INDEX = 999;
const MAX_CHUNK_BYTES = 50 * 1024 * 1024;  // 50 MB hard cap per chunk

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const token = String(form.get("token") || "");
    const indexRaw = String(form.get("index") || "");
    const startSecRaw = String(form.get("startSec") || "");
    const endSecRaw = String(form.get("endSec") || "");
    const blob = form.get("chunk");

    if (!token) return NextResponse.json({ ok: false, error: "missing token" }, { status: 400 });

    const verify = verifyChunkUploadToken(token);
    if (!verify.ok) {
      return NextResponse.json({ ok: false, error: `token ${verify.reason}` }, { status: 401 });
    }
    const { jobId, userId } = verify;

    const index = Number(indexRaw);
    const startSec = Number(startSecRaw);
    const endSec = Number(endSecRaw);
    if (!Number.isInteger(index) || index < 0 || index > MAX_CHUNK_INDEX) {
      return NextResponse.json({ ok: false, error: "invalid index" }, { status: 400 });
    }
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
      return NextResponse.json({ ok: false, error: "invalid timestamps" }, { status: 400 });
    }

    if (!(blob instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "missing chunk blob" }, { status: 400 });
    }
    if (blob.size > MAX_CHUNK_BYTES) {
      return NextResponse.json({ ok: false, error: "chunk too large" }, { status: 413 });
    }

    // Verify job belongs to this user (token already checked but defense in depth)
    const { data: job } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id, user_id, processing_path, status")
      .eq("id", jobId)
      .single();

    if (!job || job.user_id !== userId) {
      return NextResponse.json({ ok: false, error: "job not found" }, { status: 404 });
    }
    if (job.processing_path !== "large") {
      return NextResponse.json({ ok: false, error: "wrong processing path" }, { status: 400 });
    }
    if (job.status !== "pending" && job.status !== "uploading") {
      return NextResponse.json({ ok: false, error: "job not accepting chunks" }, { status: 409 });
    }

    const padded = String(index).padStart(3, "0");
    const storagePath = `ai_audio_chunks/${jobId}/chunk_${padded}.opus`;

    const arrayBuffer = await blob.arrayBuffer();
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("clips")
      .upload(storagePath, new Uint8Array(arrayBuffer), {
        contentType: "audio/ogg; codecs=opus",
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json({ ok: false, error: `storage upload failed: ${uploadErr.message}` }, { status: 500 });
    }

    // Idempotent insert/upsert. UNIQUE(job_id, chunk_index) handles dupes.
    const { error: dbErr } = await supabaseAdmin
      .from("ai_clip_audio_chunks")
      .upsert({
        job_id: jobId,
        chunk_index: index,
        start_sec: startSec,
        end_sec: endSec,
        storage_path: storagePath,
        status: "uploaded",
        updated_at: new Date().toISOString(),
      }, { onConflict: "job_id,chunk_index" });

    if (dbErr) {
      return NextResponse.json({ ok: false, error: `db upsert failed: ${dbErr.message}` }, { status: 500 });
    }

    // Move job to 'uploading' on first chunk
    if (job.status === "pending") {
      await supabaseAdmin
        .from("ai_clip_jobs")
        .update({ status: "uploading", updated_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke test with curl**

Use the `chunkUploadToken` from Task 5 and a small fake opus file (any binary will do for shape testing):

```bash
echo "fake-opus-bytes" > /tmp/chunk0.opus

curl -X POST http://localhost:3000/api/ai-clips/audio-chunk \
  -F "token=<your-chunk-upload-token>" \
  -F "index=0" \
  -F "startSec=0" \
  -F "endSec=30" \
  -F "chunk=@/tmp/chunk0.opus"
```

Expected: `{ "ok": true }`. Verify in Supabase Storage that `ai_audio_chunks/<jobId>/chunk_000.opus` exists, and `ai_clip_audio_chunks` table has the row.

- [ ] **Step 3: Verify error paths**

```bash
# Invalid token
curl -X POST http://localhost:3000/api/ai-clips/audio-chunk \
  -F "token=garbage" -F "index=0" -F "startSec=0" -F "endSec=30" -F "chunk=@/tmp/chunk0.opus"
# Expected: 401

# Index out of range
curl -X POST http://localhost:3000/api/ai-clips/audio-chunk \
  -F "token=<good-token>" -F "index=2000" -F "startSec=0" -F "endSec=30" -F "chunk=@/tmp/chunk0.opus"
# Expected: 400 invalid index
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai-clips/audio-chunk/route.ts
git commit -m "feat(ai-clips): audio-chunk API route"
```

---

## Task 7: `large/[id]/start` API route

**Files:**
- Create: `src/app/api/ai-clips/large/[id]/start/route.ts`

This is called by the browser after the last chunk uploads. It commits the credit cost, updates status to `transcribing`, and dispatches the matrix workflow.

- [ ] **Step 1: Create the route**

```ts
// src/app/api/ai-clips/large/[id]/start/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

const GITHUB_API = "https://api.github.com";
const TRANSCRIBE_WORKFLOW_FILENAME = "ai-clips-transcribe-chunk.yml";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId } = result.ctx;

    const jobId = params.id;
    if (!jobId) return NextResponse.json({ ok: false, error: "missing job id" }, { status: 400 });

    const { data: job } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id, user_id, team_id, processing_path, status")
      .eq("id", jobId)
      .single();

    if (!job || job.user_id !== userId || job.team_id !== teamId) {
      return NextResponse.json({ ok: false, error: "job not found" }, { status: 404 });
    }
    if (job.processing_path !== "large") {
      return NextResponse.json({ ok: false, error: "wrong processing path" }, { status: 400 });
    }
    if (job.status !== "uploading") {
      return NextResponse.json({ ok: false, error: `job not in uploading state (status=${job.status})` }, { status: 409 });
    }

    // Count actual chunks present
    const { data: chunks } = await supabaseAdmin
      .from("ai_clip_audio_chunks")
      .select("chunk_index")
      .eq("job_id", jobId);

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ ok: false, error: "no chunks uploaded" }, { status: 400 });
    }

    // Verify contiguous from 0..N-1
    const indices = chunks.map((c) => c.chunk_index).sort((a, b) => a - b);
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] !== i) {
        return NextResponse.json({ ok: false, error: `missing chunk at index ${i}` }, { status: 400 });
      }
    }
    const chunksTotal = indices.length;

    // Commit job: set total + transcribing
    await supabaseAdmin
      .from("ai_clip_jobs")
      .update({
        audio_chunks_total: chunksTotal,
        status: "transcribing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Dispatch matrix workflow
    const ghPat = process.env.GITHUB_PAT;
    const ghRepo = process.env.GITHUB_REPO;  // e.g. "mateo2lit/clip-scheduler"
    if (!ghPat || !ghRepo) {
      return NextResponse.json({ ok: false, error: "github dispatch env not configured" }, { status: 500 });
    }

    const dispatchRes = await fetch(
      `${GITHUB_API}/repos/${ghRepo}/actions/workflows/${TRANSCRIBE_WORKFLOW_FILENAME}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ghPat}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            job_id: jobId,
            chunks_total: String(chunksTotal),
          },
        }),
      }
    );

    if (!dispatchRes.ok) {
      const body = await dispatchRes.text();
      // Roll back to uploading so user can retry
      await supabaseAdmin
        .from("ai_clip_jobs")
        .update({ status: "uploading", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      return NextResponse.json(
        { ok: false, error: `dispatch failed: ${dispatchRes.status} ${body}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, chunksTotal });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke test with curl**

After uploading at least one chunk via Task 6:

```bash
curl -X POST http://localhost:3000/api/ai-clips/large/<jobId>/start \
  -H "Authorization: Bearer <your-supabase-access-token>"
```

Expected: `{ "ok": true, "chunksTotal": 1 }`. The `ai_clip_jobs` row's `status` updates to `transcribing` and `audio_chunks_total` gets set. A workflow run appears in GitHub Actions (the workflow itself doesn't exist yet — Task 14 creates it. Until then dispatch will return 404 from GitHub. That's fine; the smoke test for this task is purely the rollback path.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai-clips/large/[id]/start/route.ts
git commit -m "feat(ai-clips): large/[id]/start API route"
```

---

## Task 8: Codec capability detection (browser)

**Files:**
- Create: `src/lib/aiClips/codecDetect.ts`

- [ ] **Step 1: Create the module**

```ts
// src/lib/aiClips/codecDetect.ts
import type { CodecCapabilities } from "@/types/aiClipsLarge";

const MOBILE_UA_RE = /Mobi|Android|iPhone|iPad|iPod/i;

async function detectContainer(file: File): Promise<CodecCapabilities["container"]> {
  // Check magic bytes (first 12 bytes are enough for most containers)
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  // ftyp box at offset 4 → MP4-family
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    // major brand at offset 8
    const majorBrand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (majorBrand === "qt  ") return "mov";
    return "mp4";
  }

  // EBML/Matroska header: 0x1A 0x45 0xDF 0xA3
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    // distinguishing webm from mkv requires reading DocType — for our purposes treat both as 'mkv'
    if (file.type === "video/webm") return "webm";
    return "mkv";
  }

  return "other";
}

async function checkAudioEncoderOpus(): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const probe = await AudioEncoder.isConfigSupported({
      codec: "opus",
      sampleRate: 16000,
      numberOfChannels: 1,
      bitrate: 24000,
    });
    return !!probe.supported;
  } catch {
    return false;
  }
}

async function checkVideoEncoderH264(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    const probe = await VideoEncoder.isConfigSupported({
      codec: "avc1.42E01E",  // H.264 baseline level 3.0
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      framerate: 30,
    });
    return !!probe.supported;
  } catch {
    return false;
  }
}

export async function detectCodecCapabilities(file: File): Promise<CodecCapabilities> {
  const isMobile = typeof navigator !== "undefined" && MOBILE_UA_RE.test(navigator.userAgent);
  const container = await detectContainer(file);
  const reasons: string[] = [];

  const audioOk = await checkAudioEncoderOpus();
  const videoOk = await checkVideoEncoderH264();
  const webcodecsAvailable = audioOk && videoOk;

  if (!audioOk) reasons.push("Browser cannot encode Opus audio (WebCodecs AudioEncoder unsupported).");
  if (!videoOk) reasons.push("Browser cannot encode H.264 video (WebCodecs VideoEncoder unsupported).");

  // Mobile: refuse the large-file path even if WebCodecs reports supported
  // (memory limits + thermal throttling make it unreliable)
  if (isMobile) {
    reasons.push("Large-file processing isn't supported on mobile — try a desktop browser, or paste a URL instead.");
    return { canExtract: false, encoder: null, container, isMobile, reasons };
  }

  if (webcodecsAvailable && container === "mp4") {
    return { canExtract: true, encoder: "webcodecs", container, isMobile, reasons: [] };
  }

  // Non-MP4 containers fall back to FFmpeg.wasm (slower, larger bundle).
  // We still require a working WebCodecs encoder for the final clip output, OR FFmpeg can do encode too.
  if (container !== "mp4") {
    return { canExtract: true, encoder: "ffmpegwasm", container, isMobile, reasons: [] };
  }

  // MP4 but no WebCodecs → fall back to FFmpeg.wasm
  return { canExtract: true, encoder: "ffmpegwasm", container, isMobile, reasons };
}
```

- [ ] **Step 2: Verify in a browser console**

Open the dev server, navigate to `/ai-clips`, open devtools → Console, paste:

```js
import("/src/lib/aiClips/codecDetect.ts").then(async (m) => {
  // Pick a small test file via a hidden file input or use one already loaded
  const file = await fetch("/some-test.mp4").then(r => r.blob());
  const f = new File([file], "test.mp4", { type: "video/mp4" });
  console.log(await m.detectCodecCapabilities(f));
});
```

Expected on Chrome desktop with an MP4: `{ canExtract: true, encoder: "webcodecs", container: "mp4", isMobile: false, reasons: [] }`.

(Doing this from the page is easier — see the Task 16 page integration which exposes this naturally.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiClips/codecDetect.ts
git commit -m "feat(ai-clips): codec capability detection"
```

---

## Task 9: Audio extractor (WebCodecs + mp4box.js)

**Files:**
- Create: `src/lib/aiClips/audioExtractor.ts`

This is the most complex browser-side module. It demuxes the MP4, decodes audio frames via WebCodecs, re-encodes them as Opus, and yields 30s chunks.

- [ ] **Step 1: Create the module**

```ts
// src/lib/aiClips/audioExtractor.ts
// MP4 path only. FFmpeg.wasm fallback lives in ffmpegFallback.ts.

import MP4Box, { type MP4ArrayBuffer, type MP4Info, type MP4Sample } from "mp4box";
import type { AudioChunkMeta } from "@/types/aiClipsLarge";

export type ExtractedChunk = AudioChunkMeta & { blob: Blob };

export type ExtractOptions = {
  chunkSeconds?: number;       // default 30
  onProgress?: (sec: number, totalSec: number) => void;
};

const DEFAULT_CHUNK_SECONDS = 30;
const TARGET_SAMPLE_RATE = 16000;
const TARGET_CHANNELS = 1;
const TARGET_BITRATE = 24000;

/**
 * Async generator: extracts audio from `file` and yields ExtractedChunk objects
 * each containing a single Opus-encoded blob covering ~chunkSeconds of audio.
 *
 * Container limitation: MP4/MOV only. Use ffmpegFallback for other containers.
 */
export async function* extractAudioChunks(
  file: File,
  opts: ExtractOptions = {}
): AsyncGenerator<ExtractedChunk> {
  const chunkSeconds = opts.chunkSeconds ?? DEFAULT_CHUNK_SECONDS;

  const mp4 = MP4Box.createFile();
  const info = await new Promise<MP4Info>((resolve, reject) => {
    mp4.onError = (e: any) => reject(new Error(`mp4box error: ${e}`));
    mp4.onReady = (info: MP4Info) => resolve(info);
    streamFileToMp4(file, mp4).catch(reject);
  });

  const audioTrack = info.tracks.find((t) => t.type === "audio");
  if (!audioTrack) throw new Error("No audio track in source file.");

  const totalDurationSec = (info.duration / info.timescale) || 0;

  // Set up WebCodecs AudioDecoder to turn track samples into PCM frames.
  const decodedFrames: AudioData[] = [];
  let decoderError: Error | null = null;

  const decoder = new AudioDecoder({
    output: (frame) => decodedFrames.push(frame),
    error: (e) => { decoderError = e instanceof Error ? e : new Error(String(e)); },
  });

  // Decoder config: pulled from track
  const codec = (audioTrack as any).codec || "mp4a.40.2";  // AAC LC default
  decoder.configure({
    codec,
    sampleRate: audioTrack.audio?.sample_rate ?? 48000,
    numberOfChannels: audioTrack.audio?.channel_count ?? 2,
  });

  // Set up WebCodecs AudioEncoder for Opus output
  const encodedChunks: { data: Uint8Array; timestamp: number; duration: number }[] = [];
  let encoderError: Error | null = null;

  const encoder = new AudioEncoder({
    output: (chunk, _meta) => {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      encodedChunks.push({ data: buf, timestamp: chunk.timestamp, duration: chunk.duration ?? 0 });
    },
    error: (e) => { encoderError = e instanceof Error ? e : new Error(String(e)); },
  });

  await encoder.configure({
    codec: "opus",
    sampleRate: TARGET_SAMPLE_RATE,
    numberOfChannels: TARGET_CHANNELS,
    bitrate: TARGET_BITRATE,
  });

  // Walk track samples, feed decoder, then on each decoded frame feed encoder
  // (resampling/downmix done by the encoder via WebCodecs).
  mp4.setExtractionOptions(audioTrack.id, null, { nbSamples: 100 });

  let chunkIndex = 0;
  let chunkStartSec = 0;
  let pendingDurationSec = 0;
  let chunkBlobParts: Uint8Array[] = [];

  const flushChunk = (): ExtractedChunk | null => {
    if (chunkBlobParts.length === 0) return null;
    const blob = new Blob(chunkBlobParts, { type: "audio/ogg; codecs=opus" });
    const out: ExtractedChunk = {
      index: chunkIndex,
      startSec: chunkStartSec,
      endSec: chunkStartSec + pendingDurationSec,
      blob,
    };
    chunkIndex++;
    chunkStartSec = out.endSec;
    pendingDurationSec = 0;
    chunkBlobParts = [];
    return out;
  };

  const samplesQueue: MP4Sample[] = [];
  let extractDone = false;

  mp4.onSamples = (_id: number, _user: any, samples: MP4Sample[]) => {
    samplesQueue.push(...samples);
  };
  mp4.start();

  // Drive samples → decoder → encoder → flushChunk loop until done
  // (mp4box delivers samples synchronously inside flush; but appendBuffer is async)

  // After mp4 is fully fed, samplesQueue contains all audio samples
  while (samplesQueue.length || decodedFrames.length || encodedChunks.length || !extractDone) {
    if (decoderError) throw decoderError;
    if (encoderError) throw encoderError;

    // Feed decoder from sample queue
    while (samplesQueue.length) {
      const s = samplesQueue.shift()!;
      decoder.decode(new EncodedAudioChunk({
        type: s.is_sync ? "key" : "delta",
        timestamp: (s.cts / s.timescale) * 1_000_000,
        duration: (s.duration / s.timescale) * 1_000_000,
        data: s.data,
      }));
    }
    if (decoder.decodeQueueSize > 0) {
      await decoder.flush().catch(() => undefined);
    }

    // Feed encoder from decoded frames
    while (decodedFrames.length) {
      const frame = decodedFrames.shift()!;
      encoder.encode(frame);
      frame.close();
    }
    if (encoder.encodeQueueSize > 0) {
      await encoder.flush().catch(() => undefined);
    }

    // Drain encoded chunks into the in-progress audio chunk
    while (encodedChunks.length) {
      const ec = encodedChunks.shift()!;
      chunkBlobParts.push(ec.data);
      pendingDurationSec += (ec.duration || 20_000) / 1_000_000;  // µs → s
      if (pendingDurationSec >= chunkSeconds) {
        const out = flushChunk();
        if (out) {
          opts.onProgress?.(out.endSec, totalDurationSec);
          yield out;
        }
      }
    }

    if (samplesQueue.length === 0 && decodedFrames.length === 0 && encodedChunks.length === 0) {
      extractDone = true;
    }
  }

  // Final flush
  await encoder.flush();
  while (encodedChunks.length) {
    const ec = encodedChunks.shift()!;
    chunkBlobParts.push(ec.data);
    pendingDurationSec += (ec.duration || 20_000) / 1_000_000;
  }
  const tail = flushChunk();
  if (tail) {
    opts.onProgress?.(tail.endSec, totalDurationSec);
    yield tail;
  }

  encoder.close();
  decoder.close();
}

async function streamFileToMp4(file: File, mp4: any): Promise<void> {
  const reader = file.stream().getReader();
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      mp4.flush();
      return;
    }
    const ab = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as MP4ArrayBuffer;
    (ab as any).fileStart = offset;
    mp4.appendBuffer(ab);
    offset += value.byteLength;
  }
}

export async function probeMp4DurationSeconds(file: File): Promise<number> {
  const mp4 = MP4Box.createFile();
  const info = await new Promise<MP4Info>((resolve, reject) => {
    mp4.onError = (e: any) => reject(new Error(`mp4box error: ${e}`));
    mp4.onReady = (info: MP4Info) => resolve(info);
    // Only stream the head — most MP4 moov atoms are within first 5 MB.
    // For non-faststart files the moov is at the end; in that case we fall through
    // and consume the whole file. Acceptable for this probe.
    streamFileToMp4(file, mp4).catch(reject);
  });
  return info.duration / info.timescale;
}
```

- [ ] **Step 2: Manual browser smoke test**

This is hard to verify until the page integration in Task 16. Plan to defer end-to-end verification to that step. For now, ensure it compiles:

```bash
npx tsc --noEmit src/lib/aiClips/audioExtractor.ts
```

Expected: no errors. If TypeScript complains about WebCodecs types, add `"DOM"` and `"DOM.Iterable"` to `tsconfig.json` lib (already present in default Next.js setup).

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiClips/audioExtractor.ts
git commit -m "feat(ai-clips): WebCodecs audio extractor for MP4 sources"
```

---

## Task 10: FFmpeg.wasm fallback extractor

**Files:**
- Create: `src/lib/aiClips/ffmpegFallback.ts`

For non-MP4 containers (MKV, WebM, MOV, etc.) — lazy-loaded only when needed.

- [ ] **Step 1: Create the module**

```ts
// src/lib/aiClips/ffmpegFallback.ts
import type { ExtractedChunk, ExtractOptions } from "@/lib/aiClips/audioExtractor";

let ffmpegPromise: Promise<any> | null = null;

async function loadFfmpeg() {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ffmpeg = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ffmpeg;
  })();
  return ffmpegPromise;
}

export async function* extractAudioChunksFfmpeg(
  file: File,
  opts: ExtractOptions = {}
): AsyncGenerator<ExtractedChunk> {
  const chunkSeconds = opts.chunkSeconds ?? 30;
  const ffmpeg = await loadFfmpeg();

  const inputName = "input." + (file.name.split(".").pop() || "bin");
  await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));

  // First pass: probe duration
  let totalSec = 0;
  ffmpeg.on("log", ({ message }: { message: string }) => {
    const m = /Duration:\s+(\d+):(\d+):(\d+\.\d+)/.exec(message);
    if (m) totalSec = +m[1] * 3600 + +m[2] * 60 + +m[3];
  });
  await ffmpeg.exec(["-i", inputName]).catch(() => undefined);  // probe-only; fails with no output

  if (!totalSec) throw new Error("Could not determine audio duration via FFmpeg.wasm.");

  const numChunks = Math.ceil(totalSec / chunkSeconds);
  for (let i = 0; i < numChunks; i++) {
    const startSec = i * chunkSeconds;
    const endSec = Math.min(startSec + chunkSeconds, totalSec);
    const outName = `chunk_${i}.opus`;
    await ffmpeg.exec([
      "-ss", String(startSec),
      "-t", String(endSec - startSec),
      "-i", inputName,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "libopus",
      "-b:a", "24k",
      outName,
    ]);
    const data = await ffmpeg.readFile(outName);
    const blob = new Blob([data as Uint8Array], { type: "audio/ogg; codecs=opus" });
    await ffmpeg.deleteFile(outName);
    opts.onProgress?.(endSec, totalSec);
    yield { index: i, startSec, endSec, blob };
  }

  await ffmpeg.deleteFile(inputName);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/lib/aiClips/ffmpegFallback.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiClips/ffmpegFallback.ts
git commit -m "feat(ai-clips): FFmpeg.wasm fallback extractor"
```

---

## Task 11: Chunked uploader with retry

**Files:**
- Create: `src/lib/aiClips/chunkedUploader.ts`

- [ ] **Step 1: Create the module**

```ts
// src/lib/aiClips/chunkedUploader.ts
import type { ExtractedChunk } from "@/lib/aiClips/audioExtractor";
import type { ChunkUploadToken } from "@/types/aiClipsLarge";

export type UploadOptions = {
  endpoint?: string;            // default "/api/ai-clips/audio-chunk"
  maxAttempts?: number;         // default 3
  onChunkUploaded?: (index: number, total: number | null) => void;
};

const DEFAULT_ENDPOINT = "/api/ai-clips/audio-chunk";
const DEFAULT_MAX_ATTEMPTS = 3;

export async function uploadChunkStream(
  chunks: AsyncIterable<ExtractedChunk>,
  token: ChunkUploadToken,
  opts: UploadOptions = {}
): Promise<{ chunksUploaded: number }> {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let count = 0;

  for await (const chunk of chunks) {
    let attempt = 0;
    let lastErr: Error | null = null;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        await uploadOne(endpoint, token, chunk);
        count++;
        opts.onChunkUploaded?.(chunk.index, null);
        lastErr = null;
        break;
      } catch (e: any) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (attempt < maxAttempts) {
          const backoffMs = 500 * Math.pow(2, attempt - 1) + Math.random() * 250;
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }
    if (lastErr) throw new Error(`Chunk ${chunk.index} upload failed after ${maxAttempts} attempts: ${lastErr.message}`);
  }

  return { chunksUploaded: count };
}

async function uploadOne(endpoint: string, token: ChunkUploadToken, chunk: ExtractedChunk): Promise<void> {
  const fd = new FormData();
  fd.append("token", token);
  fd.append("index", String(chunk.index));
  fd.append("startSec", String(chunk.startSec));
  fd.append("endSec", String(chunk.endSec));
  fd.append("chunk", chunk.blob, `chunk_${String(chunk.index).padStart(3, "0")}.opus`);

  const res = await fetch(endpoint, { method: "POST", body: fd });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`API error: ${json.error || "unknown"}`);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/lib/aiClips/chunkedUploader.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiClips/chunkedUploader.ts
git commit -m "feat(ai-clips): chunked uploader with retry"
```

---

## Task 12: Lazy clip encoder (browser, WebCodecs)

**Files:**
- Create: `src/lib/aiClips/clipEncoder.ts`

This runs only when the user clicks Schedule on a specific moment. Cuts a frame-accurate clip from the original file and re-encodes at ~8 Mbps H.264.

- [ ] **Step 1: Create the module**

```ts
// src/lib/aiClips/clipEncoder.ts
import MP4Box, { type MP4ArrayBuffer, type MP4Info, type MP4Sample } from "mp4box";

export type EncodeClipOptions = {
  startSec: number;
  endSec: number;
  bitrate?: number;       // default 8 Mbps
  width?: number;         // default: source width
  height?: number;        // default: source height
  framerate?: number;     // default: 30
  onProgress?: (frameIdx: number, totalFrames: number) => void;
};

const DEFAULT_BITRATE = 8_000_000;

/**
 * Encode a single clip as MP4/H.264 + AAC. Frame-accurate at the start by seeking
 * to the keyframe before startSec and dropping pre-roll frames.
 *
 * MP4-only. For other containers, route via FFmpeg.wasm in a future task — out of
 * scope for v1 since clip encode is on-demand and most sources are MP4.
 */
export async function encodeClip(file: File, opts: EncodeClipOptions): Promise<Blob> {
  const { startSec, endSec } = opts;
  const targetBitrate = opts.bitrate ?? DEFAULT_BITRATE;

  // Demux source to find video track + sample positions
  const mp4 = MP4Box.createFile();
  const info = await new Promise<MP4Info>((resolve, reject) => {
    mp4.onError = (e: any) => reject(new Error(`mp4box error: ${e}`));
    mp4.onReady = (info: MP4Info) => resolve(info);
    streamFileToMp4(file, mp4).catch(reject);
  });

  const videoTrack = info.tracks.find((t) => t.type === "video");
  if (!videoTrack) throw new Error("No video track in source.");

  const width = opts.width ?? (videoTrack as any).video?.width ?? 1920;
  const height = opts.height ?? (videoTrack as any).video?.height ?? 1080;
  const framerate = opts.framerate ?? 30;

  // Pull samples that intersect [startSec, endSec]
  const desiredStartUs = startSec * 1_000_000;
  const desiredEndUs = endSec * 1_000_000;

  // Set up decoder + encoder
  const decodedFrames: VideoFrame[] = [];
  let decoderError: Error | null = null;
  const decoder = new VideoDecoder({
    output: (f) => decodedFrames.push(f),
    error: (e) => { decoderError = e instanceof Error ? e : new Error(String(e)); },
  });
  decoder.configure({
    codec: (videoTrack as any).codec || "avc1.42E01E",
    codedWidth: (videoTrack as any).video?.width ?? width,
    codedHeight: (videoTrack as any).video?.height ?? height,
    description: extractAvcConfig(mp4, videoTrack.id),
  });

  const encodedChunks: { data: Uint8Array; timestamp: number; duration: number; type: "key" | "delta" }[] = [];
  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      encodedChunks.push({
        data: buf,
        timestamp: chunk.timestamp,
        duration: chunk.duration ?? 0,
        type: chunk.type as "key" | "delta",
      });
    },
    error: (e) => { encoderError = e instanceof Error ? e : new Error(String(e)); },
  });
  await encoder.configure({
    codec: "avc1.42E01E",
    width,
    height,
    bitrate: targetBitrate,
    framerate,
  });

  // Walk samples, decode those that contribute to our window (back to nearest keyframe before start)
  mp4.setExtractionOptions(videoTrack.id, null, { nbSamples: 60 });

  const samples: MP4Sample[] = [];
  mp4.onSamples = (_id: number, _user: any, batch: MP4Sample[]) => {
    samples.push(...batch);
  };
  mp4.start();

  // Find keyframe at-or-before desiredStartUs
  let firstKeyframeIdx = 0;
  for (let i = 0; i < samples.length; i++) {
    const sUs = (samples[i].cts / samples[i].timescale) * 1_000_000;
    if (samples[i].is_sync && sUs <= desiredStartUs) firstKeyframeIdx = i;
    if (sUs > desiredEndUs) break;
  }

  let totalFrames = 0;
  for (let i = firstKeyframeIdx; i < samples.length; i++) {
    const s = samples[i];
    const sUs = (s.cts / s.timescale) * 1_000_000;
    if (sUs > desiredEndUs) break;
    decoder.decode(new EncodedVideoChunk({
      type: s.is_sync ? "key" : "delta",
      timestamp: sUs,
      duration: (s.duration / s.timescale) * 1_000_000,
      data: s.data,
    }));
    totalFrames++;
  }

  await decoder.flush();
  if (decoderError) throw decoderError;

  // Re-encode each decoded frame, skipping any whose timestamp is before desiredStartUs
  let outFrameIdx = 0;
  for (const frame of decodedFrames) {
    if (frame.timestamp < desiredStartUs) {
      frame.close();
      continue;
    }
    if (frame.timestamp > desiredEndUs) {
      frame.close();
      continue;
    }
    encoder.encode(frame, { keyFrame: outFrameIdx === 0 });
    frame.close();
    outFrameIdx++;
    opts.onProgress?.(outFrameIdx, totalFrames);
  }
  await encoder.flush();
  if (encoderError) throw encoderError;

  encoder.close();
  decoder.close();

  // Mux encoded chunks back into MP4 container.
  // mp4box.js can mux too — see https://github.com/gpac/mp4box.js/wiki/MP4Box.js-Encoding-API
  const muxed = await muxAvcChunksToMp4(encodedChunks, { width, height, framerate });
  return new Blob([muxed], { type: "video/mp4" });
}

function extractAvcConfig(mp4: any, trackId: number): Uint8Array {
  // Pull avcC box from the track's sample description and serialise to bytes.
  const trak = mp4.getTrackById(trackId);
  const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  const avcC = entry?.avcC;
  if (!avcC) throw new Error("Source track is missing avcC box (not H.264?)");

  // mp4box.js v1.4+ exposes a DataStream class; write the box and return its buffer.
  const DataStream = (MP4Box as any).DataStream;
  const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
  // Write only the avcC payload (skip the box header — WebCodecs expects the raw record).
  stream.endianness = DataStream.BIG_ENDIAN;
  avcC.write(stream);
  // The avcC.write helper writes a full box; strip the leading 8-byte size+type header.
  return new Uint8Array(stream.buffer, 8);
}

async function muxAvcChunksToMp4(
  chunks: { data: Uint8Array; timestamp: number; duration: number; type: "key" | "delta" }[],
  cfg: { width: number; height: number; framerate: number }
): Promise<Uint8Array> {
  // Real impl: use mp4box.js BoxBuilder API or a lightweight muxer like mp4-muxer
  // (https://github.com/Vanilagy/mp4-muxer). Both produce correct fragmented MP4.
  //
  // Pseudo-code (replace with real muxer call):
  //   const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width, height } });
  //   for (const c of chunks) muxer.addVideoChunk(new EncodedVideoChunk(...), null);
  //   muxer.finalize();
  //   return new Uint8Array(muxer.target.buffer);
  //
  // Implementation TODO (carry into v1 work): adopt mp4-muxer for simplicity.
  throw new Error("muxAvcChunksToMp4 not yet implemented — install mp4-muxer in a follow-up commit and wire here");
}

async function streamFileToMp4(file: File, mp4: any): Promise<void> {
  const reader = file.stream().getReader();
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      mp4.flush();
      return;
    }
    const ab = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as MP4ArrayBuffer;
    (ab as any).fileStart = offset;
    mp4.appendBuffer(ab);
    offset += value.byteLength;
  }
}
```

**Note:** the muxing piece is the hard part. The simplest production-ready option is to add `mp4-muxer` (https://www.npmjs.com/package/mp4-muxer) as a dep:

```bash
npm install mp4-muxer
```

Then `muxAvcChunksToMp4` becomes ~15 lines. Add this dep + complete the function before considering Task 12 done.

- [ ] **Step 2: Add `mp4-muxer` and complete the muxer**

```bash
npm install mp4-muxer
```

Replace the `muxAvcChunksToMp4` function body with:

```ts
async function muxAvcChunksToMp4(
  chunks: { data: Uint8Array; timestamp: number; duration: number; type: "key" | "delta" }[],
  cfg: { width: number; height: number; framerate: number }
): Promise<Uint8Array> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: "avc",
      width: cfg.width,
      height: cfg.height,
      frameRate: cfg.framerate,
    },
    fastStart: "in-memory",
  });
  for (const c of chunks) {
    muxer.addVideoChunk(
      new EncodedVideoChunk({
        type: c.type,
        timestamp: c.timestamp,
        duration: c.duration,
        data: c.data,
      }),
      undefined
    );
  }
  muxer.finalize();
  return new Uint8Array((muxer.target as any).buffer);
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit src/lib/aiClips/clipEncoder.ts
```

End-to-end browser verification deferred to Task 16 (page integration).

- [ ] **Step 4: Commit**

```bash
git add src/lib/aiClips/clipEncoder.ts package.json package-lock.json
git commit -m "feat(ai-clips): WebCodecs lazy clip encoder"
```

---

## Task 13: Server-side transcript merge module

**Files:**
- Create: `src/lib/aiClipsTranscriptMerge.ts`

This is pure logic, runnable in Node (no browser deps). The merge workflow imports it.

- [ ] **Step 1: Create the module**

```ts
// src/lib/aiClipsTranscriptMerge.ts
// Pure transcript merge / dedup logic. Used by ai-clips-merge.yml workflow.

export type WordSegment = {
  start: number;   // seconds (within parent chunk's local time)
  end: number;
  word: string;
};

export type ChunkTranscript = {
  chunk_index: number;
  start_sec: number;        // chunk's start in source-video time
  end_sec: number;
  transcript: string;
  word_segments_json: WordSegment[];
};

export type MergedTranscript = {
  transcript: string;
  word_segments_json: WordSegment[];  // timestamps shifted to source-video time
};

/**
 * Merge sequential chunk transcripts into one. Dedupes 5-second overlap windows by
 * word timestamps with a 250 ms tolerance.
 *
 * Assumptions:
 *  - Chunks are passed in sorted by chunk_index already.
 *  - Word timestamps within a chunk are LOCAL to that chunk (start at 0).
 */
export function mergeChunkTranscripts(
  chunks: ChunkTranscript[],
  overlapToleranceSec = 0.25
): MergedTranscript {
  const sorted = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index);
  const merged: WordSegment[] = [];
  let lastEmittedEndSec = -Infinity;

  for (const chunk of sorted) {
    const offset = chunk.start_sec;
    for (const w of (chunk.word_segments_json ?? [])) {
      const absStart = w.start + offset;
      const absEnd = w.end + offset;
      // Skip if a word covering ~the same start time was already emitted
      if (absStart <= lastEmittedEndSec - overlapToleranceSec) continue;
      merged.push({ start: absStart, end: absEnd, word: w.word });
      if (absEnd > lastEmittedEndSec) lastEmittedEndSec = absEnd;
    }
  }

  // Reassemble human-readable transcript from words
  const text = merged.map((w) => w.word).join(" ").replace(/\s+([.,!?;:])/g, "$1").trim();
  return { transcript: text, word_segments_json: merged };
}
```

- [ ] **Step 2: Verify with a Node script**

Create a scratch file `scratch/test-merge.mjs`:

```js
import { mergeChunkTranscripts } from "../src/lib/aiClipsTranscriptMerge.ts";

const result = mergeChunkTranscripts([
  {
    chunk_index: 0,
    start_sec: 0,
    end_sec: 35,
    transcript: "hello world this is a test",
    word_segments_json: [
      { start: 0.0, end: 0.5, word: "hello" },
      { start: 0.6, end: 1.0, word: "world" },
      { start: 30.0, end: 30.5, word: "test" },
    ],
  },
  {
    chunk_index: 1,
    start_sec: 30,
    end_sec: 65,
    // 5s overlap with chunk 0; "test" appears in both at the boundary
    transcript: "test continuing further",
    word_segments_json: [
      { start: 0.0, end: 0.5, word: "test" },        // dup of chunk 0's "test" at 30s
      { start: 1.0, end: 1.5, word: "continuing" },
      { start: 2.0, end: 2.4, word: "further" },
    ],
  },
]);

console.log(JSON.stringify(result, null, 2));
```

Run:

```bash
npx tsx scratch/test-merge.mjs
```

Expected: the second chunk's "test" word is dropped (overlap dedup); the merged transcript reads "hello world test continuing further".

Delete the scratch file after verification.

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiClipsTranscriptMerge.ts
git commit -m "feat(ai-clips): pure transcript merge with overlap dedup"
```

---

## Task 14: Email template `sendAiClipsReady`

**Files:**
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Add the template at the bottom of `src/lib/email.ts`**

```ts
// Append to src/lib/email.ts

export async function sendAiClipsReady(opts: {
  to: string;
  jobId: string;
  clipCount: number;
  sourceMinutes: number;
}): Promise<void> {
  if (!resend) return;
  const { to, jobId, clipCount, sourceMinutes } = opts;
  const url = appUrl(`/ai-clips/${jobId}`);
  const subject = `Your AI clips are ready (${clipCount} clip${clipCount === 1 ? "" : "s"} from ${Math.round(sourceMinutes)} min)`;

  const html = `
<!doctype html>
<html>
<body style="font-family:Inter,Arial,sans-serif;background:#050505;color:#fff;padding:32px;">
  <h2 style="margin-top:0;">Your AI clips are ready</h2>
  <p>${escapeHtml(BRAND_NAME)} just finished processing your video.</p>
  <p style="margin:16px 0;">
    <strong>${clipCount}</strong> clip${clipCount === 1 ? "" : "s"} generated from
    <strong>${Math.round(sourceMinutes)}</strong> minutes of source video.
  </p>
  <p>
    <a href="${url}"
       style="display:inline-block;padding:12px 20px;background:linear-gradient(135deg,#8b5cf6,#a855f7);color:#fff;text-decoration:none;border-radius:12px;font-weight:600;">
      View clips →
    </a>
  </p>
  <p style="font-size:12px;color:#888;margin-top:24px;">
    You're receiving this because you enabled email notifications for AI Clips.
    Disable in <a href="${appUrl("/settings")}" style="color:#a855f7;">Settings</a>.
  </p>
</body>
</html>`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });
}
```

- [ ] **Step 2: Smoke test in a Node REPL or manual call**

Trigger from a one-off API route call or a scratch script with `RESEND_API_KEY` set. Easier: defer to Task 15's workflow which calls this in real conditions.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat(ai-clips): email template for clips-ready notification"
```

---

## Task 15: Matrix transcribe-chunk workflow

**Files:**
- Create: `.github/workflows/ai-clips-transcribe-chunk.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/ai-clips-transcribe-chunk.yml
name: AI Clips — Transcribe Chunks (matrix)

on:
  workflow_dispatch:
    inputs:
      job_id:
        description: "ai_clip_jobs row ID"
        required: true
      chunks_total:
        description: "Total number of audio chunks to transcribe"
        required: true

jobs:
  build-matrix:
    runs-on: ubuntu-latest
    outputs:
      indices: ${{ steps.gen.outputs.indices }}
    steps:
      - name: Generate chunk index matrix
        id: gen
        run: |
          N=${{ inputs.chunks_total }}
          INDICES=$(python3 -c "import json; print(json.dumps(list(range(int('$N')))))")
          echo "indices=$INDICES" >> $GITHUB_OUTPUT

  transcribe:
    needs: build-matrix
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      max-parallel: 20
      matrix:
        chunk_index: ${{ fromJSON(needs.build-matrix.outputs.indices) }}
    continue-on-error: true
    steps:
      - name: Install dependencies
        run: |
          if ! command -v ffmpeg &>/dev/null; then
            sudo apt-get update -qq
            sudo apt-get install -y --no-install-recommends ffmpeg
          fi
          pip install -q faster-whisper

      - name: Download chunk
        run: |
          IDX=${{ matrix.chunk_index }}
          PADDED=$(printf "%03d" $IDX)
          STORAGE_PATH="ai_audio_chunks/${{ inputs.job_id }}/chunk_${PADDED}.opus"
          curl -fsS -o /tmp/chunk.opus \
            "${{ secrets.SUPABASE_URL }}/storage/v1/object/clips/${STORAGE_PATH}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
          ls -la /tmp/chunk.opus

      - name: Mark chunk as transcribing
        run: |
          curl -sS -X PATCH \
            "${{ secrets.SUPABASE_URL }}/rest/v1/ai_clip_audio_chunks?job_id=eq.${{ inputs.job_id }}&chunk_index=eq.${{ matrix.chunk_index }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "apikey: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"status":"transcribing","updated_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'

      - name: Transcribe with distil-whisper
        run: |
          python3 - <<'PYEOF'
          import json
          from faster_whisper import WhisperModel

          # distil-whisper-medium.en is fast on CPU and high quality for English.
          model = WhisperModel("distil-medium.en", device="cpu", compute_type="int8")
          segments, info = model.transcribe(
              "/tmp/chunk.opus",
              beam_size=5,
              language="en",
              vad_filter=True,
              word_timestamps=True,
          )

          words = []
          lines = []
          for seg in segments:
              lines.append(seg.text.strip())
              if seg.words:
                  for w in seg.words:
                      words.append({"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word.strip()})

          out = {"transcript": " ".join(lines), "word_segments_json": words}
          with open("/tmp/result.json", "w") as f:
              json.dump(out, f)
          print(f"Transcribed {len(words)} words")
          PYEOF

      - name: Persist chunk result
        run: |
          BODY=$(jq -Rs --argjson result "$(cat /tmp/result.json)" '{
            status: "done",
            transcript: $result.transcript,
            word_segments_json: $result.word_segments_json,
            updated_at: (now | todate)
          } * {transcript: $result.transcript, word_segments_json: $result.word_segments_json}' <<<'')
          curl -sS -X PATCH \
            "${{ secrets.SUPABASE_URL }}/rest/v1/ai_clip_audio_chunks?job_id=eq.${{ inputs.job_id }}&chunk_index=eq.${{ matrix.chunk_index }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "apikey: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d @/tmp/result.json

      - name: Mark chunk failed on error
        if: failure()
        run: |
          curl -sS -X PATCH \
            "${{ secrets.SUPABASE_URL }}/rest/v1/ai_clip_audio_chunks?job_id=eq.${{ inputs.job_id }}&chunk_index=eq.${{ matrix.chunk_index }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "apikey: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"status":"failed","error":"transcribe job failed"}'

  trigger-merge:
    needs: transcribe
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Dispatch merge workflow
        run: |
          curl -fsS -X POST \
            "https://api.github.com/repos/${{ github.repository }}/actions/workflows/ai-clips-merge.yml/dispatches" \
            -H "Authorization: Bearer ${{ secrets.WORKFLOW_DISPATCH_PAT || secrets.GITHUB_TOKEN }}" \
            -H "Accept: application/vnd.github+json" \
            -d '{"ref":"main","inputs":{"job_id":"${{ inputs.job_id }}"}}'
```

**Note on the dispatch PAT:** GitHub-issued `GITHUB_TOKEN` cannot dispatch workflows in the same repo by default. Need either a PAT (`WORKFLOW_DISPATCH_PAT`) or to use `gh workflow run` from a context with `actions: write` permissions. Add to project secrets if not already present.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ai-clips-transcribe-chunk.yml
git commit -m "feat(ai-clips): matrix transcribe-chunk workflow"
```

---

## Task 16: Merge workflow

**Files:**
- Create: `.github/workflows/ai-clips-merge.yml`

This stitches transcripts, runs Claude detection, sends email, cleans up.

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/ai-clips-merge.yml
name: AI Clips — Merge & Detect

on:
  workflow_dispatch:
    inputs:
      job_id:
        description: "ai_clip_jobs row ID"
        required: true

jobs:
  merge:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install minimal deps
        run: npm install --no-save @anthropic-ai/sdk@^0.74.0 @supabase/supabase-js@^2.93.3 tsx

      - name: Fetch chunk results + run merge
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          JOB_ID: ${{ inputs.job_id }}
        run: |
          npx tsx <<'TSEOF'
          import { mergeChunkTranscripts } from "./src/lib/aiClipsTranscriptMerge.ts";
          import Anthropic from "@anthropic-ai/sdk";

          const SB = process.env.SUPABASE_URL!;
          const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
          const JOB = process.env.JOB_ID!;

          async function rest(path: string, init: RequestInit = {}) {
            const r = await fetch(`${SB}/rest/v1/${path}`, {
              ...init,
              headers: {
                ...(init.headers || {}),
                apikey: SR,
                Authorization: `Bearer ${SR}`,
                "Content-Type": "application/json",
              },
            });
            if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
            return r.json();
          }

          // 1. Pull job + chunks
          const [job] = await rest(`ai_clip_jobs?id=eq.${JOB}&select=*`);
          if (!job) throw new Error("job not found");

          const chunks: any[] = await rest(`ai_clip_audio_chunks?job_id=eq.${JOB}&order=chunk_index.asc&select=*`);
          if (!chunks.length) throw new Error("no chunks");

          const failed = chunks.filter((c) => c.status !== "done");
          if (failed.length) {
            await rest(`ai_clip_jobs?id=eq.${JOB}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: "failed",
                error: `${failed.length} chunk(s) failed to transcribe`,
                updated_at: new Date().toISOString(),
              }),
            });
            process.exit(1);
          }

          // 2. Merge
          const merged = mergeChunkTranscripts(chunks);
          await rest(`ai_clip_jobs?id=eq.${JOB}`, {
            method: "PATCH",
            body: JSON.stringify({
              transcript: merged.transcript,
              status: "detecting",
              updated_at: new Date().toISOString(),
            }),
          });

          // 3. Claude detection (single-pass for now; map-reduce TBD if transcript too long)
          const anthropic = new Anthropic();
          const detectPrompt = `You are picking the best ${job.clip_count} short moments from this transcript for social-media clips. Each clip should be 15-90 seconds. Return JSON only:
[{"start_sec":<number>,"end_sec":<number>,"title":"<short>"}]

Transcript:
${merged.transcript.slice(0, 100_000)}`;

          const resp = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2000,
            messages: [{ role: "user", content: detectPrompt }],
          });
          const txt = (resp.content[0] as any).text;
          const jsonMatch = txt.match(/\[[\s\S]*\]/);
          let moments: any[] = [];
          try {
            moments = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
          } catch { moments = []; }

          // Fallback: evenly spaced
          if (!moments.length) {
            const dur = job.source_duration_minutes * 60;
            const step = dur / job.clip_count;
            moments = Array.from({ length: job.clip_count }, (_, i) => ({
              start_sec: Math.round(i * step),
              end_sec: Math.round(i * step + Math.min(60, step * 0.8)),
              title: `Moment ${i + 1}`,
            }));
          }

          // Attach subtitle word_segments per moment
          const enriched = moments.map((m, i) => ({
            index: i,
            start_sec: m.start_sec,
            end_sec: m.end_sec,
            title: m.title || `Moment ${i + 1}`,
            subtitles_json: merged.word_segments_json.filter(
              (w) => w.start >= m.start_sec && w.end <= m.end_sec
            ),
          }));

          await rest(`ai_clip_jobs?id=eq.${JOB}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "done",
              clips_generated: enriched.length,
              result_moments_json: enriched,
              updated_at: new Date().toISOString(),
            }),
          });

          // 4. Email user
          if (job.notify_email && process.env.RESEND_API_KEY) {
            const { createClient } = await import("@supabase/supabase-js");
            const sb = createClient(SB, SR);
            const [team] = await rest(`teams?id=eq.${job.team_id}&select=owner_id`);
            let email: string | null = null;
            if (team?.owner_id) {
              const { data: u } = await sb.auth.admin.getUserById(team.owner_id);
              email = u?.user?.email ?? null;
            }
            if (email) {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: "notifications@clipdash.org",
                  to: email,
                  subject: `Your AI clips are ready (${enriched.length} clips)`,
                  html: `<p>Your clips are ready: <a href="https://clipdash.org/ai-clips/${JOB}">View clips →</a></p>`,
                }),
              });
              await rest(`ai_clip_jobs?id=eq.${JOB}`, {
                method: "PATCH",
                body: JSON.stringify({ notify_email_sent_at: new Date().toISOString() }),
              });
            }
          }

          console.log("Merge + detection complete.");
          TSEOF

      - name: Cleanup audio chunks
        if: success()
        run: |
          curl -sS -X DELETE \
            "${{ secrets.SUPABASE_URL }}/storage/v1/object/clips" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"prefixes":["ai_audio_chunks/${{ inputs.job_id }}/"]}' || true

      - name: Mark job failed on error
        if: failure()
        run: |
          curl -sS -X PATCH \
            "${{ secrets.SUPABASE_URL }}/rest/v1/ai_clip_jobs?id=eq.${{ inputs.job_id }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "apikey: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"status":"failed","error":"merge workflow failed","updated_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ai-clips-merge.yml
git commit -m "feat(ai-clips): merge workflow + Claude detection"
```

---

## Task 17: Page integration

**Files:**
- Modify: `src/app/ai-clips/page.tsx`

The biggest change — wire the auto-routing, replace the hanging `readVideoDuration`, add the new progress UI.

- [ ] **Step 1: Replace `readVideoDuration` and route at file-pick**

In `src/app/ai-clips/page.tsx`, replace lines 52-60 (the existing `readVideoDuration`) with an import + auto-router:

```ts
// Replace lines 52-60 with:
import { detectCodecCapabilities } from "@/lib/aiClips/codecDetect";
import { probeMp4DurationSeconds } from "@/lib/aiClips/audioExtractor";

const FILE_SIZE_THRESHOLD_BYTES = 1024 * 1024 * 1024;       // 1 GB
const DURATION_THRESHOLD_SECONDS = 30 * 60;                 // 30 min

async function readVideoDurationSafe(file: File): Promise<{ minutes: number; useLargePath: boolean; reason?: string }> {
  // Always try mp4box first — it's instant and doesn't hang
  let durationSec = 0;
  try {
    durationSec = await probeMp4DurationSeconds(file);
  } catch {
    // Fall back to <video> blob URL with a 10s timeout for non-MP4 small files
    durationSec = await new Promise<number>((resolve) => {
      const video = document.createElement("video");
      const timer = setTimeout(() => { URL.revokeObjectURL(video.src); resolve(0); }, 10_000);
      video.preload = "metadata";
      video.onloadedmetadata = () => { clearTimeout(timer); URL.revokeObjectURL(video.src); resolve(video.duration); };
      video.onerror = () => { clearTimeout(timer); resolve(0); };
      video.src = URL.createObjectURL(file);
    });
  }

  const minutes = durationSec / 60;
  const useLargePath = file.size > FILE_SIZE_THRESHOLD_BYTES || durationSec > DURATION_THRESHOLD_SECONDS;
  return { minutes: Math.ceil(minutes * 10) / 10, useLargePath };
}
```

- [ ] **Step 2: Update `handleFileSelected` to detect path + caps**

Replace the existing `handleFileSelected` function in `page.tsx:361-366`:

```ts
async function handleFileSelected(selectedFile: File) {
  setFile(selectedFile);
  setSubmitError(null);
  setLargePathRefusal(null);

  const { minutes, useLargePath } = await readVideoDurationSafe(selectedFile);
  setFileDurationMinutes(minutes);

  if (useLargePath) {
    const caps = await detectCodecCapabilities(selectedFile);
    setLargePathCaps(caps);
    if (!caps.canExtract) {
      setLargePathRefusal(caps.reasons.join(" "));
    }
  } else {
    setLargePathCaps(null);
  }
}
```

Add new state at the top of the component (alongside the other `useState` calls):

```ts
const [largePathCaps, setLargePathCaps] = useState<import("@/types/aiClipsLarge").CodecCapabilities | null>(null);
const [largePathRefusal, setLargePathRefusal] = useState<string | null>(null);
const [extractionProgress, setExtractionProgress] = useState({ done: 0, total: 0, sec: 0, totalSec: 0 });
```

- [ ] **Step 3: Add `handleGenerateFromFileLarge` for the new path**

Add a new function next to the existing `handleGenerateFromFile` (around `page.tsx:425`):

```ts
async function handleGenerateFromFileLarge() {
  if (!file || !authToken || submitting || !largePathCaps?.canExtract) return;
  setSubmitError(null);
  setSubmitting(true);
  setUploadProgress(0);
  setExtractionProgress({ done: 0, total: 0, sec: 0, totalSec: 0 });

  try {
    // 1. Prepare large path job
    const prepRes = await fetch("/api/ai-clips/prepare-large", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        clip_count: clipCount,
        source_duration_minutes: fileDurationMinutes,
        genre,
        clip_length: clipLength,
        auto_hook: autoHook,
        moment_prompt: momentPrompt,
        notify_email: true,
      }),
    });
    const prepJson = await prepRes.json();
    if (!prepJson.ok) {
      setSubmitError(prepJson.error || "Failed to create job.");
      setSubmitting(false);
      return;
    }

    const { jobId, chunkUploadToken } = prepJson;

    const optimisticJob: AiClipJob = {
      id: jobId, clip_count: clipCount, source_duration_minutes: fileDurationMinutes,
      status: "uploading", clips_generated: null, result_upload_ids: null,
      result_titles: null, result_subtitles: null, error: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    setActiveJob(optimisticJob);

    // 2. Extract + upload chunks
    const { extractAudioChunks } = await import("@/lib/aiClips/audioExtractor");
    const { extractAudioChunksFfmpeg } = await import("@/lib/aiClips/ffmpegFallback");
    const { uploadChunkStream } = await import("@/lib/aiClips/chunkedUploader");

    const generator = largePathCaps.encoder === "webcodecs" && largePathCaps.container === "mp4"
      ? extractAudioChunks(file, {
          chunkSeconds: 30,
          onProgress: (sec, totalSec) => setExtractionProgress((p) => ({ ...p, sec, totalSec })),
        })
      : extractAudioChunksFfmpeg(file, {
          chunkSeconds: 30,
          onProgress: (sec, totalSec) => setExtractionProgress((p) => ({ ...p, sec, totalSec })),
        });

    await uploadChunkStream(generator, chunkUploadToken, {
      onChunkUploaded: (idx) => setExtractionProgress((p) => ({ ...p, done: idx + 1 })),
    });

    // 3. Start the matrix
    const startRes = await fetch(`/api/ai-clips/large/${jobId}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const startJson = await startRes.json();
    if (!startJson.ok) {
      setSubmitError(startJson.error || "Failed to start processing.");
      setActiveJob(null);
      setSubmitting(false);
      return;
    }

    setFile(null);
    setFileDurationMinutes(0);
    setSubmitting(false);
    startPolling(jobId, authToken);
  } catch (e: any) {
    setSubmitError(e?.message || "Something went wrong.");
    setSubmitting(false);
    setActiveJob(null);
  }
}
```

- [ ] **Step 4: Update the Generate button to route correctly**

Find the Generate button at `page.tsx:738-752` and update the `onClick` to dispatch based on path:

```tsx
<button
  onClick={() => {
    setInputMode("file");
    if (largePathCaps?.canExtract) handleGenerateFromFileLarge();
    else handleGenerateFromFile();
  }}
  disabled={
    submitting || !file || fileDurationMinutes <= 0 || wouldExceedLimit ||
    hasActiveJob || planOk !== true || !!largePathRefusal
  }
  className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-purple-500 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
>
  {submitting && inputMode === "file" ? (
    <span className="flex items-center justify-center gap-2">
      <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      {largePathCaps?.canExtract
        ? extractionProgress.totalSec > 0
          ? `Extracting audio ${Math.round((extractionProgress.sec / extractionProgress.totalSec) * 100)}%`
          : "Preparing…"
        : uploadProgress > 0 && uploadProgress < 100
          ? `Uploading ${uploadProgress}%…`
          : "Starting…"}
    </span>
  ) : (
    "✨ Generate AI Clips"
  )}
</button>
```

Add a refusal banner above the button:

```tsx
{largePathRefusal && (
  <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-300">
    ⚠️ {largePathRefusal}
  </div>
)}
```

- [ ] **Step 5: Manual end-to-end test**

Run `npm run dev`, navigate to `/ai-clips`, pick a small (<1 GB) MP4 — verify it routes through the existing small path unchanged. Pick a large (>1 GB) MP4 — verify the UI shows extraction progress and the network tab shows POSTs to `/api/ai-clips/audio-chunk` with chunk indices.

If WebCodecs path is unavailable in your browser, verify the FFmpeg.wasm fallback engages (slower, but should still work).

- [ ] **Step 6: Commit**

```bash
git add src/app/ai-clips/page.tsx
git commit -m "feat(ai-clips): page integration for large-file auto-routing"
```

---

## Task 18: Wire lazy clip encoder into [id]/page.tsx

**Files:**
- Modify: `src/app/ai-clips/[id]/page.tsx`

This is where the user clicks Schedule on a generated moment. For large-path jobs, the cutting happens in the browser via `clipEncoder`. The existing flow assumes the upload row exists; we need to detect the large path and run the lazy encode + upload before triggering burn.

- [ ] **Step 1: Inspect existing flow + add detection**

Read `src/app/ai-clips/[id]/page.tsx`. Find the function that handles "Schedule →" clicks (the burn trigger). Around it, add:

```ts
// At the top of the component:
const [encoding, setEncoding] = useState<{ momentIdx: number; pct: number } | null>(null);
const [originalFile, setOriginalFile] = useState<File | null>(null);

// New helper:
async function lazyEncodeAndUpload(moment: any): Promise<string /* uploadId */> {
  if (!originalFile) throw new Error("Original source file not available — pick the file again to encode.");
  const { encodeClip } = await import("@/lib/aiClips/clipEncoder");
  setEncoding({ momentIdx: moment.index, pct: 0 });
  const blob = await encodeClip(originalFile, {
    startSec: moment.start_sec,
    endSec: moment.end_sec,
    onProgress: (i, total) => {
      setEncoding({ momentIdx: moment.index, pct: total ? Math.round((i / total) * 100) : 0 });
    },
  });
  // Upload the encoded clip via the standard uploads endpoint
  const fd = new FormData();
  fd.append("file", blob, `clip_${moment.index}.mp4`);
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: fd,
  });
  const json = await res.json();
  setEncoding(null);
  if (!json.ok) throw new Error(json.error || "Upload failed");
  return json.uploadId;
}
```

Then in the existing burn-trigger flow, branch:

```ts
if (job.processing_path === "large") {
  // Need original file in browser memory. If not present, prompt user to re-select.
  if (!originalFile) {
    alert("To finalize this clip, please re-select your original source file.");
    fileInputRef.current?.click();
    return;
  }
  const uploadId = await lazyEncodeAndUpload(moment);
  // Trigger existing burn workflow with the uploadId (existing logic continues unchanged)
  ...
} else {
  // Existing small-path: clip already exists at result_upload_ids[idx]
  ...
}
```

Also add a hidden file input for re-selection, and detect when the user reloads the page (originalFile is lost on reload).

- [ ] **Step 2: Add a "re-select source" UX**

When the [id]/page loads for a large-path job, show a small banner:

```tsx
{job.processing_path === "large" && !originalFile && (
  <div className="rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 py-3 text-xs text-blue-300 mb-4">
    To schedule clips, click below to reconnect your source file. (We don't store it on our servers.)
    <button onClick={() => fileInputRef.current?.click()} className="ml-2 underline">Reconnect file</button>
    <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => {
      const f = e.target.files?.[0];
      if (f) setOriginalFile(f);
    }} />
  </div>
)}
```

- [ ] **Step 3: Manual test**

Once Task 17 is wired and a large job has finished, navigate to `/ai-clips/<id>`, reconnect the source file, click Schedule on a moment, verify the encode progress shows then the burn workflow triggers as it does today.

- [ ] **Step 4: Commit**

```bash
git add src/app/ai-clips/[id]/page.tsx
git commit -m "feat(ai-clips): lazy clip encode + reconnect-source UX"
```

---

## Task 19: Storage cleanup in `refresh-tokens` worker

**Files:**
- Modify: `src/app/api/worker/refresh-tokens/route.ts`

Add a nightly sweep that deletes orphaned `ai_audio_chunks/*` directories older than 24 h.

- [ ] **Step 1: Read the existing worker**

```bash
# Inspect to understand existing structure
```

Add at the bottom of the existing handler logic (after the existing token refresh + storage cleanup blocks):

```ts
// Cleanup orphaned ai_audio_chunks/* (large-path audio chunks from failed/abandoned jobs)
{
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find chunk rows older than 24h whose parent job is in a terminal state OR doesn't exist
  const { data: orphans } = await supabaseAdmin
    .from("ai_clip_audio_chunks")
    .select("id, job_id, storage_path, ai_clip_jobs!inner(status)")
    .lt("created_at", cutoff)
    .in("ai_clip_jobs.status", ["failed", "done"])
    .limit(500);

  if (orphans?.length) {
    const paths = orphans.map((r) => r.storage_path);
    await supabaseAdmin.storage.from("clips").remove(paths);
    await supabaseAdmin
      .from("ai_clip_audio_chunks")
      .delete()
      .in("id", orphans.map((r) => r.id));
  }
}
```

- [ ] **Step 2: Smoke test**

Trigger the worker manually:

```bash
curl "http://localhost:3000/api/worker/refresh-tokens?token=<WORKER_SECRET>"
```

Check that no errors thrown. If you have orphaned test rows, verify they're cleaned up.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/worker/refresh-tokens/route.ts
git commit -m "feat(ai-clips): nightly cleanup of orphaned audio chunks"
```

---

## Task 20: Feature flag wiring

**Files:**
- Modify: `src/app/ai-clips/page.tsx`

The spec calls for a `NEXT_PUBLIC_AI_CLIPS_LARGE_ENABLED` flag for safe rollout.

- [ ] **Step 1: Gate the large path on the flag**

In `page.tsx`, where the routing happens (Task 17, the `useLargePath` check):

```ts
const LARGE_ENABLED = process.env.NEXT_PUBLIC_AI_CLIPS_LARGE_ENABLED === "true";

// Inside readVideoDurationSafe / handleFileSelected:
if (useLargePath && !LARGE_ENABLED) {
  setSubmitError("This file is too large for the current pipeline. Compress to under 1 GB or paste a URL instead.");
  setFile(null);
  return;
}
```

- [ ] **Step 2: Document the env var**

Append to `CLAUDE.md` env var section:

```
NEXT_PUBLIC_AI_CLIPS_LARGE_ENABLED=true|false  # gates the browser-as-worker pipeline
```

- [ ] **Step 3: Set flag in `.env.local`**

```bash
echo 'NEXT_PUBLIC_AI_CLIPS_LARGE_ENABLED=true' >> .env.local
```

(For Vercel: leave unset until ready to enable in production. Set to `true` on the dev/preview environments first.)

- [ ] **Step 4: Commit**

```bash
git add src/app/ai-clips/page.tsx CLAUDE.md
git commit -m "feat(ai-clips): NEXT_PUBLIC_AI_CLIPS_LARGE_ENABLED feature flag"
```

---

## Task 21: End-to-end smoke test

**Files:** none (verification task)

- [ ] **Step 1: Test small file (regression)**

With `NEXT_PUBLIC_AI_CLIPS_LARGE_ENABLED=true` set: pick a 100 MB / 5 min MP4 in the AI Clips UI. Verify it routes through the existing small path (single upload bar, single GitHub Actions run). Job should complete as before — no regression.

- [ ] **Step 2: Test large file**

Pick a >1 GB MP4 (the user's 6.5 GB recording, or a 2 GB test clip). Verify:
- Routes to the large path (extraction progress UI shows, then chunked uploads)
- Network tab shows POSTs to `/api/ai-clips/audio-chunk` for each chunk
- After extraction completes, status moves through `uploading → transcribing → detecting → done`
- GitHub Actions matrix workflow runs with N parallel jobs
- Merge workflow runs after matrix completes
- Email notification arrives (if `RESEND_API_KEY` is set in workflow)

- [ ] **Step 3: Test clip scheduling for large-path job**

Open the resulting `/ai-clips/<id>` page. Reconnect the source file. Click Schedule on a moment. Verify the lazy encode runs (progress UI appears), upload completes, then the burn workflow fires as today.

- [ ] **Step 4: Test failure modes**

- Cancel the upload mid-flight (close tab during extraction). Wait 24h, verify nightly cleanup removes audio chunks and marks job failed.
- Force a chunk transcription failure (manually set a chunk row's status to `failed` in DB before merge runs). Verify the merge workflow marks the parent job failed and sends a "couldn't generate" email path.

- [ ] **Step 5: Production rollout**

After all smoke tests pass on a feature branch / preview deployment:

1. Merge to `main`.
2. Set `NEXT_PUBLIC_AI_CLIPS_LARGE_ENABLED=true` in Vercel preview env first.
3. Test against staging Supabase.
4. Set in Vercel production env.
5. Watch GitHub Actions concurrency, failed job rate, average wall time over the first week.
