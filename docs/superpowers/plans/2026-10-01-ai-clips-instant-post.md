# AI Clips Instant Post Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post on an AI Clips result opens the scheduling screen instantly while captions render in the background. Every wait explains what's happening, why, and roughly how long. Scheduled posts wait for their captions and always have thumbnails.

**Architecture:** `burn-clip` reserves the captioned `uploads` row up front (`render_status='rendering'`), so scheduling never needs the finished file. `ai-clip-burn.yml` fills that row, reports `progress_stage`/`progress_pct`, writes a thumbnail, and encodes in one pass instead of two. The post worker gates on the upload's render state through a pure `renderGate()` helper. All user-facing wait text comes from one pure module, `waitCopy.ts`.

**Tech Stack:** Next.js 14 App Router (TypeScript), Supabase (service-role client in API routes), GitHub Actions (bash + inline Python + ffmpeg), tests via `node --test` (`scripts/test-*.mjs`; pure TS modules imported directly, since Node 24 strips types).

**Spec:** `docs/superpowers/specs/2026-10-01-ai-clips-instant-post-design.md`

## Global Constraints

- Migrations are pasted into Supabase by hand (`supabase.skipDbPush=true`). **The SQL must run before any code that writes the new columns is deployed.**
- `render_status`: `null` = ready | `'rendering'` | `'failed'`. Nothing else.
- Render timeout: **20 minutes** from `uploads.render_started_at`.
- `progress_stage` values: `starting`, `preparing`, `rendering`, `uploading`. `progress_pct`: an integer 0–100.
- Captioned output path: `{teamId}/ai_burned_{burnJobId}.mp4`. Thumbnail: `{teamId}/thumbnails/ai_burned_{burnJobId}.jpg`. Bucket `clips`.
- Wait copy rules: no bare spinners or "Processing…"; estimates say "about"; say "you can leave this page" wherever true; all copy lives in `src/app/ai-clips/waitCopy.ts`.
- A post must never publish an uncaptioned video when captions were requested.
- Every Supabase PATCH/POST body built in workflow bash uses `jq`, never string-pasted JSON (see `c1622fd`).
- Encoder: `libx264 -preset veryfast -crf 23`.
- API responses use `{ ok: true|false, ... }`.

## Review Focus

1. **The reserved upload is retried after failing.** Retry must reuse the same `uploads` row and restart its 20-minute clock (`render_started_at`), or posts scheduled against it would fail. Covered in Tasks 2 and 3.
2. **Many posts waiting on renders.** Waiting posts must not use up the worker's batch of 5 and starve other due posts. The worker fetches more rows and stops after 5 real claims. Covered in Task 2.
3. **The user leaves the scheduling page mid-render.** Nothing may depend on the tab: the workflow backfills `thumbnail_path` on any post already created, and the worker gates publishing. Covered in Tasks 4 and 2.
4. **Storage upload of a re-render to an existing path.** Storage `POST` fails on an existing object, so the workflow must send `x-upsert: true`. Covered in Task 4.
5. **Old uploads with no render columns.** `render_status` null means ready, so legacy and normal uploads must pass the gate unchanged. Covered in Task 1's tests.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261001_render_status.sql` (create) | The new columns |
| `src/lib/renderGate.ts` (create) | Pure: decides ready / wait / fail for a post's upload |
| `src/app/ai-clips/waitCopy.ts` (create) | Pure: all wait copy, estimates, "taking longer" detection |
| `src/app/api/worker/run-scheduled/route.ts` (modify) | Gates due posts on render state |
| `src/app/api/ai-clips/[id]/burn-clip/route.ts` (modify) | Reserves the upload row and returns `uploadId` |
| `src/app/api/ai-clips/burn/[id]/route.ts` (modify) | Returns progress fields |
| `src/app/api/ai-clips/burn/[id]/retry/route.ts` (create) | Re-renders a failed burn into the same upload |
| `src/app/api/uploads/[id]/route.ts` (modify) | Returns render fields |
| `src/app/api/uploads/render-status/route.ts` (create) | Batch render status for the Scheduled page |
| `.github/workflows/ai-clip-burn.yml` (modify) | Static ffmpeg, single pass, progress, fills the reserved row, thumbnail, failure state |
| `src/components/uploads/RenderProgressBanner.tsx` (create) | Polls a burn job and shows the honest label plus Retry |
| `src/components/ai-clips/ClipCard.tsx` (modify) | Post navigates instantly; Download shows the label |
| `src/app/ai-clips/[id]/page.tsx` (modify) | `onScheduled` carries `renderJob` and `sourceUploadId` |
| `src/app/uploads/page.tsx` (modify) | The banner, source preview, swap on done, thumbnail for preloaded videos |
| `src/app/scheduled/page.tsx` (modify) | "Waiting for captions" |
| `src/app/ai-clips/page.tsx` (modify) | Generation card uses `waitCopy` |
| Tests (create) | `scripts/test-render-gate.mjs`, `scripts/test-wait-copy.mjs`, `scripts/test-ai-clips-instant-post.mjs` |

---

### Task 1: Schema and the render gate

**Files:**
- Create: `supabase/migrations/20261001_render_status.sql`
- Create: `src/lib/renderGate.ts`
- Test: `scripts/test-render-gate.mjs`

**Interfaces:**
- Produces: `renderGate(upload: { render_status?: string | null; render_started_at?: string | null } | null, nowMs?: number): "ready" | "wait" | "fail"`; `RENDER_TIMEOUT_MS = 20 * 60 * 1000`; `RENDER_FAILED_MESSAGE: string`.

- [ ] **Step 1: Write the migration**

```sql
-- AI Clips instant post: the captioned upload is reserved before its render finishes.
alter table uploads add column if not exists render_status text;          -- null = ready | 'rendering' | 'failed'
alter table uploads add column if not exists render_job_id uuid;
alter table uploads add column if not exists render_started_at timestamptz;
alter table ai_clip_burn_jobs add column if not exists progress_stage text;
alter table ai_clip_burn_jobs add column if not exists progress_pct int;
```

(`render_started_at` is the fifth column. The spec's 20-minute timeout needs a start time that resets on Retry.)

- [ ] **Step 2: Write the failing test**

```js
// Run: node --test scripts/test-render-gate.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { renderGate, RENDER_TIMEOUT_MS } from "../src/lib/renderGate.ts";

const now = Date.parse("2026-10-02T12:00:00Z");
const ago = (ms) => new Date(now - ms).toISOString();

test("uploads without render columns are ready (legacy and normal uploads)", () => {
  assert.equal(renderGate(null, now), "ready");
  assert.equal(renderGate({}, now), "ready");
  assert.equal(renderGate({ render_status: null }, now), "ready");
});
test("a render in progress waits", () => {
  assert.equal(renderGate({ render_status: "rendering", render_started_at: ago(60_000) }, now), "wait");
});
test("a failed render fails the post", () => {
  assert.equal(renderGate({ render_status: "failed", render_started_at: ago(60_000) }, now), "fail");
});
test("a render older than the timeout fails; just under it still waits", () => {
  assert.equal(renderGate({ render_status: "rendering", render_started_at: ago(RENDER_TIMEOUT_MS + 1) }, now), "fail");
  assert.equal(renderGate({ render_status: "rendering", render_started_at: ago(RENDER_TIMEOUT_MS - 1000) }, now), "wait");
});
test("rendering with no start time waits rather than failing instantly", () => {
  assert.equal(renderGate({ render_status: "rendering", render_started_at: null }, now), "wait");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test scripts/test-render-gate.mjs`
Expected: FAIL, with "Cannot find module … renderGate.ts".

- [ ] **Step 4: Implement**

```ts
// src/lib/renderGate.ts — import-free so tests can load it directly.
/**
 * Whether a scheduled post's video can be published yet. AI Clips reserves the captioned
 * upload before its render finishes (render_status 'rendering'); the worker must wait for
 * it, and never publish an uncaptioned or missing file.
 */
export const RENDER_TIMEOUT_MS = 20 * 60 * 1000;

export const RENDER_FAILED_MESSAGE =
  "Captions couldn't be added to this video. Open AI Clips and post the clip again.";

export function renderGate(
  upload: { render_status?: string | null; render_started_at?: string | null } | null,
  nowMs: number = Date.now()
): "ready" | "wait" | "fail" {
  const status = upload?.render_status ?? null;
  if (status === null) return "ready";
  if (status === "failed") return "fail";
  if (status === "rendering") {
    const started = upload?.render_started_at ? Date.parse(upload.render_started_at) : NaN;
    if (Number.isFinite(started) && nowMs - started > RENDER_TIMEOUT_MS) return "fail";
    return "wait";
  }
  return "ready";
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `node --test scripts/test-render-gate.mjs`
Expected: 5 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261001_render_status.sql src/lib/renderGate.ts scripts/test-render-gate.mjs
git commit -m "feat(ai-clips): render_status columns and renderGate"
```

---

### Task 2: The worker waits for renders

**Files:**
- Modify: `src/app/api/worker/run-scheduled/route.ts` (the due-post query, about lines 560–580, and the start of the `for (const post of duePosts)` loop)
- Test: `scripts/test-ai-clips-instant-post.mjs` (create; the worker section)

**Interfaces:**
- Consumes: `renderGate`, `RENDER_FAILED_MESSAGE` from `@/lib/renderGate`.
- Produces: due posts whose upload is rendering are skipped with `{ id, ok: true, skipped: true, reason: "waiting_for_render" }`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/test-ai-clips-instant-post.mjs`. Copy the `fakeDb`, `load` and `loadWorker` helpers verbatim from `scripts/test-bluesky-video.mjs`, then add `"@/lib/renderGate": await import("../src/lib/renderGate.ts")` to the `loadWorker` mocks. Then:

```js
function dueYoutubePostDb(upload) {
  return fakeDb({
    scheduled_posts: (q) => {
      if (q.ops.includes("lte") && !q.payload) {
        return { data: [{ id: "p1", user_id: "u", team_id: "t", upload_id: "up1", provider: "youtube", status: "scheduled",
          platform_account_id: "a1", title: "T", description: "", group_id: null }], error: null };
      }
      if (q.payload?.status === "posting") return { data: [{ id: "p1" }], error: null };
      return { data: [], error: null };
    },
    uploads: () => ({ data: { id: "up1", bucket: "clips", file_path: "t/x.mp4", file_size: 10, ...upload }, error: null }),
    notification_preferences: () => ({ data: null, error: null }),
  });
}

test("Worker: a post whose captions are still rendering is skipped and NOT claimed", async () => {
  const db = dueYoutubePostDb({ render_status: "rendering", render_started_at: new Date().toISOString() });
  const res = await loadWorker(db).exports.GET(workerReq());
  const body = await res.json();
  assert.equal(body.results[0].reason, "waiting_for_render");
  assert.ok(!db.queries.some((q) => q.payload?.status === "posting"), "not claimed");
});

test("Worker: a failed render fails the post with the captions message", async () => {
  const db = dueYoutubePostDb({ render_status: "failed", render_started_at: new Date().toISOString() });
  await loadWorker(db).exports.GET(workerReq());
  const failed = db.queries.find((q) => q.table === "scheduled_posts" && q.payload?.status === "failed");
  assert.match(failed.payload.last_error, /Captions couldn't be added/);
});

test("Worker: waiting posts don't use up the batch", async () => {
  // 6 rendering posts + 1 ready post due: the ready one must still be claimed.
  const posts = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, user_id: "u", team_id: "t", upload_id: i < 6 ? "busy" : "ready",
    provider: "youtube", status: "scheduled", platform_account_id: "a1", title: "T", description: "", group_id: null }));
  let claimed = [];
  const db = fakeDb({
    scheduled_posts: (q) => {
      if (q.ops.includes("lte") && !q.payload) return { data: posts, error: null };
      if (q.payload?.status === "posting") { const id = q.args.find(([op, c]) => op === "eq" && c === "id")[2]; claimed.push(id); return { data: [{ id }], error: null }; }
      return { data: [], error: null };
    },
    uploads: (q) => {
      const id = q.args.find(([op, c]) => op === "eq" && c === "id")?.[2];
      return { data: id === "busy" ? { id, render_status: "rendering", render_started_at: new Date().toISOString() }
        : { id, bucket: "clips", file_path: "t/x.mp4", render_status: null }, error: null };
    },
    platform_accounts: () => ({ data: null, error: null }),
    notification_preferences: () => ({ data: null, error: null }),
  });
  await loadWorker(db).exports.GET(workerReq());
  assert.deepEqual(claimed, ["p6"]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test scripts/test-ai-clips-instant-post.mjs`
Expected: 3 fail. The rendering post gets claimed, and no "waiting_for_render" reason appears.

- [ ] **Step 3: Implement**

In the route, add the import:

```ts
import { renderGate, RENDER_FAILED_MESSAGE } from "@/lib/renderGate";
```

Change the due-post query's `.limit(MAX_BATCH)` to `.limit(MAX_BATCH * 4)`, and add a counter before the loop:

```ts
  let claimedCount = 0;
```

At the very top of `for (const post of duePosts) {`, before the debug override and the claim:

```ts
    if (claimedCount >= MAX_BATCH) break;

    // AI Clips can schedule a post before its captioned video exists. Wait for the render;
    // never publish an uncaptioned or missing file.
    if (post.upload_id && (post as any).post_type !== "text") {
      const { data: up } = await supabaseAdmin
        .from("uploads")
        .select("render_status, render_started_at")
        .eq("id", post.upload_id)
        .maybeSingle();
      if (renderGate(up) === "wait") {
        results.push({ id: post.id, ok: true, skipped: true, reason: "waiting_for_render" });
        continue;
      }
    }
```

Right after a successful claim (where `claimedRows.length > 0` is established), add `claimedCount++;` and the fail path, so the loop's existing `catch` marks the post failed and sends the usual notifications:

```ts
      claimedCount++;
      if (post.upload_id) {
        const { data: up } = await supabaseAdmin
          .from("uploads").select("render_status, render_started_at").eq("id", post.upload_id).maybeSingle();
        if (renderGate(up) === "fail") throw new Error(RENDER_FAILED_MESSAGE);
      }
```

- [ ] **Step 4: Run all tests**

Run: `node --test scripts/test-*.mjs`
Expected: all pass, including the 9 Bluesky tests (no regression in the due-post path).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/worker/run-scheduled/route.ts scripts/test-ai-clips-instant-post.mjs
git commit -m "feat(worker): hold posts until their captions finish rendering"
```

---

### Task 3: API routes reserve the upload and report progress

**Files:**
- Modify: `src/app/api/ai-clips/[id]/burn-clip/route.ts`
- Create: `src/app/api/ai-clips/burn/[id]/retry/route.ts`
- Modify: `src/app/api/ai-clips/burn/[id]/route.ts:15` (the select)
- Modify: `src/app/api/uploads/[id]/route.ts:15` (the select)
- Create: `src/app/api/uploads/render-status/route.ts`
- Test: `scripts/test-ai-clips-instant-post.mjs` (the routes section)

**Interfaces:**
- Produces:
  - `POST /api/ai-clips/[id]/burn-clip` → `{ ok, burnJobId, uploadId }`.
  - `POST /api/ai-clips/burn/[id]/retry` → `{ ok, burnJobId, uploadId }` (same `uploadId`).
  - `GET /api/ai-clips/burn/[id]` → `job` gains `progress_stage`, `progress_pct`.
  - `GET /api/uploads/[id]` → `upload` gains `render_status`, `render_job_id`.
  - `GET /api/uploads/render-status?ids=a,b` → `{ ok, statuses: Record<uploadId, string | null> }`.
  - Workflow dispatch inputs gain `upload_id`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/test-ai-clips-instant-post.mjs`. Load `burn-clip/route.ts` with mocks (`next/server`, `@/lib/supabaseAdmin` = fakeDb, `@/lib/teamAuth` returning `{ ok: true, ctx: { teamId: "t", userId: "u" } }`) and `env: { GITHUB_PAT: "pat" }`. The fakeDb answers `ai_clip_jobs` with `{ id: "j", team_id: "t", status: "done", result_upload_ids: ["src1"], result_subtitles: [[]], result_titles: ["Hello"] }`, `uploads` select with `{ file_path: "t/src.mp4", bucket: "clips" }`, and `storage.from().createSignedUrl` with `{ data: { signedUrl: "https://s/x" } }`. Network: one mocked GitHub dispatch.

```js
test("burn-clip reserves the captioned upload and returns its id", async () => {
  const res = await route.exports.POST(new Request("https://x/api/ai-clips/j/burn-clip", { method: "POST",
    body: JSON.stringify({ clip_index: 0, subtitle_style: {}, mode: "portrait_auto" }) }), { params: { id: "j" } });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.uploadId && body.burnJobId);
  const reserve = db.queries.find((q) => q.table === "uploads" && q.ops.includes("insert"));
  assert.equal(reserve.payload.id, body.uploadId);
  assert.equal(reserve.payload.render_status, "rendering");
  assert.equal(reserve.payload.render_job_id, body.burnJobId);
  assert.equal(reserve.payload.file_path, `t/ai_burned_${body.burnJobId}.mp4`);
  assert.equal(reserve.payload.file_size, null);
  assert.ok(reserve.payload.render_started_at);
  const dispatch = JSON.parse(route.requests.at(-1).options.body);
  assert.equal(dispatch.inputs.upload_id, body.uploadId);
});

test("retry re-renders into the same upload and restarts its clock", async () => {
  // fakeDb: ai_clip_burn_jobs → failed job { id: "b1", team_id: "t", source_job_id: "j", clip_index: 0,
  //   source_clip_path: "t/src.mp4", subtitle_data: [], subtitle_style: {}, mode: "portrait_auto", status: "failed" }
  // uploads (by render_job_id = b1) → { id: "up1", file_path: "t/ai_burned_b1.mp4", team_id: "t" }
  const res = await retryRoute.exports.POST(new Request("https://x", { method: "POST" }), { params: { id: "b1" } });
  const body = await res.json();
  assert.equal(body.uploadId, "up1");
  const upd = db.queries.find((q) => q.table === "uploads" && q.ops.includes("update"));
  assert.equal(upd.payload.render_status, "rendering");
  assert.equal(upd.payload.render_job_id, body.burnJobId);
  assert.ok(upd.payload.render_started_at);
  const dispatch = JSON.parse(retryRoute.requests.at(-1).options.body);
  assert.equal(dispatch.inputs.output_path, "t/ai_burned_b1.mp4");
  assert.equal(dispatch.inputs.upload_id, "up1");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test scripts/test-ai-clips-instant-post.mjs`
Expected: both route tests FAIL (`uploadId` is undefined; the retry route doesn't exist).

- [ ] **Step 3: Implement `burn-clip`**

After inserting the burn job row and before dispatching, add:

```ts
    // Reserve the captioned upload now, so the user can schedule it while it renders.
    // The workflow fills in file_size and clears render_status when the file is ready.
    const reservedUploadId = crypto.randomUUID();
    const { error: reserveErr } = await supabaseAdmin.from("uploads").insert({
      id: reservedUploadId,
      user_id: userId,
      team_id: teamId,
      bucket: "clips",
      file_path: burnedPath,
      file_size: null,
      storage_deleted: false,
      render_status: "rendering",
      render_job_id: burnJobId,
      render_started_at: new Date().toISOString(),
    });
    if (reserveErr) {
      return NextResponse.json({ ok: false, error: "Failed to reserve the captioned video." }, { status: 500 });
    }
```

Add `upload_id: reservedUploadId` to the `dispatchBurnWorkflow` inputs, and return `{ ok: true, burnJobId, uploadId: reservedUploadId }`. Export `dispatchBurnWorkflow` and `BURN_MODES` (`export async function` / `export const`) so the retry route reuses them.

- [ ] **Step 4: Implement the retry route**

```ts
// src/app/api/ai-clips/burn/[id]/retry/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { dispatchBurnWorkflow } from "../../../[id]/burn-clip/route";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Re-render a failed caption burn into the SAME reserved upload, so posts already scheduled against it still go out. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId, userId } = result.ctx;

    const { data: old } = await supabaseAdmin.from("ai_clip_burn_jobs")
      .select("id, team_id, source_job_id, clip_index, source_clip_path, subtitle_data, subtitle_style, mode, status")
      .eq("id", params.id).eq("team_id", teamId).single();
    if (!old) return NextResponse.json({ ok: false, error: "Caption job not found." }, { status: 404 });
    if (old.status !== "failed") return NextResponse.json({ ok: false, error: "Only failed caption jobs can be retried." }, { status: 409 });

    const { data: upload } = await supabaseAdmin.from("uploads")
      .select("id, file_path").eq("render_job_id", old.id).eq("team_id", teamId).single();
    if (!upload) return NextResponse.json({ ok: false, error: "Captioned video not found." }, { status: 404 });

    const { data: src } = await supabaseAdmin.from("uploads").select("bucket")
      .eq("file_path", old.source_clip_path).eq("team_id", teamId).maybeSingle();
    const { data: signed } = await supabaseAdmin.storage.from(src?.bucket || "clips").createSignedUrl(old.source_clip_path, 7200);
    if (!signed?.signedUrl) return NextResponse.json({ ok: false, error: "Source clip is no longer available." }, { status: 410 });

    const burnJobId = crypto.randomUUID();
    await supabaseAdmin.from("ai_clip_burn_jobs").insert({
      id: burnJobId, team_id: teamId, source_job_id: old.source_job_id, clip_index: old.clip_index,
      source_clip_path: old.source_clip_path, status: "pending",
      subtitle_data: old.subtitle_data, subtitle_style: old.subtitle_style, mode: old.mode,
    });
    await supabaseAdmin.from("uploads").update({
      render_status: "rendering", render_job_id: burnJobId, render_started_at: new Date().toISOString(),
    }).eq("id", upload.id);

    const { data: job } = await supabaseAdmin.from("ai_clip_jobs").select("result_titles").eq("id", old.source_job_id).maybeSingle();
    await dispatchBurnWorkflow({
      burn_job_id: burnJobId, source_clip_url: signed.signedUrl, output_path: upload.file_path,
      mode: old.mode, team_id: teamId, user_id: userId,
      clip_title: (job?.result_titles as string[] | null)?.[old.clip_index] ?? `Clip ${old.clip_index + 1}`,
      upload_id: upload.id,
    });
    return NextResponse.json({ ok: true, burnJobId, uploadId: upload.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Extend the two selects and add the batch status route**

- `burn/[id]/route.ts`: the select becomes `"id, status, result_upload_id, error, created_at, updated_at, progress_stage, progress_pct"`.
- `uploads/[id]/route.ts`: the select becomes `"id, bucket, file_path, file_size, render_status, render_job_id"`.

```ts
// src/app/api/uploads/render-status/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

/** GET ?ids=a,b → { ok, statuses: { [uploadId]: render_status } } for the Scheduled page. */
export async function GET(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;
  const ids = (new URL(req.url).searchParams.get("ids") || "")
    .split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 200);
  if (ids.length === 0) return NextResponse.json({ ok: true, statuses: {} });
  const { data } = await supabaseAdmin.from("uploads").select("id, render_status")
    .in("id", ids).eq("team_id", result.ctx.teamId);
  const statuses: Record<string, string | null> = {};
  for (const r of data ?? []) statuses[r.id] = r.render_status ?? null;
  return NextResponse.json({ ok: true, statuses });
}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `node --test scripts/test-*.mjs && npx tsc --noEmit -p .`
Expected: all pass; the typecheck is clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/ai-clips src/app/api/uploads scripts/test-ai-clips-instant-post.mjs
git commit -m "feat(ai-clips): reserve the captioned upload on Post, add retry and progress fields"
```

---

### Task 4: The render workflow (single pass, progress, reserved row, thumbnail)

**Files:**
- Modify: `.github/workflows/ai-clip-burn.yml`

**Interfaces:**
- Consumes: the dispatch input `upload_id` (optional; empty means legacy insert).
- Produces: it PATCHes `ai_clip_burn_jobs.progress_stage/progress_pct`; on success, `uploads(id=upload_id)` gets `file_size` and `render_status=null`, the thumbnail is stored, and posts get `thumbnail_path`; on failure, `uploads.render_status='failed'`.

- [ ] **Step 1: Add the input**

Under `on.workflow_dispatch.inputs`:

```yaml
      upload_id:
        description: "Reserved uploads row to fill (empty = insert a new row, legacy)"
        required: false
        default: ""
```

- [ ] **Step 2: Replace the ffmpeg install with a cached static build**

Replace the `Check ffmpeg` step with:

```yaml
      - name: Restore static ffmpeg
        id: ffcache
        uses: actions/cache@v4
        with:
          path: ~/ffmpeg-static
          key: ffmpeg-static-7.0.2-amd64-v1
      - name: Install static ffmpeg (cache miss only)
        if: steps.ffcache.outputs.cache-hit != 'true'
        run: |
          mkdir -p ~/ffmpeg-static
          curl -sSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-7.0.2-amd64-static.tar.xz | tar -xJ -C ~/ffmpeg-static --strip-components=1
      - name: Put ffmpeg on PATH
        run: |
          echo "$HOME/ffmpeg-static" >> "$GITHUB_PATH"
          "$HOME/ffmpeg-static/ffmpeg" -version | head -1
          "$HOME/ffmpeg-static/ffmpeg" -hide_banner -filters | grep -q " ass " && echo "libass OK"
```

**Deliberate deviation from the spec:** the font install (~8 s, apt) is not cached. It is small next to the ~25 s ffmpeg
install and the encode, and caching apt packages adds fragility. Revisit only if measured runs show it matters.

(If the pinned URL 404s, open `https://johnvansickle.com/ffmpeg/old-releases/`, pick a 7.x tarball, and update both the URL and the cache key.)

- [ ] **Step 3: Add a progress reporter and the stage marks**

At the top of the `Generate ASS subtitle file and burn` Python block, add:

```python
          import time, urllib.request, json as _json
          def report(stage, pct=None):
              body = {"progress_stage": stage}
              if pct is not None: body["progress_pct"] = int(max(0, min(100, pct)))
              try:
                  r = urllib.request.Request(
                      f"{supabase_url}/rest/v1/ai_clip_burn_jobs?id=eq.{burn_job_id}",
                      data=_json.dumps(body).encode(), method="PATCH",
                      headers={"Authorization": f"Bearer {service_key}", "apikey": service_key,
                               "Content-Type": "application/json"})
                  urllib.request.urlopen(r, timeout=10).read()
              except Exception as e:
                  print(f"progress report failed (non-fatal): {e}", flush=True)

          def run_ffmpeg_with_progress(cmd, duration_s):
              """Runs ffmpeg, reporting progress_pct at most every 2 s. Returns (returncode, stderr_tail)."""
              cmd = cmd[:1] + ["-progress", "pipe:1", "-nostats"] + cmd[1:]
              p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
              last = 0.0
              for line in p.stdout:
                  if line.startswith("out_time_us=") and duration_s and duration_s < 9999:
                      try:
                          pct = int(line.split("=", 1)[1]) / 1e6 / duration_s * 100
                      except ValueError:
                          continue
                      if time.time() - last >= 2:
                          report("rendering", pct); last = time.time()
              err = p.stderr.read()
              p.wait()
              return p.returncode, err[-1000:]
```

(Use the names the block already defines for the Supabase URL, service key and burn job ID; read them from the env the same way the existing block does at its top.) Call `report("preparing")` right after `clip_duration` is probed, and `report("rendering", 0)` just before encoding.

- [ ] **Step 4: Collapse the two passes into one**

Replace the whole `if mode in ("portrait_blur",) + CROP_MODES:` … landscape `else:` encoding block, up to the `Output file missing` check, with:

```python
          ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30",
                 "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart"]
          sub_tail = f",{ASS_VF}" if has_subs else ""

          def geometry_cmd(vf_or_fc, is_complex):
              if is_complex:
                  fc = vf_or_fc + (f";[out]{ASS_VF}[final]" if has_subs else ";[out]null[final]")
                  return ["ffmpeg", "-i", "/tmp/clip.mp4", "-filter_complex", fc,
                          "-map", "[final]", "-map", "0:a:0?", *ENC, "/tmp/burned.mp4", "-y"]
              return ["ffmpeg", "-i", "/tmp/clip.mp4", "-vf", vf_or_fc + sub_tail,
                      "-map", "0:v:0", "-map", "0:a:0?", *ENC, "/tmp/burned.mp4", "-y"]

          if mode == "portrait_blur":
              fc = (f"[0:v]scale={bg_w}:{bg_h},crop={TW}:{TH}:{bg_crop_x}:{bg_crop_y},boxblur=20:4[bg];"
                    f"[0:v]scale={fg_w}:{fg_h}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[out]")
              rc, err = run_ffmpeg_with_progress(geometry_cmd(fc, True), clip_duration)
          elif mode in CROP_MODES:
              static_vf = f"scale={pc_scale_w}:{pc_scale_h},crop={TW}:{TH}:{pc_crop_x}:{pc_crop_y}"
              vf = static_vf
              if reframe_cmds:
                  with open("/tmp/reframe.cmd", "w") as f:
                      for t, px in reframe_cmds:
                          f.write(f"{t:.2f} crop x {px};\n")
                  vf = (f"scale={pc_scale_w}:{pc_scale_h},sendcmd=f=/tmp/reframe.cmd,"
                        f"crop={TW}:{TH}:{pc_crop_x}:{pc_crop_y}")
              rc, err = run_ffmpeg_with_progress(geometry_cmd(vf, False), clip_duration)
              # A malformed sendcmd script only costs the pan — retry once as a plain centre crop.
              if rc != 0 and reframe_cmds:
                  print(f"Auto-reframe failed (rc={rc}), retrying as centre crop\n{err[-600:]}", flush=True)
                  rc, err = run_ffmpeg_with_progress(geometry_cmd(static_vf, False), clip_duration)
          else:  # landscape
              if has_subs:
                  rc, err = run_ffmpeg_with_progress(
                      ["ffmpeg", "-i", "/tmp/clip.mp4", "-vf", ASS_VF, "-map", "0:v:0", "-map", "0:a:0?",
                       *ENC, "/tmp/burned.mp4", "-y"], clip_duration)
              else:
                  shutil.copy("/tmp/clip.mp4", "/tmp/burned.mp4"); rc, err = 0, ""

          if rc != 0:
              print(f"FFmpeg stderr:\n{err}", flush=True)
              raise RuntimeError(f"FFmpeg render failed (rc={rc})")
          report("uploading", 100)
```

- [ ] **Step 5: Upload with upsert, write the thumbnail, fill the reserved row**

In `Upload burned clip to Supabase Storage`, add the header `-H "x-upsert: true" \`. After a successful upload, add:

```bash
          ffmpeg -hide_banner -loglevel error -ss 1 -i /tmp/burned.mp4 -frames:v 1 -q:v 3 /tmp/thumb.jpg -y || true
          if [ -s /tmp/thumb.jpg ]; then
            THUMB_PATH="${{ inputs.team_id }}/thumbnails/ai_burned_${{ inputs.burn_job_id }}.jpg"
            curl -sS -o /dev/null -w "thumb upload %{http_code}\n" -X POST \
              "${{ secrets.SUPABASE_URL }}/storage/v1/object/clips/${THUMB_PATH}" \
              -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
              -H "Content-Type: image/jpeg" -H "x-upsert: true" --data-binary @/tmp/thumb.jpg || true
            echo "THUMB_PATH=${THUMB_PATH}" >> $GITHUB_ENV
          fi
```

In `Create uploads row and mark burn done`, pass `UPLOAD_ID: ${{ inputs.upload_id }}` and `THUMB_PATH: ${{ env.THUMB_PATH }}` in `env`. Replace the insert with:

```python
          reserved = os.environ.get("UPLOAD_ID", "").strip()
          thumb_path = os.environ.get("THUMB_PATH", "").strip()
          H = {"Authorization": f"Bearer {service_key}", "apikey": service_key, "Content-Type": "application/json"}
          def call(url, body, method):
              r = urllib.request.Request(url, data=json.dumps(body).encode(), method=method, headers=H)
              with urllib.request.urlopen(r) as resp:
                  print(f"{method} {url.split('/rest/v1/')[1][:60]} -> {resp.status}", flush=True)

          if reserved:
              upload_id = reserved
              call(f"{supabase_url}/rest/v1/uploads?id=eq.{upload_id}",
                   {"file_size": file_size, "render_status": None}, "PATCH")
          else:  # legacy dispatch without a reserved row
              upload_id = str(uuid.uuid4())
              call(f"{supabase_url}/rest/v1/uploads", {"id": upload_id, "user_id": user_id, "team_id": team_id,
                   "bucket": "clips", "file_path": output_path, "file_size": file_size, "storage_deleted": False}, "POST")

          if thumb_path:
              # Posts may have been scheduled before the render finished; give them the captioned thumbnail.
              call(f"{supabase_url}/rest/v1/scheduled_posts?upload_id=eq.{upload_id}&thumbnail_path=is.null",
                   {"thumbnail_path": thumb_path}, "PATCH")
```

Then keep the existing "mark burn job done" PATCH, adding `"progress_pct": 100` to it.

- [ ] **Step 6: Mark the reserved upload failed on error**

At the end of `Mark burn failed on error`, add:

```bash
          if [ -n "${{ inputs.upload_id }}" ]; then
            curl -sS -X PATCH \
              "${{ secrets.SUPABASE_URL }}/rest/v1/uploads?id=eq.${{ inputs.upload_id }}" \
              -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
              -H "apikey: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
              -H "Content-Type: application/json" \
              -d "$(jq -nc '{render_status:"failed"}')" || true
          fi
```

- [ ] **Step 7: Validate statically**

Run:

```bash
node -e 'require("js-yaml").load(require("fs").readFileSync(".github/workflows/ai-clip-burn.yml","utf8")); console.log("yaml ok")'
python - <<'EOF'
import re, ast
src = open(".github/workflows/ai-clip-burn.yml", encoding="utf8").read()
for i, body in enumerate(re.findall(r"python3 - <<'PYEOF'\n(.*?)\n\s*PYEOF", src, re.S)):
    lines = body.split("\n"); ind = min(len(l) - len(l.lstrip()) for l in lines if l.strip())
    ast.parse("\n".join(l[ind:] for l in lines)); print("python block", i, "ok")
EOF
```

Expected: "yaml ok", and every Python block parses.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/ai-clip-burn.yml
git commit -m "perf(ai-clips): single-pass caption render with progress, cached ffmpeg, reserved upload and thumbnail"
```

---

### Task 5: Wait copy

**Files:**
- Create: `src/app/ai-clips/waitCopy.ts`
- Test: `scripts/test-wait-copy.mjs`

**Interfaces:**
- Produces:
  - `formatAbout(sec: number): string`
  - `GENERATION_COPY: Record<"pending"|"uploading"|"transcribing"|"detecting"|"cutting", { title: string; why: string }>`
  - `generationEstimateSec(stage, sourceMinutes: number, clipCount: number): number`
  - `renderLabel(p: { stage: string | null; pct: number | null; elapsedSec: number }): { headline: string; detail: string; slow: boolean }`
  - `isSlow(elapsedSec: number, estimateSec: number): boolean`
  - `SLOW_COPY`, `RENDER_WHY`, `WAITING_FOR_CAPTIONS: { label: string; why: string }`

- [ ] **Step 1: Write the failing test**

```js
// Run: node --test scripts/test-wait-copy.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as w from "../src/app/ai-clips/waitCopy.ts";

test("formatAbout rounds to friendly units", () => {
  assert.equal(w.formatAbout(8), "about 10 sec");
  assert.equal(w.formatAbout(44), "about 45 sec");
  assert.equal(w.formatAbout(95), "about 2 min");
  assert.equal(w.formatAbout(600), "about 10 min");
});
test("every generation stage has a title and a why, and no bare 'Processing'", () => {
  for (const s of ["pending", "uploading", "transcribing", "detecting", "cutting"]) {
    assert.ok(w.GENERATION_COPY[s].title && w.GENERATION_COPY[s].why.length > 20, s);
    assert.doesNotMatch(w.GENERATION_COPY[s].title + w.GENERATION_COPY[s].why, /^Processing/);
  }
});
test("generation estimates scale with video length and clip count (measured 2026-10-01)", () => {
  assert.equal(w.generationEstimateSec("transcribing", 7, 5), 10 + 5 * 7);
  assert.equal(w.generationEstimateSec("cutting", 7, 5), 40 * 5);
});
test("renderLabel shows a real percent and an ETA once rendering", () => {
  const l = w.renderLabel({ stage: "rendering", pct: 50, elapsedSec: 30 });
  assert.match(l.headline, /Adding captions · Rendering 50% · about 30 sec left/);
  assert.equal(l.slow, false);
});
test("renderLabel before rendering names the stage without a number", () => {
  const l = w.renderLabel({ stage: "preparing", pct: null, elapsedSec: 5 });
  assert.doesNotMatch(l.headline, /\d+%/);
  assert.match(l.headline, /Adding captions/);
});
test("renderLabel flags slow renders past twice the ~60 s estimate", () => {
  assert.equal(w.renderLabel({ stage: "rendering", pct: 20, elapsedSec: 130 }).slow, true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/test-wait-copy.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/app/ai-clips/waitCopy.ts — import-free. Every user-facing wait in AI Clips reads from here:
// what's happening, why it takes time, and roughly how long. Estimates measured on real runs 2026-10-01.

export function formatAbout(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  if (s < 60) return `about ${Math.max(10, Math.round(s / 5) * 5)} sec`;
  return `about ${Math.round(s / 60)} min`;
}

export const GENERATION_COPY = {
  pending:      { title: "Getting ready", why: "We're starting up a machine to work on your video. This usually takes under a minute." },
  uploading:    { title: "Downloading your video", why: "We copy your video to the machine that will cut it. Bigger files take a little longer." },
  transcribing: { title: "Transcribing audio", why: "We listen to the whole video to find what's said and when. Longer videos take longer." },
  detecting:    { title: "Finding the best moments", why: "AI is reading the transcript to pick the clips most likely to hold attention." },
  cutting:      { title: "Cutting your clips", why: "Each clip is cut and saved as its own video. This is the longest step, about 40 seconds per clip." },
} as const;

export type GenerationStage = keyof typeof GENERATION_COPY;

export function generationEstimateSec(stage: GenerationStage, sourceMinutes: number, clipCount: number): number {
  const mins = Math.max(1, sourceMinutes || 1);
  const clips = Math.max(1, clipCount || 1);
  switch (stage) {
    case "pending": return 60;
    case "uploading": return 20;
    case "transcribing": return 10 + 5 * mins;
    case "detecting": return 15;
    case "cutting": return 40 * clips;
  }
}

export function isSlow(elapsedSec: number, estimateSec: number): boolean {
  return elapsedSec > 2 * estimateSec;
}

export const SLOW_COPY = "Taking longer than usual. It's still working, and you can leave this page; we'll keep going.";
export const RENDER_WHY = "We're drawing your captions and title into the video so they show on every platform.";
export const WAITING_FOR_CAPTIONS = {
  label: "Waiting for captions",
  why: "This post goes out as soon as its captions finish rendering, usually within a minute or two.",
};

const RENDER_STAGE_TEXT: Record<string, string> = {
  starting: "Starting",
  preparing: "Preparing your clip",
  rendering: "Rendering",
  uploading: "Saving the finished video",
};
const RENDER_ESTIMATE_SEC = 60;

export function renderLabel(p: { stage: string | null; pct: number | null; elapsedSec: number }): {
  headline: string; detail: string; slow: boolean;
} {
  const slow = isSlow(p.elapsedSec, RENDER_ESTIMATE_SEC);
  const stageText = RENDER_STAGE_TEXT[p.stage ?? "starting"] ?? "Starting";
  let headline = `Adding captions · ${stageText}`;
  if (p.stage === "rendering" && p.pct != null && p.pct >= 1) {
    const pct = Math.min(99, Math.round(p.pct));
    const remaining = pct >= 5 ? (p.elapsedSec * (100 - pct)) / pct : RENDER_ESTIMATE_SEC;
    headline = `Adding captions · Rendering ${pct}% · ${formatAbout(remaining)} left`;
  } else if (!slow) {
    headline += ` · ${formatAbout(Math.max(10, RENDER_ESTIMATE_SEC - p.elapsedSec))} left`;
  }
  return { headline, detail: slow ? SLOW_COPY : `${RENDER_WHY} You can leave this page.`, slow };
}
```

(The ETA test expects "about 30 sec left": pct 50 at 30 s elapsed → 30 s remaining.)

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test scripts/test-wait-copy.mjs`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/ai-clips/waitCopy.ts scripts/test-wait-copy.mjs
git commit -m "feat(ai-clips): single source for wait copy and estimates"
```

---

### Task 6: Post navigates instantly; Download shows honest progress

**Files:**
- Modify: `src/components/ai-clips/ClipCard.tsx` (`handleSchedule` at about 578–639, `handleDownload` at about 495–576, the Post button at about 752–764)
- Modify: `src/app/ai-clips/[id]/page.tsx:290` (the `onScheduled` handler)

**Interfaces:**
- Consumes: `POST burn-clip` → `{ burnJobId, uploadId }` (Task 3); `GET /api/ai-clips/burn/[id]` → `progress_stage`, `progress_pct`; `renderLabel` (Task 5).
- Produces: `onScheduled(uploadId: string, title: string, render?: { burnJobId: string; sourceUploadId: string })`; the URL `/uploads?uploadId=…&title=…&renderJob=…&sourceUploadId=…`.

- [ ] **Step 1: Change the `onScheduled` signature and its handler**

ClipCard props type:

```ts
  onScheduled: (uploadId: string, title: string, render?: { burnJobId: string; sourceUploadId: string }) => void;
```

In `src/app/ai-clips/[id]/page.tsx`, replace the handler body at line 290:

```ts
    const q = new URLSearchParams({ uploadId, title });
    if (render) { q.set("renderJob", render.burnJobId); q.set("sourceUploadId", render.sourceUploadId); }
    window.location.href = `/uploads?${q.toString()}`;
```

(Add `render?: { burnJobId: string; sourceUploadId: string }` to that handler's parameters.)

- [ ] **Step 2: Post no longer polls**

In `handleSchedule`, replace everything from `const burnJobId = json.burnJobId;` through the end of the `setInterval` with:

```ts
      // The captioned video renders in the background; the scheduling screen shows its progress.
      setBurning(false);
      onScheduled(json.uploadId, title, { burnJobId: json.burnJobId, sourceUploadId: uploadId });
```

(`uploadId` here is the card's existing source-clip prop.) Change the Post button's busy label from "Burning subtitles…" to "Opening…", since it now only covers the one request.

- [ ] **Step 3: Download shows real progress**

Add state: `const [downloadLabel, setDownloadLabel] = useState<string | null>(null);`. In `handleDownload`'s poll callback, after `const pollJson = await pollRes.json();`:

```ts
            if (pollJson.ok && pollJson.job && pollJson.job.status !== "done") {
              const l = renderLabel({ stage: pollJson.job.progress_stage ?? null, pct: pollJson.job.progress_pct ?? null,
                elapsedSec: (Date.now() - startTime) / 1000 });
              setDownloadLabel(l.headline);
            }
```

Clear it with `setDownloadLabel(null)` wherever `setDownloading(false)` runs. Replace the rotating "Processing video…" overlay text (the `messages` array at line 30 and its cycler) with `{downloadLabel ?? "Adding captions · Starting"}`, plus a second line `{RENDER_WHY}` in `text-white/50 text-[11px]`. Delete the now-unused rotating-messages array and its interval. Import `renderLabel, RENDER_WHY` from `@/app/ai-clips/waitCopy`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/ai-clips/ClipCard.tsx "src/app/ai-clips/[id]/page.tsx"
git commit -m "feat(ai-clips): Post opens scheduling instantly; Download shows real render progress"
```

---

### Task 7: Scheduling screen: progress banner, preview swap, thumbnails

**Files:**
- Create: `src/components/uploads/RenderProgressBanner.tsx`
- Modify: `src/app/uploads/page.tsx` (the preload block at about 884–915, thumbnail upload at about 1686–1704, the `thumbnail_path` attach at about 1771–1773, and the preview render)

**Interfaces:**
- Consumes: `GET /api/ai-clips/burn/[id]`, `POST /api/ai-clips/burn/[id]/retry` (Task 3), `renderLabel`, `RENDER_WHY` (Task 5).
- Produces: `<RenderProgressBanner burnJobId token onDone={(uploadId) => void} />`.

- [ ] **Step 1: Create the banner**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { renderLabel } from "@/app/ai-clips/waitCopy";

type Props = { burnJobId: string; token: string; onDone: (uploadId: string) => void };

/** Honest progress for a caption render on the scheduling screen. Scheduling is never blocked by it. */
export default function RenderProgressBanner({ burnJobId, token, onDone }: Props) {
  const [jobId, setJobId] = useState(burnJobId);
  const [state, setState] = useState<{ stage: string | null; pct: number | null; status: string; error?: string }>(
    { stage: null, pct: null, status: "pending" });
  const startRef = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/ai-clips/burn/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json();
        if (stop || !j.ok) return;
        setState({ stage: j.job.progress_stage, pct: j.job.progress_pct, status: j.job.status, error: j.job.error });
        if (j.job.status === "done" && j.job.result_upload_id) { stop = true; onDone(j.job.result_upload_id); }
        if (j.job.status === "failed") stop = true;
      } catch {}
    };
    tick();
    const poll = setInterval(() => { if (!stop) tick(); }, 2000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { stop = true; clearInterval(poll); clearInterval(clock); };
  }, [jobId, token, onDone]);

  async function retry() {
    const r = await fetch(`/api/ai-clips/burn/${jobId}/retry`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (j.ok) { startRef.current = Date.now(); setState({ stage: null, pct: null, status: "pending" }); setJobId(j.burnJobId); }
  }

  if (state.status === "done") {
    return <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">Captions ready ✓</div>;
  }
  if (state.status === "failed") {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center justify-between gap-3">
        <span>Couldn&apos;t add captions. Anything you schedule will wait until they&apos;re added.</span>
        <button onClick={retry} className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-500/30">Retry</button>
      </div>
    );
  }
  const label = renderLabel({ stage: state.stage, pct: state.pct, elapsedSec: (now - startRef.current) / 1000 });
  const pct = state.stage === "rendering" && state.pct != null ? state.pct : state.stage === "uploading" ? 100 : 5;
  return (
    <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 px-4 py-3">
      <div className="text-sm font-medium text-violet-100">{label.headline}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-white/55">{label.detail} You can schedule now; the post waits for its captions.</div>
    </div>
  );
}
```

(Each new render gets a new burn job ID, so Retry repoints the banner via `setJobId`. The reserved upload stays the same, so `onDone` returns the same `uploadId` as before.)

- [ ] **Step 2: Wire up the preload**

In the preload block, read the two params and add state near the other preview state:

```ts
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
```

```ts
      const preloadRenderJob = new URLSearchParams(window.location.search).get("renderJob");
      const preloadSourceUploadId = new URLSearchParams(window.location.search).get("sourceUploadId");
```

Inside `if (uploadJson.ok && uploadJson.upload) {`, before the `if (uploadJson.signedUrl)` branch:

```ts
            const renderingJob = preloadRenderJob
              || (uploadJson.upload.render_status === "rendering" ? uploadJson.upload.render_job_id : null);
            if (renderingJob) setRenderJobId(renderingJob);   // banner shows even for a reopened draft
            if (renderingJob && preloadSourceUploadId) {
              // The captioned file doesn't exist yet: preview the uncaptioned source clip meanwhile.
              const srcRes = await fetch(`/api/uploads/${preloadSourceUploadId}`, {
                headers: { Authorization: `Bearer ${data.session.access_token}` } });
              const srcJson = await srcRes.json();
              if (srcJson.signedUrl) {
                setVideoPreviewUrl(srcJson.signedUrl);
                extractMetaAndThumbFromUrl(srcJson.signedUrl).then((meta) => {
                  if (meta.width) setVideoWidth(meta.width);
                  if (meta.height) setVideoHeight(meta.height);
                  if (meta.duration) setVideoDuration(meta.duration);
                  // No autoThumb: the workflow stores the captioned thumbnail for this post.
                });
              }
              setStep("details");
            } else if (uploadJson.signedUrl) {
```

(The original `if (uploadJson.signedUrl) { … }` body becomes this `else if` branch, unchanged; close the braces accordingly.)

Above the video preview in the details step, render:

```tsx
            {renderJobId && authToken && (
              <RenderProgressBanner
                burnJobId={renderJobId}
                token={authToken}
                onDone={async (doneUploadId) => {
                  const r = await fetch(`/api/uploads/${doneUploadId}`, { headers: { Authorization: `Bearer ${authToken}` } });
                  const j = await r.json();
                  if (j.signedUrl) setVideoPreviewUrl(j.signedUrl);
                }}
              />
            )}
```

(Use whatever variable the page already holds the access token in. If there isn't one, store `data.session.access_token` into a new `authToken` state in `loadSession`.)

- [ ] **Step 3: Save the auto thumbnail for preloaded videos, on every platform**

After the manual-thumbnail upload block (about line 1704):

```ts
      // Preloaded videos (AI Clips without captions, link imports) skip the upload step that
      // normally saves the auto-extracted frame. Save it here. Captioned AI clips are excluded:
      // the render workflow stores the captioned frame for them.
      if (!thumbnailPath && autoThumb && !renderJobId) {
        try {
          const thumbKey = `${teamId || userId}/thumbnails/${Date.now()}-auto.jpg`;
          const r = await supabase.storage.from(BUCKET).upload(thumbKey, autoThumb, {
            cacheControl: "3600", upsert: false, contentType: "image/jpeg" });
          if (!r.error) { thumbnailPath = thumbKey; setLastThumbnailPath(thumbKey); }
        } catch { /* non-fatal */ }
      }
```

Change the attach condition at about line 1771 from
`if (!isTextPost && ["youtube", "facebook", "instagram", "linkedin"].includes(platform) && thumbnailPath)`
to `if (!isTextPost && thumbnailPath)`. The worker only uses `thumbnail_path` in its YouTube, Facebook, Instagram and LinkedIn branches, so other platforms just display it on the Scheduled page.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/uploads/RenderProgressBanner.tsx src/app/uploads/page.tsx
git commit -m "feat(uploads): live caption progress on the scheduling screen; thumbnails for preloaded videos"
```

---

### Task 8: Scheduled page and the generation card explain their waits

**Files:**
- Modify: `src/app/scheduled/page.tsx` (`fetchPosts` at about 223–232, the per-post time label at about 667)
- Modify: `src/app/ai-clips/page.tsx` (`STATUS_CONFIG` at about 39–47, the active-job card at about 1060–1107)

**Interfaces:**
- Consumes: `GET /api/uploads/render-status` (Task 3); `GENERATION_COPY`, `generationEstimateSec`, `formatAbout`, `isSlow`, `SLOW_COPY`, `WAITING_FOR_CAPTIONS` (Task 5).

- [ ] **Step 1: Scheduled page: fetch render statuses**

Add `upload_id` to the `fetchPosts` select. After `const newPosts = data ?? [];`:

```ts
    const uploadIds = [...new Set(newPosts.filter((p: any) => p.status === "scheduled" && p.upload_id).map((p: any) => p.upload_id))];
    if (uploadIds.length > 0) {
      const { data: sess } = await supabase.auth.getSession();
      const r = await fetch(`/api/uploads/render-status?ids=${uploadIds.join(",")}`,
        { headers: { Authorization: `Bearer ${sess.session?.access_token}` } });
      const j = await r.json().catch(() => null);
      setRenderStatuses(j?.ok ? j.statuses : {});
    }
```

Add the state `const [renderStatuses, setRenderStatuses] = useState<Record<string, string | null>>({});` and `upload_id?: string | null;` to the post type.

- [ ] **Step 2: Scheduled page: the label**

Where a scheduled post's countdown or time label renders (about line 667), add before it:

```tsx
{post.status === "scheduled" && post.upload_id && renderStatuses[post.upload_id] === "rendering" ? (
  <span className="text-xs font-medium text-violet-300" title={WAITING_FOR_CAPTIONS.why}>
    {WAITING_FOR_CAPTIONS.label}
  </span>
) : ( /* existing label JSX unchanged */ )}
```

Below the post's title row, when that condition holds, also render `<p className="mt-1 text-[11px] text-white/45">{WAITING_FOR_CAPTIONS.why}</p>`.

- [ ] **Step 3: Generation card**

In `src/app/ai-clips/page.tsx`, keep `STATUS_CONFIG`'s `min`/`max`/`color`, but take each `label` from `GENERATION_COPY[stage].title + "…"` (`pending`, `uploading`, `transcribing`, `detecting`, `cutting`). Under the stage chips (replacing "Once done, your clips will appear in Projects below."), render:

```tsx
{activeJob && activeJob.status in GENERATION_COPY && (() => {
  const stage = activeJob.status as keyof typeof GENERATION_COPY;
  const est = generationEstimateSec(stage, activeJob.source_duration_minutes ?? 0, activeJob.clip_count ?? 5);
  const elapsed = (Date.now() - new Date(activeJob.updated_at).getTime()) / 1000;
  return (
    <div className="mt-3 space-y-1 text-center">
      <p className="text-xs text-white/60">{GENERATION_COPY[stage].why}</p>
      <p className="text-xs text-white/40">
        {isSlow(elapsed, est) ? SLOW_COPY : `This step takes ${formatAbout(est)}. You can leave this page; your clips will be in Projects when they're done.`}
      </p>
    </div>
  );
})()}
```

(The job's `updated_at` changes on each stage transition, so it marks when the stage started. Confirm the active-job type includes `updated_at`, `source_duration_minutes` and `clip_count`; add them to its select or type if missing.)

- [ ] **Step 4: Typecheck and run all tests**

Run: `npx tsc --noEmit -p . && node --test scripts/test-*.mjs`
Expected: clean; all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/scheduled/page.tsx src/app/ai-clips/page.tsx
git commit -m "feat(ai-clips): every wait explains what, why and how long"
```

---

### Task 9: Ship and verify for real

**Files:** none. This task is deployment and measurement.

- [ ] **Step 1: The user runs the SQL from `supabase/migrations/20261001_render_status.sql` in the Supabase SQL editor.** Put it on their clipboard with `clip.exe`. Verify with a supabase-js select of `render_status, render_job_id, render_started_at` on `uploads` and `progress_stage, progress_pct` on `ai_clip_burn_jobs` (no error).
- [ ] **Step 2: Push only after Step 1 succeeds.** `git push origin main`, then wait for the Vercel deploy (GitHub deployments API status `success` for the pushed SHA).
- [ ] **Step 3: The user runs the end-to-end flow:** Post on an AI clip with captions → the scheduling screen appears in under 2 s → the label progresses with a real % → the preview swaps to the captioned video → schedule 5 minutes out → the Scheduled page shows "Waiting for captions" if they're still rendering → the post publishes captioned, with a thumbnail.
- [ ] **Step 4: Measure** the last 3 `ai-clip-burn.yml` runs' step durations (the same jobs-API script used for the baseline). Record them against the baseline (≈150 s total, ≈100 s render) in `CLAUDE.md` under AI Clips.
- [ ] **Step 5: Update memory** (`ai-clips-one-active-job-guard.md` or a new note) with the render-reservation flow and the 20-minute gate.
