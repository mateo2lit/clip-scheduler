# Video Overlay Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional "Enhance Video" expandable panel to the regular upload flow that lets users burn auto-transcribed captions, title cards, text overlays, and image overlays (logos, watermarks) into any uploaded video before scheduling.

**Architecture:** An opt-in collapsible panel on the uploads details step creates a live CSS preview using scale-aware rendering, then dispatches a new `overlay-burn.yml` GitHub Actions workflow (separate from AI clips) that runs faster-whisper transcription + FFmpeg filter_complex (images) + ASS burn (text/captions). On completion a new `uploads` row is created; the scheduling step uses this burned version instead of the original. Brand assets (saved images) are stored in a new `brand_assets` table.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS v4, Supabase (supabaseAdmin service role + anon client for direct storage uploads), GitHub Actions (ubuntu-latest, faster-whisper, FFmpeg, Python 3), existing `SubtitleStyle` type + `SubtitleStylePicker` component from AI Clips, ASS subtitle format for all text rendering.

---

## File Map

**Create:**
- `supabase/migrations/20260406_overlay_burn.sql` — `brand_assets` + `overlay_burn_jobs` tables
- `src/types/overlayBurn.ts` — `OverlayConfig`, `OverlayLayer` types
- `src/app/api/overlay-burn/route.ts` — POST: create job + dispatch workflow
- `src/app/api/overlay-burn/[id]/route.ts` — GET: poll job status
- `src/app/api/brand-assets/route.ts` — GET list + POST create
- `src/app/api/brand-assets/[id]/route.ts` — DELETE
- `src/components/uploads/VideoOverlayPreview.tsx` — CSS preview pane (scale-aware)
- `src/components/uploads/EnhanceVideoPanel.tsx` — full expandable panel (tabs + controls + burn button)
- `.github/workflows/overlay-burn.yml` — GitHub Actions workflow

**Modify:**
- `src/app/uploads/page.tsx` — add burn state, wire up `EnhanceVideoPanel`, update scheduling upload_id logic

---

## Task 1: DB Migrations

**Files:**
- Create: `supabase/migrations/20260406_overlay_burn.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260406_overlay_burn.sql
-- Run manually in Supabase SQL editor

CREATE TABLE IF NOT EXISTS brand_assets (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  name        text not null,
  file_path   text not null,
  file_size   bigint not null default 0,
  created_at  timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS overlay_burn_jobs (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  user_id           uuid not null,
  source_upload_id  uuid references uploads(id) on delete cascade,
  status            text not null default 'pending',
  -- pending | transcribing | burning | done | failed
  error             text,
  overlay_config    jsonb not null default '{}',
  result_upload_id  uuid references uploads(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

- [ ] **Step 2: Run in Supabase SQL editor**

Copy-paste the SQL above into the Supabase project SQL editor and run it. Verify both tables appear in the Table Editor.

- [ ] **Step 3: Commit migration file**

```bash
git add supabase/migrations/20260406_overlay_burn.sql
git commit -m "feat: add brand_assets and overlay_burn_jobs migrations"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types/overlayBurn.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/types/overlayBurn.ts

export type TitleLayer = {
  type: "title";
  text: string;
  position: "top" | "bottom";
  customY?: number | null;     // 0–1 fraction of video height, overrides position
  font: string;                // "Montserrat" | "Oswald" | "Anton" | "Bebas Neue" | "Poppins" | "Rubik" | "Arial"
  fontSize: number;            // ASS play-res units (e.g. 48)
  color: string;               // hex "#RRGGBB"
  bold: boolean;
  background: { enabled: boolean; color: string; opacity: number }; // opacity 0–100
  stroke: { color: string; width: number };
};

export type TextLayer = {
  type: "text";
  text: string;
  x: number;         // 0–1 fraction of video width (center anchor)
  y: number;         // 0–1 fraction of video height (center anchor)
  font: string;
  fontSize: number;
  color: string;
  bold: boolean;
  background: { enabled: boolean; color: string; opacity: number };
};

export type ImageLayer = {
  type: "image";
  assetId: string | null;   // brand_assets.id if saved, null if per-video
  filePath: string;          // Supabase Storage path in clips bucket
  publicUrl?: string;        // used in preview only, not stored
  x: number;                 // 0–1 from left edge
  y: number;                 // 0–1 from top edge
  width: number;             // 0–1 fraction of video width
};

export type OverlayLayer = TitleLayer | TextLayer | ImageLayer;

export type OverlayConfig = {
  captions: {
    enabled: boolean;
    style: import("@/app/ai-clips/types").SubtitleStyle;
  };
  layers: OverlayLayer[];
  mode: "landscape" | "portrait_blur" | "portrait_crop";
};

export type BurnJobStatus = "pending" | "transcribing" | "burning" | "done" | "failed";

export const DEFAULT_TITLE_LAYER: TitleLayer = {
  type: "title",
  text: "",
  position: "top",
  customY: null,
  font: "Montserrat",
  fontSize: 48,
  color: "#FFFFFF",
  bold: true,
  background: { enabled: true, color: "#000000", opacity: 70 },
  stroke: { color: "#000000", width: 0 },
};

export const DEFAULT_TEXT_LAYER: TextLayer = {
  type: "text",
  text: "Follow for more!",
  x: 0.5,
  y: 0.88,
  font: "Montserrat",
  fontSize: 36,
  color: "#FFFFFF",
  bold: false,
  background: { enabled: false, color: "#000000", opacity: 60 },
};

export const DEFAULT_IMAGE_LAYER: ImageLayer = {
  type: "image",
  assetId: null,
  filePath: "",
  x: 0.05,
  y: 0.05,
  width: 0.15,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/types/overlayBurn.ts
git commit -m "feat: add overlay burn types"
```

---

## Task 3: Brand Assets API

**Files:**
- Create: `src/app/api/brand-assets/route.ts`
- Create: `src/app/api/brand-assets/[id]/route.ts`

- [ ] **Step 1: Create GET/POST route**

```typescript
// src/app/api/brand-assets/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { data, error } = await supabaseAdmin
      .from("brand_assets")
      .select("id, name, file_path, file_size, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Generate short-lived signed URLs for preview
    const assets = await Promise.all(
      (data ?? []).map(async (a) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("clips")
          .createSignedUrl(a.file_path, 3600);
        return { ...a, signedUrl: signed?.signedUrl ?? null };
      })
    );

    return NextResponse.json({ ok: true, assets });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const body = await req.json().catch(() => ({}));
    const name: string = (body.name || "").trim().slice(0, 100);
    const filePath: string = (body.filePath || "").trim();
    const fileSize: number = Number(body.fileSize) || 0;

    if (!filePath) {
      return NextResponse.json({ ok: false, error: "filePath is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("brand_assets")
      .insert({ team_id: teamId, name: name || "Untitled Asset", file_path: filePath, file_size: fileSize })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Failed to save asset." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, assetId: data.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create DELETE route**

```typescript
// src/app/api/brand-assets/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { data: asset } = await supabaseAdmin
      .from("brand_assets")
      .select("id, file_path")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();

    if (!asset) {
      return NextResponse.json({ ok: false, error: "Asset not found." }, { status: 404 });
    }

    // Delete from Storage
    await supabaseAdmin.storage.from("clips").remove([asset.file_path]);

    // Delete DB row
    await supabaseAdmin.from("brand_assets").delete().eq("id", params.id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Manual verify**

Start the dev server (`npm run dev`). With a valid auth token:

```bash
# GET brand assets (should return empty array initially)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/brand-assets
# Expected: {"ok":true,"assets":[]}

# POST a fake asset (for structure check only)
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Logo","filePath":"team_id/test.png","fileSize":1000}' \
  http://localhost:3000/api/brand-assets
# Expected: {"ok":true,"assetId":"uuid..."}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/brand-assets/route.ts src/app/api/brand-assets/[id]/route.ts
git commit -m "feat: add brand assets API (GET/POST/DELETE)"
```

---

## Task 4: Overlay Burn API Routes

**Files:**
- Create: `src/app/api/overlay-burn/route.ts`
- Create: `src/app/api/overlay-burn/[id]/route.ts`

- [ ] **Step 1: Create POST route (creates job + dispatches workflow)**

```typescript
// src/app/api/overlay-burn/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

const GITHUB_PAT = process.env.GITHUB_PAT!;
const GITHUB_REPO = process.env.GITHUB_REPO || "mateo2lit/clip-scheduler";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId } = result.ctx;

    // Check active plan
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("plan, plan_status")
      .eq("id", teamId)
      .single();

    if (!team || (team.plan_status !== "active" && team.plan_status !== "trialing")) {
      return NextResponse.json(
        { ok: false, error: "An active plan or trial is required." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const sourceUploadId: string = (body.sourceUploadId || "").trim();
    const overlayConfig = body.overlayConfig ?? {};

    if (!sourceUploadId) {
      return NextResponse.json({ ok: false, error: "sourceUploadId is required." }, { status: 400 });
    }

    // Verify upload belongs to this team
    const { data: upload } = await supabaseAdmin
      .from("uploads")
      .select("id, file_path, file_size")
      .eq("id", sourceUploadId)
      .eq("team_id", teamId)
      .single();

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Upload not found." }, { status: 404 });
    }

    // Block if another burn job is already running for this team
    const { data: activeJobs } = await supabaseAdmin
      .from("overlay_burn_jobs")
      .select("id")
      .eq("team_id", teamId)
      .in("status", ["pending", "transcribing", "burning"])
      .limit(1);

    if (activeJobs && activeJobs.length > 0) {
      return NextResponse.json(
        { ok: false, error: "A burn job is already running. Please wait for it to finish." },
        { status: 409 }
      );
    }

    // Create job row
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("overlay_burn_jobs")
      .insert({
        team_id: teamId,
        user_id: userId,
        source_upload_id: sourceUploadId,
        overlay_config: overlayConfig,
        status: "pending",
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ ok: false, error: "Failed to create burn job." }, { status: 500 });
    }

    // Dispatch GitHub Actions workflow
    if (!GITHUB_PAT) {
      console.warn("GITHUB_PAT not set — burn job created but workflow not dispatched");
    } else {
      const dispatchRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/overlay-burn.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GITHUB_PAT}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: { job_id: job.id, team_id: teamId, user_id: userId },
          }),
        }
      );

      if (!dispatchRes.ok) {
        const errText = await dispatchRes.text();
        // Clean up the orphaned job row
        await supabaseAdmin.from("overlay_burn_jobs").delete().eq("id", job.id);
        return NextResponse.json(
          { ok: false, error: `Failed to start burn worker (GitHub ${dispatchRes.status}): ${errText.slice(0, 200)}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create GET poll route**

```typescript
// src/app/api/overlay-burn/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { data, error } = await supabaseAdmin
      .from("overlay_burn_jobs")
      .select("id, status, error, result_upload_id, created_at, updated_at")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, job: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Manual verify structure**

```bash
# Start burn job (with a real upload ID from your DB)
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sourceUploadId":"REAL_UPLOAD_UUID","overlayConfig":{"captions":{"enabled":false},"layers":[],"mode":"landscape"}}' \
  http://localhost:3000/api/overlay-burn
# Expected: {"ok":true,"jobId":"uuid..."}

# Poll status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/overlay-burn/JOB_UUID
# Expected: {"ok":true,"job":{"id":"...","status":"pending",...}}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/overlay-burn/route.ts src/app/api/overlay-burn/[id]/route.ts
git commit -m "feat: add overlay burn API routes (POST + GET poll)"
```

---

## Task 5: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/overlay-burn.yml`

- [ ] **Step 1: Create the workflow file**

This is the most complex task. The workflow runs faster-whisper for transcription (if captions enabled), downloads image overlay files, generates an ASS subtitle file for all text layers, then runs FFmpeg. Model it exactly on `ai-clip-burn.yml` patterns.

```yaml
# .github/workflows/overlay-burn.yml
name: Overlay Burn

on:
  workflow_dispatch:
    inputs:
      job_id:
        description: "overlay_burn_jobs row ID"
        required: true
      team_id:
        description: "Team ID"
        required: true
      user_id:
        description: "User ID"
        required: true

jobs:
  burn:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Check ffmpeg
        run: |
          if command -v ffmpeg &>/dev/null; then
            echo "ffmpeg ready: $(ffmpeg -version 2>&1 | head -1)"
          else
            sudo apt-get update -qq || true
            sudo apt-get install -y --no-install-recommends ffmpeg || true
          fi
          ffmpeg -version 2>&1 | head -1

      - name: Install fonts and faster-whisper
        run: |
          sudo apt-get install -y --no-install-recommends fonts-liberation fonts-noto-core fontconfig 2>/dev/null || true
          sudo mkdir -p /usr/local/share/fonts/clip-dash || true
          BASE="https://github.com/google/fonts/raw/main/ofl"
          wget -q --timeout=15 "${BASE}/montserrat/static/Montserrat-Regular.ttf" -O /usr/local/share/fonts/clip-dash/Montserrat-Regular.ttf || true
          wget -q --timeout=15 "${BASE}/montserrat/static/Montserrat-Bold.ttf"    -O /usr/local/share/fonts/clip-dash/Montserrat-Bold.ttf    || true
          wget -q --timeout=15 "${BASE}/montserrat/static/Montserrat-Black.ttf"   -O /usr/local/share/fonts/clip-dash/Montserrat-Black.ttf   || true
          wget -q --timeout=15 "${BASE}/oswald/static/Oswald-Regular.ttf"         -O /usr/local/share/fonts/clip-dash/Oswald-Regular.ttf     || true
          wget -q --timeout=15 "${BASE}/oswald/static/Oswald-Bold.ttf"            -O /usr/local/share/fonts/clip-dash/Oswald-Bold.ttf        || true
          wget -q --timeout=15 "${BASE}/anton/Anton-Regular.ttf"                  -O /usr/local/share/fonts/clip-dash/Anton-Regular.ttf      || true
          wget -q --timeout=15 "${BASE}/bebasneuethin/BebasNeue-Regular.ttf"      -O /usr/local/share/fonts/clip-dash/BebasNeue-Regular.ttf  || true
          wget -q --timeout=15 "${BASE}/poppins/Poppins-Bold.ttf"                 -O /usr/local/share/fonts/clip-dash/Poppins-Bold.ttf       || true
          wget -q --timeout=15 "${BASE}/rubik/static/Rubik-Bold.ttf"              -O /usr/local/share/fonts/clip-dash/Rubik-Bold.ttf         || true
          fc-cache -f /usr/local/share/fonts/clip-dash 2>/dev/null || true
          pip install faster-whisper 2>&1 | tail -3

      - name: Fetch overlay_config and mark job in progress
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          JOB_ID: ${{ inputs.job_id }}
        run: |
          python3 - <<'PYEOF'
          import os, json, urllib.request

          supabase_url = os.environ["SUPABASE_URL"]
          service_key  = os.environ["SERVICE_KEY"]
          job_id       = os.environ["JOB_ID"]

          # Fetch job row
          req = urllib.request.Request(
              f"{supabase_url}/rest/v1/overlay_burn_jobs?id=eq.{job_id}&select=overlay_config,source_upload_id",
              headers={"Authorization": f"Bearer {service_key}", "apikey": service_key}
          )
          with urllib.request.urlopen(req, timeout=15) as resp:
              rows = json.loads(resp.read().decode())

          if not rows:
              raise RuntimeError(f"Job {job_id} not found in DB")

          row = rows[0]
          config = row.get("overlay_config") or {}
          source_upload_id = row.get("source_upload_id")

          print(f"Fetched config: mode={config.get('mode')}, layers={len(config.get('layers',[]))}", flush=True)

          # Fetch source upload file_path
          req2 = urllib.request.Request(
              f"{supabase_url}/rest/v1/uploads?id=eq.{source_upload_id}&select=file_path",
              headers={"Authorization": f"Bearer {service_key}", "apikey": service_key}
          )
          with urllib.request.urlopen(req2, timeout=15) as resp2:
              upload_rows = json.loads(resp2.read().decode())

          if not upload_rows or not upload_rows[0].get("file_path"):
              raise RuntimeError(f"Source upload {source_upload_id} not found")

          source_path = upload_rows[0]["file_path"]

          with open("/tmp/overlay_config.json", "w") as f:
              json.dump(config, f)
          with open("/tmp/source_path.txt", "w") as f:
              f.write(source_path)

          # Determine initial status
          captions_enabled = config.get("captions", {}).get("enabled", False)
          new_status = "transcribing" if captions_enabled else "burning"

          patch_req = urllib.request.Request(
              f"{supabase_url}/rest/v1/overlay_burn_jobs?id=eq.{job_id}",
              data=json.dumps({"status": new_status, "updated_at": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")}).encode(),
              headers={
                  "Authorization": f"Bearer {service_key}",
                  "apikey": service_key,
                  "Content-Type": "application/json",
                  "Prefer": "return=minimal",
              },
              method="PATCH"
          )
          urllib.request.urlopen(patch_req, timeout=10)
          print(f"Marked job as {new_status}", flush=True)
          PYEOF

      - name: Download source video
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          SOURCE_PATH=$(cat /tmp/source_path.txt)
          echo "Downloading: $SOURCE_PATH"
          HTTP_STATUS=$(curl -sS -o /tmp/source.mp4 -w "%{http_code}" \
            --max-time 600 \
            "${SUPABASE_URL}/storage/v1/object/authenticated/clips/${SOURCE_PATH}" \
            -H "Authorization: Bearer ${SERVICE_KEY}" \
            -H "apikey: ${SERVICE_KEY}")
          echo "Download HTTP status: $HTTP_STATUS"
          if [ "$HTTP_STATUS" != "200" ] && [ "$HTTP_STATUS" != "206" ]; then
            echo "Download failed"
            exit 1
          fi
          echo "Downloaded $(stat -c%s /tmp/source.mp4) bytes"

      - name: Transcribe audio (if captions enabled)
        run: |
          python3 - <<'PYEOF'
          import json, os, subprocess

          with open("/tmp/overlay_config.json") as f:
              config = json.load(f)

          if not config.get("captions", {}).get("enabled", False):
              print("Captions disabled — skipping transcription", flush=True)
              with open("/tmp/word_segments.json", "w") as f:
                  json.dump([], f)
              exit(0)

          # Extract audio
          result = subprocess.run(
              ["ffmpeg", "-i", "/tmp/source.mp4", "-vn", "-ar", "16000", "-ac", "1", "-f", "wav", "/tmp/audio.wav", "-y"],
              capture_output=True, text=True
          )
          if result.returncode != 0 or not os.path.exists("/tmp/audio.wav"):
              print("Audio extraction failed:", result.stderr[-500:], flush=True)
              with open("/tmp/word_segments.json", "w") as f:
                  json.dump([], f)
              exit(0)

          from faster_whisper import WhisperModel
          print("Loading Whisper base model...", flush=True)
          model = WhisperModel("base", device="cpu", compute_type="int8")
          segments, _ = model.transcribe("/tmp/audio.wav", beam_size=5, word_timestamps=True, vad_filter=True)

          all_words = []
          for seg in segments:
              print(f"  {seg.start:.1f}s: {seg.text.strip()[:80]}", flush=True)
              if seg.words:
                  for w in seg.words:
                      all_words.append({"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word.strip()})

          with open("/tmp/word_segments.json", "w") as f:
              json.dump(all_words, f)
          print(f"Transcription done: {len(all_words)} words", flush=True)
          PYEOF

      - name: Download image overlay files
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          python3 - <<'PYEOF'
          import json, os, urllib.request, urllib.error

          supabase_url = os.environ["SUPABASE_URL"]
          service_key  = os.environ["SERVICE_KEY"]

          with open("/tmp/overlay_config.json") as f:
              config = json.load(f)

          image_layers = [l for l in config.get("layers", []) if l.get("type") == "image"]
          print(f"Image layers to download: {len(image_layers)}", flush=True)

          downloaded = []
          for i, layer in enumerate(image_layers):
              file_path = layer.get("filePath", "")
              if not file_path:
                  print(f"  Layer {i}: no filePath, skipping", flush=True)
                  downloaded.append(None)
                  continue
              dest = f"/tmp/img_{i}.png"
              url = f"{supabase_url}/storage/v1/object/authenticated/clips/{file_path}"
              try:
                  req = urllib.request.Request(
                      url,
                      headers={"Authorization": f"Bearer {service_key}", "apikey": service_key}
                  )
                  with urllib.request.urlopen(req, timeout=60) as resp:
                      with open(dest, "wb") as f:
                          f.write(resp.read())
                  size = os.path.getsize(dest)
                  print(f"  Layer {i}: downloaded {size} bytes → {dest}", flush=True)
                  downloaded.append(dest)
              except Exception as e:
                  print(f"  Layer {i}: download failed ({e}), skipping", flush=True)
                  downloaded.append(None)

          with open("/tmp/downloaded_images.json", "w") as f:
              json.dump(downloaded, f)
          PYEOF

      - name: Mark job as burning
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          JOB_ID: ${{ inputs.job_id }}
        run: |
          curl -sS -X PATCH \
            "${SUPABASE_URL}/rest/v1/overlay_burn_jobs?id=eq.${JOB_ID}" \
            -H "Authorization: Bearer ${SERVICE_KEY}" \
            -H "apikey: ${SERVICE_KEY}" \
            -H "Content-Type: application/json" \
            -H "Prefer: return=minimal" \
            -d "{\"status\":\"burning\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

      - name: Generate ASS and run FFmpeg
        run: |
          python3 - <<'PYEOF'
          import json, os, re, subprocess, shutil

          with open("/tmp/overlay_config.json") as f:
              config = json.load(f)
          with open("/tmp/word_segments.json") as f:
              words = json.load(f)
          with open("/tmp/downloaded_images.json") as f:
              downloaded_images = json.load(f)

          captions_cfg = config.get("captions", {})
          captions_enabled = captions_cfg.get("enabled", False) and bool(words)
          style = captions_cfg.get("style", {}) if captions_enabled else {}
          layers = config.get("layers", [])
          mode = config.get("mode", "landscape")

          FONTS_DIR = "/usr/local/share/fonts/clip-dash"

          # ── Probe source video dimensions ────────────────────────────────────────
          probe = subprocess.run(
              ["ffprobe", "-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height", "-of", "csv=p=0", "/tmp/source.mp4"],
              capture_output=True, text=True
          )
          dims = probe.stdout.strip().split(",")
          try:
              src_w, src_h = int(dims[0]), int(dims[1])
          except:
              src_w, src_h = 1920, 1080

          dur_probe = subprocess.run(
              ["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "csv=p=0", "/tmp/source.mp4"],
              capture_output=True, text=True
          )
          try:
              clip_duration = float(dur_probe.stdout.strip())
          except:
              clip_duration = 9999.0

          print(f"Source: {src_w}x{src_h}, {clip_duration:.1f}s, mode={mode}", flush=True)

          # ── Portrait conversion (Pass 1) ─────────────────────────────────────────
          TW, TH = 1080, 1920
          if mode == "portrait_blur":
              scale_by_h_w = int(src_w * TH / src_h)
              scale_by_w_h = int(src_h * TW / src_w)
              if scale_by_h_w >= TW:
                  bg_w = scale_by_h_w + (scale_by_h_w % 2)
                  bg_h = TH
              else:
                  bg_w = TW
                  bg_h = scale_by_w_h + (scale_by_w_h % 2)
              bg_crop_x = max(0, (bg_w - TW) // 2)
              bg_crop_y = max(0, (bg_h - TH) // 2)
              fg_w = TW
              fg_h = int(src_h * TW / src_w)
              fg_h = fg_h - (fg_h % 2)
              bg_chain = f"[0:v]scale={bg_w}:{bg_h},crop={TW}:{TH}:{bg_crop_x}:{bg_crop_y},boxblur=20:4[bg]"
              fg_chain = f"[0:v]scale={fg_w}:{fg_h}[fg]"
              fc = f"{bg_chain};{fg_chain};[bg][fg]overlay=(W-w)/2:(H-h)/2[out]"
              p1_cmd = ["ffmpeg", "-i", "/tmp/source.mp4",
                        "-filter_complex", fc, "-map", "[out]", "-map", "0:a:0?",
                        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                        "-pix_fmt", "yuv420p", "-r", "30",
                        "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                        "-movflags", "+faststart", "/tmp/portrait.mp4", "-y"]
              r = subprocess.run(p1_cmd, capture_output=True, text=True)
              if r.returncode != 0:
                  raise RuntimeError(f"Portrait blur pass failed: {r.stderr[-500:]}")
              working_path = "/tmp/portrait.mp4"
              vid_w, vid_h = TW, TH

          elif mode == "portrait_crop":
              if src_w * TH > src_h * TW:
                  pc_scale_w = int(src_w * TH / src_h); pc_scale_w += pc_scale_w % 2
                  pc_scale_h = TH; pc_crop_x = (pc_scale_w - TW) // 2; pc_crop_y = 0
              else:
                  pc_scale_h = int(src_h * TW / src_w); pc_scale_h += pc_scale_h % 2
                  pc_scale_w = TW; pc_crop_x = 0; pc_crop_y = (pc_scale_h - TH) // 2
              crop_vf = f"scale={pc_scale_w}:{pc_scale_h},crop={TW}:{TH}:{pc_crop_x}:{pc_crop_y}"
              p1_cmd = ["ffmpeg", "-i", "/tmp/source.mp4",
                        "-vf", crop_vf, "-map", "0:v:0", "-map", "0:a:0?",
                        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                        "-pix_fmt", "yuv420p", "-r", "30",
                        "-c:a", "aac", "-b:a", "128k",
                        "-movflags", "+faststart", "/tmp/portrait.mp4", "-y"]
              r = subprocess.run(p1_cmd, capture_output=True, text=True)
              if r.returncode != 0:
                  raise RuntimeError(f"Portrait crop pass failed: {r.stderr[-500:]}")
              working_path = "/tmp/portrait.mp4"
              vid_w, vid_h = TW, TH

          else:
              working_path = "/tmp/source.mp4"
              vid_w, vid_h = src_w, src_h

          play_res_x, play_res_y = vid_w, vid_h

          # ── Helpers ──────────────────────────────────────────────────────────────
          def hex_to_ass(h):
              h = h.lstrip("#")[:6].upper().zfill(6)
              r, g, b = h[0:2], h[2:4], h[4:6]
              return f"&H00{b}{g}{r}"

          def hex_to_ass_alpha(h, alpha_byte):
              h = h.lstrip("#")[:6].upper().zfill(6)
              r, g, b = h[0:2], h[2:4], h[4:6]
              return f"&H{alpha_byte:02X}{b}{g}{r}"

          def fmt_time(s):
              s = max(0.0, float(s))
              total_cs = int(round(s * 100))
              h = total_cs // 360000
              m = (total_cs % 360000) // 6000
              sec = (total_cs % 6000) // 100
              cs = total_cs % 100
              return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"

          def esc(t):
              return t.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")

          FULLY_TRANSPARENT = "&HFF000000"

          # ── Build ASS header + styles ────────────────────────────────────────────
          styles = []
          events = []

          # Caption style (from SubtitleStyle)
          if captions_enabled:
              animation   = style.get("animation", "word_highlight")
              font_family = style.get("fontFamily", "Montserrat")
              font_size   = int(style.get("fontSize", 40))
              font_weight = style.get("fontWeight", "Black")
              italic      = bool(style.get("italic", False))
              underline   = bool(style.get("underline", False))
              uppercase   = bool(style.get("uppercase", True))
              stroke_color= style.get("strokeColor", "#000000")
              shadow_on   = bool(style.get("shadowEnabled", False))
              shadow_y    = float(style.get("shadowY", 2))
              primary_hex = style.get("primaryColor", "#FFFFFF")
              highlight_hex=style.get("highlightColor", "#04F827")
              position    = style.get("position", "bottom")
              stroke_width= int(style.get("strokeWidth", 8))
              lines       = int(style.get("lines", 1))

              text_color   = hex_to_ass(primary_hex)
              outline_col  = hex_to_ass(stroke_color)
              bold_num     = 1 if font_weight in ("Bold", "Black") else 0
              shadow_depth = round(shadow_y) if shadow_on else 0

              if position in ("auto", "bottom"):
                  valign, margin_v = 2, 30
              elif position == "top":
                  valign, margin_v = 8, 30
              else:
                  valign, margin_v = 5, 0

              styles.append(
                  f"Style: Default,{font_family},{font_size},{text_color},&H000000FF,{outline_col},&H80000000,"
                  f"{bold_num},{1 if italic else 0},{1 if underline else 0},0,100,100,0,0,1,{stroke_width},{shadow_depth},"
                  f"{valign},10,10,{margin_v},1"
              )

              WORDS_PER_GROUP = 4 if lines == 1 else 8
              _PUNCT = re.compile(r'^[.,!?;:"\'\u2018\u2019\u201c\u201d`\u2014\u2013\u2026\-]+|[.,!?;:"\'\u2018\u2019\u201c\u201d`\u2014\u2013\u2026\-]+$')
              _ANNOTATION = re.compile(r'^\[.*\]$|^\(.*\)$')
              def _clean(w):
                  t = w.strip()
                  if not t or _ANNOTATION.match(t): return ""
                  return _PUNCT.sub("", t).strip()
              words = [dict(w, word=_clean(w["word"])) for w in words]
              words = [w for w in words if w["word"]]

              highlight_color_ass = hex_to_ass(highlight_hex)
              custom_y = style.get("customCaptionY")
              cap_pos = ""
              if custom_y is not None:
                  cx = play_res_x // 2
                  cy = max(50, min(play_res_y - 50, int(float(custom_y) * play_res_y)))
                  cap_pos = f"{{\\an5\\pos({cx},{cy})}}"

              if animation == "word_highlight":
                  groups = [words[i:i+WORDS_PER_GROUP] for i in range(0, len(words), WORDS_PER_GROUP)]
                  for group in groups:
                      if not group: continue
                      for active_idx, active_word in enumerate(group):
                          parts = []
                          for j, w in enumerate(group):
                              txt = (w["word"].upper() if uppercase else w["word"])
                              txt = esc(txt)
                              if j == active_idx:
                                  parts.append(f"{{\\c{highlight_color_ass}}}{txt}{{\\c{text_color}}}")
                              else:
                                  parts.append(txt)
                          events.append(f"Dialogue: 0,{fmt_time(active_word['start'])},{fmt_time(active_word['end'])},Default,,0,0,0,,{cap_pos}{' '.join(parts)}")
              elif animation == "line":
                  groups = [words[i:i+WORDS_PER_GROUP] for i in range(0, len(words), WORDS_PER_GROUP)]
                  for group in groups:
                      if not group: continue
                      text = " ".join(esc(w["word"].upper() if uppercase else w["word"]) for w in group)
                      events.append(f"Dialogue: 0,{fmt_time(group[0]['start'])},{fmt_time(group[-1]['end'])},Default,,0,0,0,,{cap_pos}{text}")

          # Overlay layers: title, text
          for i, layer in enumerate(layers):
              ltype = layer.get("type")

              if ltype == "title":
                  title_text = esc(layer.get("text", "").strip())
                  if not title_text:
                      continue
                  title_pos  = layer.get("position", "top")
                  custom_y   = layer.get("customY")
                  font       = layer.get("font", "Montserrat")
                  font_size  = int(layer.get("fontSize", 48))
                  color      = layer.get("color", "#FFFFFF")
                  bold       = bool(layer.get("bold", True))
                  bg_cfg     = layer.get("background", {})
                  bg_enabled = bg_cfg.get("enabled", True)
                  bg_color   = bg_cfg.get("color", "#000000")
                  bg_opacity = float(bg_cfg.get("opacity", 70))
                  stroke_cfg = layer.get("stroke", {})
                  stroke_w   = int(stroke_cfg.get("width", 0))
                  stroke_c   = stroke_cfg.get("color", "#000000")

                  primary_ass = hex_to_ass(color)
                  stroke_ass  = hex_to_ass(stroke_c) if stroke_w > 0 else FULLY_TRANSPARENT
                  bg_alpha    = max(0, min(255, round((1 - bg_opacity / 100) * 255)))

                  if bg_enabled and bg_opacity > 0:
                      back_ass     = hex_to_ass_alpha(bg_color, bg_alpha)
                      border_style = 3
                      outline_px   = stroke_w
                  else:
                      back_ass     = FULLY_TRANSPARENT
                      border_style = 1
                      outline_px   = stroke_w

                  valign   = 8 if title_pos == "top" else 2
                  margin_v = 25
                  style_name = f"TitleLayer{i}"
                  styles.append(
                      f"Style: {style_name},{font},{font_size},{primary_ass},&H000000FF,"
                      f"{stroke_ass},{back_ass},{1 if bold else 0},0,0,0,100,100,0,0,"
                      f"{border_style},{outline_px},0,{valign},{margin_v},{margin_v},{margin_v},1"
                  )

                  pos_tag = ""
                  if custom_y is not None:
                      cx = play_res_x // 2
                      cy = max(50, min(play_res_y - 50, int(float(custom_y) * play_res_y)))
                      pos_tag = f"{{\\an5\\pos({cx},{cy})}}"

                  events.insert(0, f"Dialogue: 0,{fmt_time(0)},{fmt_time(clip_duration)},{style_name},,0,0,0,,{pos_tag}{title_text}")

              elif ltype == "text":
                  txt = esc(layer.get("text", "").strip())
                  if not txt:
                      continue
                  x_frac = float(layer.get("x", 0.5))
                  y_frac = float(layer.get("y", 0.88))
                  x_px   = int(play_res_x * x_frac)
                  y_px   = int(play_res_y * y_frac)
                  font       = layer.get("font", "Montserrat")
                  font_size  = int(layer.get("fontSize", 36))
                  color      = layer.get("color", "#FFFFFF")
                  bold       = bool(layer.get("bold", False))
                  bg_cfg     = layer.get("background", {})
                  bg_enabled = bg_cfg.get("enabled", False)
                  bg_color   = bg_cfg.get("color", "#000000")
                  bg_opacity = float(bg_cfg.get("opacity", 60))

                  primary_ass = hex_to_ass(color)
                  bg_alpha    = max(0, min(255, round((1 - bg_opacity / 100) * 255)))
                  back_ass    = hex_to_ass_alpha(bg_color, bg_alpha) if (bg_enabled and bg_opacity > 0) else FULLY_TRANSPARENT
                  border_style = 3 if (bg_enabled and bg_opacity > 0) else 1

                  style_name = f"TextLayer{i}"
                  styles.append(
                      f"Style: {style_name},{font},{font_size},{primary_ass},&H000000FF,"
                      f"{FULLY_TRANSPARENT},{back_ass},{1 if bold else 0},0,0,0,100,100,0,0,"
                      f"{border_style},0,0,5,10,10,10,1"
                  )
                  pos_tag = f"{{\\an5\\pos({x_px},{y_px})}}"
                  events.append(f"Dialogue: 0,{fmt_time(0)},{fmt_time(clip_duration)},{style_name},,0,0,0,,{pos_tag}{txt}")

          has_ass = bool(events)

          # ── Write ASS file ───────────────────────────────────────────────────────
          style_fmt = "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
          event_fmt = "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"

          ass_content = "\n".join([
              "[Script Info]",
              "ScriptType: v4.00+",
              f"PlayResX: {play_res_x}",
              f"PlayResY: {play_res_y}",
              "ScaledBorderAndShadow: yes",
              "",
              "[V4+ Styles]",
              style_fmt,
              *styles,
              "",
              "[Events]",
              event_fmt,
              "",
              *events,
          ])

          with open("/tmp/overlays.ass", "w", encoding="utf-8") as f:
              f.write(ass_content)

          print(f"ASS: {len(styles)} styles, {len(events)} events", flush=True)

          # ── Build image layers list ──────────────────────────────────────────────
          image_layers_raw = [(l, p) for l, p in zip(
              [l for l in layers if l.get("type") == "image"],
              downloaded_images
          ) if p and os.path.exists(p)]

          print(f"Image layers ready: {len(image_layers_raw)}", flush=True)

          # ── Build FFmpeg command ─────────────────────────────────────────────────
          ASS_VF = f"ass=/tmp/overlays.ass:fontsdir={FONTS_DIR}"

          if image_layers_raw:
              input_args = ["-i", working_path]
              for _, img_path in image_layers_raw:
                  input_args += ["-i", img_path]

              filter_parts = []
              prev = "[0:v]"
              for idx, (layer, _) in enumerate(image_layers_raw):
                  target_w = max(2, int(vid_w * float(layer.get("width", 0.15))))
                  target_w += target_w % 2
                  ox = int(vid_w * float(layer.get("x", 0.05)))
                  oy = int(vid_h * float(layer.get("y", 0.05)))
                  filter_parts.append(f"[{idx+1}:v]scale={target_w}:-2[simg{idx}]")
                  nxt = f"[vimg{idx}]"
                  filter_parts.append(f"{prev}[simg{idx}]overlay=x={ox}:y={oy}{nxt}")
                  prev = nxt

              if has_ass:
                  filter_parts.append(f"{prev}{ASS_VF}[vout]")
              else:
                  # rename last label to vout
                  filter_parts[-1] = filter_parts[-1][: filter_parts[-1].rfind("[")] + "[vout]"

              fc = ";".join(filter_parts)
              cmd = ["ffmpeg"] + input_args + [
                  "-filter_complex", fc,
                  "-map", "[vout]", "-map", "0:a:0?",
                  "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                  "-pix_fmt", "yuv420p", "-r", "30",
                  "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                  "-movflags", "+faststart", "/tmp/burned.mp4", "-y",
              ]

          elif has_ass:
              cmd = ["ffmpeg", "-i", working_path,
                     "-vf", ASS_VF,
                     "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                     "-pix_fmt", "yuv420p", "-r", "30",
                     "-c:a", "copy", "-movflags", "+faststart",
                     "/tmp/burned.mp4", "-y"]

          else:
              # Nothing to burn — just copy
              shutil.copy(working_path, "/tmp/burned.mp4")
              cmd = None

          if cmd:
              print(f"Running FFmpeg: {' '.join(cmd[:8])}...", flush=True)
              result = subprocess.run(cmd, capture_output=True, text=True)
              if result.returncode != 0:
                  print(f"FFmpeg stderr:\n{result.stderr[-1500:]}", flush=True)
                  raise RuntimeError(f"FFmpeg failed (rc={result.returncode})")

          if not os.path.exists("/tmp/burned.mp4") or os.path.getsize("/tmp/burned.mp4") == 0:
              raise RuntimeError("Output file missing or empty")

          print(f"Burned output: {os.path.getsize('/tmp/burned.mp4'):,} bytes", flush=True)
          PYEOF

      - name: Upload burned video to Supabase Storage
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TEAM_ID: ${{ inputs.team_id }}
          JOB_ID: ${{ inputs.job_id }}
        run: |
          OUTPUT_PATH="${TEAM_ID}/overlay_burned_${JOB_ID}.mp4"
          echo "OUTPUT_PATH=${OUTPUT_PATH}" >> $GITHUB_ENV
          FILE_SIZE=$(stat -c%s /tmp/burned.mp4)
          echo "BURNED_FILE_SIZE=${FILE_SIZE}" >> $GITHUB_ENV

          HTTP_STATUS=$(curl -sS -o /tmp/upload_resp.txt -w "%{http_code}" \
            --max-time 300 \
            -X POST \
            "${SUPABASE_URL}/storage/v1/object/clips/${OUTPUT_PATH}" \
            -H "Authorization: Bearer ${SERVICE_KEY}" \
            -H "Content-Type: video/mp4" \
            --data-binary @/tmp/burned.mp4)

          echo "Upload HTTP status: $HTTP_STATUS"
          if [ "$HTTP_STATUS" != "200" ] && [ "$HTTP_STATUS" != "201" ]; then
            echo "Upload failed:"
            cat /tmp/upload_resp.txt
            exit 1
          fi

      - name: Create uploads row and mark job done
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TEAM_ID: ${{ inputs.team_id }}
          USER_ID: ${{ inputs.user_id }}
          JOB_ID: ${{ inputs.job_id }}
          OUTPUT_PATH: ${{ env.OUTPUT_PATH }}
          BURNED_FILE_SIZE: ${{ env.BURNED_FILE_SIZE }}
        run: |
          python3 - <<'PYEOF'
          import json, os, urllib.request, datetime

          supabase_url = os.environ["SUPABASE_URL"]
          service_key  = os.environ["SERVICE_KEY"]
          team_id      = os.environ["TEAM_ID"]
          user_id      = os.environ["USER_ID"]
          job_id       = os.environ["JOB_ID"]
          output_path  = os.environ["OUTPUT_PATH"]
          file_size    = int(os.environ.get("BURNED_FILE_SIZE", "0") or 0)

          # Insert uploads row
          upload_id = str(__import__("uuid").uuid4())
          upload_data = {
              "id": upload_id,
              "user_id": user_id,
              "team_id": team_id,
              "bucket": "clips",
              "file_path": output_path,
              "file_size": file_size,
              "storage_deleted": False,
          }
          req = urllib.request.Request(
              f"{supabase_url}/rest/v1/uploads",
              data=json.dumps(upload_data).encode(),
              headers={
                  "Authorization": f"Bearer {service_key}",
                  "apikey": service_key,
                  "Content-Type": "application/json",
                  "Prefer": "return=minimal",
              },
              method="POST"
          )
          urllib.request.urlopen(req, timeout=15)
          print(f"Created uploads row: {upload_id}", flush=True)

          # Mark job done
          now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
          patch_req = urllib.request.Request(
              f"{supabase_url}/rest/v1/overlay_burn_jobs?id=eq.{job_id}",
              data=json.dumps({"status": "done", "result_upload_id": upload_id, "updated_at": now}).encode(),
              headers={
                  "Authorization": f"Bearer {service_key}",
                  "apikey": service_key,
                  "Content-Type": "application/json",
                  "Prefer": "return=minimal",
              },
              method="PATCH"
          )
          urllib.request.urlopen(patch_req, timeout=10)
          print(f"Job {job_id} marked done, result_upload_id={upload_id}", flush=True)
          PYEOF

      - name: Mark job failed on error
        if: failure()
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          JOB_ID: ${{ inputs.job_id }}
        run: |
          curl -sS -X PATCH \
            "${SUPABASE_URL}/rest/v1/overlay_burn_jobs?id=eq.${JOB_ID}" \
            -H "Authorization: Bearer ${SERVICE_KEY}" \
            -H "apikey: ${SERVICE_KEY}" \
            -H "Content-Type: application/json" \
            -H "Prefer: return=minimal" \
            -d "{\"status\":\"failed\",\"error\":\"Workflow step failed — check GitHub Actions logs\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/overlay-burn.yml
git commit -m "feat: add overlay-burn GitHub Actions workflow"
```

---

## Task 6: VideoOverlayPreview Component

**Files:**
- Create: `src/components/uploads/VideoOverlayPreview.tsx`

This component renders a scale-accurate CSS preview of what the burned video will look like. All font sizes and positions use the same math as FFmpeg/ASS.

- [ ] **Step 1: Create the component**

```typescript
// src/components/uploads/VideoOverlayPreview.tsx
"use client";

import { useMemo } from "react";
import { OverlayConfig, TitleLayer, TextLayer, ImageLayer } from "@/types/overlayBurn";

interface VideoOverlayPreviewProps {
  config: OverlayConfig;
  thumbnailUrl?: string | null;
  /** Actual video width in pixels (from HTMLVideoElement). Defaults to 1920 if unknown. */
  videoWidth?: number | null;
  /** Actual video height in pixels. Defaults to 1080 if unknown. */
  videoHeight?: number | null;
  /** Height of the preview container in px. Width is derived from aspect ratio. */
  previewHeight?: number;
}

const SAMPLE_WORDS = ["These", "are", "your", "captions"];

const FONT_STACK: Record<string, string> = {
  "Montserrat": "'Montserrat', sans-serif",
  "Oswald":     "'Oswald', sans-serif",
  "Anton":      "'Anton', sans-serif",
  "Bebas Neue": "'Bebas Neue', sans-serif",
  "Poppins":    "'Poppins', sans-serif",
  "Rubik":      "'Rubik', sans-serif",
  "Arial":      "Arial, sans-serif",
};

function hexAlpha(hex: string, opacity: number): string {
  const alpha = Math.round((opacity / 100) * 255).toString(16).padStart(2, "0");
  return hex + alpha;
}

export function VideoOverlayPreview({
  config,
  thumbnailUrl,
  videoWidth,
  videoHeight,
  previewHeight = 400,
}: VideoOverlayPreviewProps) {
  const mode = config.mode;

  // Determine play resolution (matches ASS PlayResX/PlayResY in the workflow)
  const playResX = mode === "landscape" ? (videoWidth ?? 1920) : 1080;
  const playResY = mode === "landscape" ? (videoHeight ?? 1080) : 1920;

  // Aspect ratio of the OUTPUT video
  const aspectRatio = playResX / playResY;
  const previewWidth = Math.round(previewHeight * aspectRatio);

  // Scale factor: converts ASS units → CSS pixels
  const scale = previewHeight / playResY;

  // Google Fonts to load (derive from layers + captions)
  const fontsNeeded = useMemo(() => {
    const fonts = new Set<string>();
    if (config.captions.enabled) fonts.add(config.captions.style.fontFamily);
    config.layers.forEach((l) => {
      if (l.type === "title" || l.type === "text") fonts.add(l.font);
    });
    fonts.delete("Arial");
    return Array.from(fonts);
  }, [config]);

  const googleFontsUrl = fontsNeeded.length > 0
    ? `https://fonts.googleapis.com/css2?${fontsNeeded.map(f => `family=${encodeURIComponent(f)}:wght@400;700;900`).join("&")}&display=swap`
    : null;

  return (
    <div style={{ position: "relative" }}>
      {googleFontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={googleFontsUrl} />
      )}
      <div
        style={{
          position: "relative",
          width: previewWidth,
          height: previewHeight,
          background: "#000",
          overflow: "hidden",
          borderRadius: 8,
          flexShrink: 0,
        }}
      >
        {/* Video thumbnail background */}
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}

        {/* Overlay layers */}
        {config.layers.map((layer, i) => {
          if (layer.type === "title") return (
            <TitleLayerPreview key={i} layer={layer} scale={scale} playResX={playResX} playResY={playResY} clipDuration={10} />
          );
          if (layer.type === "text") return (
            <TextLayerPreview key={i} layer={layer} scale={scale} playResX={playResX} playResY={playResY} />
          );
          if (layer.type === "image") return (
            <ImageLayerPreview key={i} layer={layer} previewWidth={previewWidth} previewHeight={previewHeight} />
          );
          return null;
        })}

        {/* Caption sample */}
        {config.captions.enabled && (
          <CaptionSamplePreview style={config.captions.style} scale={scale} playResX={playResX} playResY={playResY} />
        )}
      </div>
      <p style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
        Live preview — captions show sample text
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TitleLayerPreview({ layer, scale, playResX, playResY }: {
  layer: TitleLayer; scale: number; playResX: number; playResY: number;
}) {
  if (!layer.text.trim()) return null;

  const fontSize = layer.fontSize * scale;
  const marginV = 25 * scale;
  const font = FONT_STACK[layer.font] ?? "sans-serif";
  const bg = layer.background;
  const stroke = layer.stroke;

  let top: string | undefined;
  let bottom: string | undefined;
  let transform = "translateX(-50%)";

  if (layer.customY != null) {
    top = `${layer.customY * 100}%`;
    transform = "translate(-50%, -50%)";
  } else if (layer.position === "top") {
    top = `${marginV}px`;
  } else {
    bottom = `${marginV}px`;
  }

  return (
    <div style={{
      position: "absolute",
      left: "50%",
      top,
      bottom,
      transform,
      fontFamily: font,
      fontSize,
      fontWeight: layer.bold ? "900" : "400",
      color: layer.color,
      whiteSpace: "nowrap",
      padding: bg.enabled ? `${2 * scale}px ${6 * scale}px` : 0,
      background: bg.enabled ? hexAlpha(bg.color, bg.opacity) : "transparent",
      WebkitTextStroke: stroke.width > 0 ? `${stroke.width * scale}px ${stroke.color}` : undefined,
      lineHeight: 1.2,
      zIndex: 10,
    }}>
      {layer.text}
    </div>
  );
}

function TextLayerPreview({ layer, scale, playResX, playResY }: {
  layer: TextLayer; scale: number; playResX: number; playResY: number;
}) {
  if (!layer.text.trim()) return null;

  const fontSize = layer.fontSize * scale;
  const font = FONT_STACK[layer.font] ?? "sans-serif";
  const bg = layer.background;

  return (
    <div style={{
      position: "absolute",
      left: `${layer.x * 100}%`,
      top: `${layer.y * 100}%`,
      transform: "translate(-50%, -50%)",
      fontFamily: font,
      fontSize,
      fontWeight: layer.bold ? "700" : "400",
      color: layer.color,
      whiteSpace: "nowrap",
      padding: bg.enabled ? `${2 * scale}px ${5 * scale}px` : 0,
      background: bg.enabled ? hexAlpha(bg.color, bg.opacity) : "transparent",
      zIndex: 9,
    }}>
      {layer.text}
    </div>
  );
}

function ImageLayerPreview({ layer, previewWidth, previewHeight }: {
  layer: ImageLayer; previewWidth: number; previewHeight: number;
}) {
  if (!layer.publicUrl) return null;

  const imgWidth = previewWidth * layer.width;
  const left = previewWidth * layer.x;
  const top = previewHeight * layer.y;

  return (
    <img
      src={layer.publicUrl}
      alt=""
      style={{
        position: "absolute",
        left,
        top,
        width: imgWidth,
        height: "auto",
        zIndex: 8,
      }}
    />
  );
}

function CaptionSamplePreview({ style, scale, playResX, playResY }: {
  style: import("@/app/ai-clips/types").SubtitleStyle;
  scale: number;
  playResX: number;
  playResY: number;
}) {
  const font = FONT_STACK[style.fontFamily] ?? "sans-serif";
  const fontSize = style.fontSize * scale;
  const strokeWidth = style.strokeWidth * scale;
  const marginV = 30 * scale;

  let top: string | undefined;
  let bottom: string | undefined;
  let alignSelf = "center";

  if (style.customCaptionY != null) {
    top = `${style.customCaptionY * 100}%`;
  } else if (style.position === "top") {
    top = `${marginV}px`;
  } else if (style.position === "middle") {
    top = "50%";
    alignSelf = "center";
  } else {
    bottom = `${marginV}px`;
  }

  return (
    <div style={{
      position: "absolute",
      left: "50%",
      top,
      bottom,
      transform: top === "50%" ? "translate(-50%, -50%)" : "translateX(-50%)",
      display: "flex",
      gap: `${4 * scale}px`,
      flexWrap: "wrap",
      justifyContent: "center",
      zIndex: 11,
    }}>
      {SAMPLE_WORDS.map((word, i) => (
        <span key={i} style={{
          fontFamily: font,
          fontSize,
          fontWeight: style.fontWeight === "Black" ? "900" : style.fontWeight === "Bold" ? "700" : "400",
          fontStyle: style.italic ? "italic" : "normal",
          textDecoration: style.underline ? "underline" : "none",
          textTransform: style.uppercase ? "uppercase" : "none",
          color: i === 1 ? style.highlightColor : style.primaryColor,
          WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${style.strokeColor}` : undefined,
          whiteSpace: "nowrap",
        }}>
          {style.uppercase ? word.toUpperCase() : word}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/uploads/VideoOverlayPreview.tsx
git commit -m "feat: add VideoOverlayPreview scale-accurate CSS preview component"
```

---

## Task 7: EnhanceVideoPanel Component

**Files:**
- Create: `src/components/uploads/EnhanceVideoPanel.tsx`

This is the expandable panel that users see on the details step. It has two tabs (Captions / Overlays), a live preview, and a "Burn & Schedule" button that fires the burn API.

- [ ] **Step 1: Create the component**

```typescript
// src/components/uploads/EnhanceVideoPanel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/app/login/supabaseClient";
import {
  OverlayConfig, OverlayLayer, TitleLayer, TextLayer, ImageLayer,
  DEFAULT_TITLE_LAYER, DEFAULT_TEXT_LAYER, DEFAULT_IMAGE_LAYER,
  BurnJobStatus,
} from "@/types/overlayBurn";
import { DEFAULT_SUBTITLE_STYLE } from "@/app/ai-clips/types";
import { SubtitleStylePicker } from "@/components/ai-clips/SubtitleStylePicker";
import { VideoOverlayPreview } from "@/components/uploads/VideoOverlayPreview";

const FONTS = ["Montserrat", "Oswald", "Anton", "Bebas Neue", "Poppins", "Rubik", "Arial"];

interface BrandAsset {
  id: string;
  name: string;
  file_path: string;
  signedUrl: string | null;
}

interface EnhancePanelProps {
  uploadId: string | null;
  teamId: string;
  videoWidth: number | null;
  videoHeight: number | null;
  thumbnailUrl?: string | null;
  onBurnStart: (jobId: string) => void;
}

const DEFAULT_CONFIG: OverlayConfig = {
  captions: { enabled: false, style: { ...DEFAULT_SUBTITLE_STYLE } },
  layers: [],
  mode: "landscape",
};

export function EnhanceVideoPanel({
  uploadId,
  teamId,
  videoWidth,
  videoHeight,
  thumbnailUrl,
  onBurnStart,
}: EnhancePanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"captions" | "overlays">("captions");
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_CONFIG);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [burning, setBurning] = useState(false);
  const [burnError, setBurnError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset config when upload changes
  useEffect(() => {
    setConfig(DEFAULT_CONFIG);
    setBurnError(null);
  }, [uploadId]);

  // Load brand assets when panel opens
  useEffect(() => {
    if (!open) return;
    loadBrandAssets();
  }, [open]);

  async function loadBrandAssets() {
    setLoadingAssets(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/brand-assets", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.ok) setBrandAssets(json.assets);
    } catch {}
    finally { setLoadingAssets(false); }
  }

  function updateCaptions(partial: Partial<OverlayConfig["captions"]>) {
    setConfig((c) => ({ ...c, captions: { ...c.captions, ...partial } }));
  }

  function addLayer(layer: OverlayLayer) {
    setConfig((c) => ({ ...c, layers: [...c.layers, layer] }));
  }

  function removeLayer(index: number) {
    setConfig((c) => ({ ...c, layers: c.layers.filter((_, i) => i !== index) }));
  }

  function updateLayer(index: number, partial: Partial<OverlayLayer>) {
    setConfig((c) => ({
      ...c,
      layers: c.layers.map((l, i) => i === index ? { ...l, ...partial } as OverlayLayer : l),
    }));
  }

  async function handleImageUpload(file: File, layerIndex: number | null, saveToAccount: boolean) {
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${teamId}/brand/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("clips").upload(path, file, { contentType: file.type });
      if (error) throw error;

      const { data: signed } = await supabase.storage.from("clips").createSignedUrl(path, 3600);
      const publicUrl = signed?.signedUrl ?? null;

      if (saveToAccount) {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (token) {
          await fetch("/api/brand-assets", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name, filePath: path, fileSize: file.size }),
          });
          await loadBrandAssets();
        }
      }

      const newLayer: ImageLayer = { ...DEFAULT_IMAGE_LAYER, filePath: path, publicUrl: publicUrl ?? undefined };
      if (layerIndex !== null) {
        updateLayer(layerIndex, { filePath: path, publicUrl: publicUrl ?? undefined } as Partial<ImageLayer>);
      } else {
        addLayer(newLayer);
      }
    } catch (e: any) {
      alert("Image upload failed: " + (e?.message || "Unknown error"));
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleBurn() {
    if (!uploadId) return;
    setBurning(true);
    setBurnError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/overlay-burn", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUploadId: uploadId, overlayConfig: config }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to start burn");

      onBurnStart(json.jobId);
    } catch (e: any) {
      setBurnError(e?.message || "Unknown error");
      setBurning(false);
    }
  }

  const hasContent =
    config.captions.enabled ||
    config.layers.some((l) => l.type !== "image" ? (l as TextLayer | TitleLayer).text.trim() : (l as ImageLayer).filePath);

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span className="text-sm font-medium text-white/80">Enhance Video</span>
          {hasContent && (
            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">Active</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-white/10">
          {/* Mode selector */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <span className="text-[10px] text-white/30 uppercase tracking-wider w-12">Mode</span>
            {(["landscape", "portrait_blur", "portrait_crop"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, mode: m }))}
                className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                  config.mode === m
                    ? "bg-purple-600 text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                {m === "landscape" ? "16:9" : m === "portrait_blur" ? "9:16 Blur" : "9:16 Crop"}
              </button>
            ))}
          </div>

          <div className="flex gap-4 px-4 pb-4" style={{ minHeight: 0 }}>
            {/* Live preview */}
            <div className="shrink-0">
              <VideoOverlayPreview
                config={config}
                thumbnailUrl={thumbnailUrl}
                videoWidth={videoWidth}
                videoHeight={videoHeight}
                previewHeight={320}
              />
            </div>

            {/* Controls */}
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              {/* Tabs */}
              <div className="flex gap-1 rounded-lg bg-white/5 p-1 w-fit">
                {(["captions", "overlays"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      tab === t ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Captions tab */}
              {tab === "captions" && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.captions.enabled}
                      onChange={(e) => updateCaptions({ enabled: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-white/70">Auto-transcribe & add captions</span>
                  </label>
                  {config.captions.enabled && (
                    <SubtitleStylePicker
                      style={config.captions.style}
                      onChange={(s) => updateCaptions({ style: s })}
                    />
                  )}
                </div>
              )}

              {/* Overlays tab */}
              {tab === "overlays" && (
                <div className="space-y-3">
                  {/* Existing layers */}
                  {config.layers.map((layer, i) => (
                    <LayerEditor
                      key={i}
                      layer={layer}
                      index={i}
                      brandAssets={brandAssets}
                      onUpdate={(p) => updateLayer(i, p)}
                      onRemove={() => removeLayer(i)}
                      onImageUpload={(file, save) => handleImageUpload(file, i, save)}
                    />
                  ))}

                  {/* Add layer buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addLayer({ ...DEFAULT_TITLE_LAYER })}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
                    >
                      + Title
                    </button>
                    <button
                      type="button"
                      onClick={() => addLayer({ ...DEFAULT_TEXT_LAYER })}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
                    >
                      + Text
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      {uploadingImage ? "Uploading…" : "+ Image"}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, null, false);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  {/* Saved brand assets quick-add */}
                  {brandAssets.length > 0 && (
                    <div>
                      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Saved assets</p>
                      <div className="flex flex-wrap gap-2">
                        {brandAssets.map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => addLayer({
                              ...DEFAULT_IMAGE_LAYER,
                              assetId: asset.id,
                              filePath: asset.file_path,
                              publicUrl: asset.signedUrl ?? undefined,
                            })}
                            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
                          >
                            {asset.signedUrl && (
                              <img src={asset.signedUrl} alt="" className="w-5 h-5 object-contain rounded" />
                            )}
                            {asset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Burn button */}
              {hasContent && (
                <div className="mt-auto pt-2">
                  {burnError && (
                    <p className="text-xs text-red-400 mb-2">{burnError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleBurn}
                    disabled={burning || !uploadId}
                    className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:from-purple-500 hover:to-violet-500 disabled:opacity-50 transition-all"
                  >
                    {burning ? "Starting burn…" : "✨ Burn Overlays & Schedule"}
                  </button>
                  <p className="text-[10px] text-white/25 text-center mt-1">
                    Takes 1–3 min. You'll see progress while it processes.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Layer editor sub-component ────────────────────────────────────────────────

function LayerEditor({
  layer, index, brandAssets, onUpdate, onRemove, onImageUpload,
}: {
  layer: OverlayLayer;
  index: number;
  brandAssets: BrandAsset[];
  onUpdate: (p: Partial<OverlayLayer>) => void;
  onRemove: () => void;
  onImageUpload: (file: File, save: boolean) => void;
}) {
  const [saveToAccount, setSaveToAccount] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const labelColors = "text-[10px] text-white/30 uppercase tracking-wider";
  const inputCls = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/20";

  if (layer.type === "title") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/60">Title overlay</span>
          <button type="button" onClick={onRemove} className="text-white/30 hover:text-red-400 text-xs">Remove</button>
        </div>
        <input
          className={inputCls}
          placeholder="Title text…"
          value={layer.text}
          onChange={(e) => onUpdate({ text: e.target.value } as Partial<TitleLayer>)}
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <p className={labelColors}>Position</p>
            <div className="flex gap-1 mt-1">
              {(["top", "bottom"] as const).map((p) => (
                <button key={p} type="button"
                  onClick={() => onUpdate({ position: p } as Partial<TitleLayer>)}
                  className={`flex-1 rounded-lg py-1 text-xs capitalize transition-colors ${layer.position === p ? "bg-purple-600 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"}`}
                >{p}</button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <p className={labelColors}>Font</p>
            <select
              value={layer.font}
              onChange={(e) => onUpdate({ font: e.target.value } as Partial<TitleLayer>)}
              className={inputCls + " mt-1"}
            >
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div>
            <p className={labelColors}>Color</p>
            <input type="color" value={layer.color}
              onChange={(e) => onUpdate({ color: e.target.value } as Partial<TitleLayer>)}
              className="mt-1 h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer mt-4">
            <input type="checkbox" checked={layer.bold}
              onChange={(e) => onUpdate({ bold: e.target.checked } as Partial<TitleLayer>)} />
            <span className="text-xs text-white/50">Bold</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer mt-4">
            <input type="checkbox" checked={layer.background.enabled}
              onChange={(e) => onUpdate({ background: { ...layer.background, enabled: e.target.checked } } as Partial<TitleLayer>)} />
            <span className="text-xs text-white/50">Background</span>
          </label>
          {layer.background.enabled && (
            <>
              <div>
                <p className={labelColors}>BG Color</p>
                <input type="color" value={layer.background.color}
                  onChange={(e) => onUpdate({ background: { ...layer.background, color: e.target.value } } as Partial<TitleLayer>)}
                  className="mt-1 h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
              </div>
              <div className="flex-1">
                <p className={labelColors}>Opacity {layer.background.opacity}%</p>
                <input type="range" min={0} max={100} value={layer.background.opacity}
                  onChange={(e) => onUpdate({ background: { ...layer.background, opacity: Number(e.target.value) } } as Partial<TitleLayer>)}
                  className="mt-1 w-full" />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (layer.type === "text") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/60">Text overlay</span>
          <button type="button" onClick={onRemove} className="text-white/30 hover:text-red-400 text-xs">Remove</button>
        </div>
        <input
          className={inputCls}
          placeholder="Text…"
          value={layer.text}
          onChange={(e) => onUpdate({ text: e.target.value } as Partial<TextLayer>)}
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <p className={labelColors}>Font</p>
            <select value={layer.font}
              onChange={(e) => onUpdate({ font: e.target.value } as Partial<TextLayer>)}
              className={inputCls + " mt-1"}>
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <p className={labelColors}>Color</p>
            <input type="color" value={layer.color}
              onChange={(e) => onUpdate({ color: e.target.value } as Partial<TextLayer>)}
              className="mt-1 h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className={labelColors}>X pos {Math.round(layer.x * 100)}%</p>
            <input type="range" min={0} max={100} value={Math.round(layer.x * 100)}
              onChange={(e) => onUpdate({ x: Number(e.target.value) / 100 } as Partial<TextLayer>)}
              className="w-full" />
          </div>
          <div className="flex-1">
            <p className={labelColors}>Y pos {Math.round(layer.y * 100)}%</p>
            <input type="range" min={0} max={100} value={Math.round(layer.y * 100)}
              onChange={(e) => onUpdate({ y: Number(e.target.value) / 100 } as Partial<TextLayer>)}
              className="w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (layer.type === "image") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/60">Image overlay</span>
          <button type="button" onClick={onRemove} className="text-white/30 hover:text-red-400 text-xs">Remove</button>
        </div>
        <div className="flex items-center gap-2">
          {layer.publicUrl && (
            <img src={layer.publicUrl} alt="" className="h-10 w-10 object-contain rounded border border-white/10" />
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
          >
            {layer.filePath ? "Replace image" : "Choose image"}
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-white/40">
            <input type="checkbox" checked={saveToAccount} onChange={(e) => setSaveToAccount(e.target.checked)} />
            Save to account
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImageUpload(file, saveToAccount);
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className={labelColors}>X {Math.round(layer.x * 100)}%</p>
            <input type="range" min={0} max={90} value={Math.round(layer.x * 100)}
              onChange={(e) => onUpdate({ x: Number(e.target.value) / 100 } as Partial<ImageLayer>)}
              className="w-full" />
          </div>
          <div className="flex-1">
            <p className={labelColors}>Y {Math.round(layer.y * 100)}%</p>
            <input type="range" min={0} max={90} value={Math.round(layer.y * 100)}
              onChange={(e) => onUpdate({ y: Number(e.target.value) / 100 } as Partial<ImageLayer>)}
              className="w-full" />
          </div>
          <div className="flex-1">
            <p className={labelColors}>Size {Math.round(layer.width * 100)}%</p>
            <input type="range" min={5} max={50} value={Math.round(layer.width * 100)}
              onChange={(e) => onUpdate({ width: Number(e.target.value) / 100 } as Partial<ImageLayer>)}
              className="w-full" />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/uploads/EnhanceVideoPanel.tsx
git commit -m "feat: add EnhanceVideoPanel component with live preview and burn trigger"
```

---

## Task 8: Wire Up uploads/page.tsx

**Files:**
- Modify: `src/app/uploads/page.tsx`

Add burn state, polling effect, progress bar, and the `EnhanceVideoPanel` on the details step. Follows the exact same pattern as the existing `conversionJobId` vertical conversion state.

- [ ] **Step 1: Add burn state variables**

In `uploads/page.tsx`, after the existing vertical conversion state block (around line 390), add:

```typescript
  // Overlay burn state
  const [burnJobId, setBurnJobId] = useState<string | null>(null);
  const [burnStatus, setBurnStatus] = useState<"idle" | "pending" | "transcribing" | "burning" | "done" | "failed">("idle");
  const [burnUploadId, setBurnUploadId] = useState<string | null>(null);
  const [burnError, setBurnError] = useState<string | null>(null);
  const [burnProgress, setBurnProgress] = useState(0);
```

- [ ] **Step 2: Add burn polling useEffect**

After the existing conversion polling `useEffect` (around line 773), add:

```typescript
  // Poll overlay burn job status
  useEffect(() => {
    if (!burnJobId || burnStatus === "done" || burnStatus === "failed") return;
    const interval = setInterval(async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/overlay-burn/${burnJobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.ok && json.job) {
          setBurnStatus(json.job.status);
          if (json.job.status === "done") setBurnUploadId(json.job.result_upload_id);
          if (json.job.status === "failed") setBurnError(json.job.error || "Burn failed");
        }
      } catch {}
    }, 2500);
    return () => clearInterval(interval);
  }, [burnJobId, burnStatus]);
```

- [ ] **Step 3: Add burn progress bar effect**

After the conversion progress `useEffect` (around line 799), add:

```typescript
  // Drive burn progress bar
  useEffect(() => {
    if (burnStatus === "idle") { setBurnProgress(0); return; }
    if (burnStatus === "done") { setBurnProgress(100); return; }
    if (burnStatus === "failed") return;

    const ceiling = burnStatus === "pending" ? 15 : burnStatus === "transcribing" ? 55 : 88;
    const interval = setInterval(() => {
      setBurnProgress((p) => {
        if (p >= ceiling) return p;
        const gap = ceiling - p;
        return Math.min(p + Math.max(0.3, gap * 0.025), ceiling);
      });
    }, 400);
    if (burnStatus === "burning") setBurnProgress((p) => Math.max(p, 56));
    return () => clearInterval(interval);
  }, [burnStatus]);
```

- [ ] **Step 4: Guard handleSchedule against in-progress burn**

In `handleSchedule` (around line 1106), add a guard after the existing vertical conversion guard:

```typescript
    // Guard: overlay burn still in progress
    if (burnJobId && burnStatus !== "done" && burnStatus !== "failed") {
      alert("Overlay burn still in progress. Please wait.");
      return;
    }
```

- [ ] **Step 5: Update the scheduling upload_id to prefer burned version**

In `handleSchedule`, find the line that sets `upload_id` (around line 1159):

```typescript
upload_id: (verticalEnabled && verticalUploadId) ? verticalUploadId : lastUploadId,
```

Replace with:

```typescript
upload_id: (burnStatus === "done" && burnUploadId)
  ? burnUploadId
  : (verticalEnabled && verticalUploadId)
  ? verticalUploadId
  : lastUploadId,
```

- [ ] **Step 6: Add EnhanceVideoPanel import**

At the top of `uploads/page.tsx`, with the other imports:

```typescript
import { EnhanceVideoPanel } from "@/components/uploads/EnhanceVideoPanel";
```

- [ ] **Step 7: Add EnhanceVideoPanel to the details step JSX**

Find the action buttons section near the bottom of the details step JSX (the `sticky bottom-4` div around line 2811). Insert the `EnhanceVideoPanel` just above it:

```tsx
{/* Enhance Video Panel */}
{lastUploadId && (
  <EnhanceVideoPanel
    uploadId={lastUploadId}
    teamId={team?.id ?? ""}
    videoWidth={videoWidth}
    videoHeight={videoHeight}
    thumbnailUrl={null}
    onBurnStart={(jobId) => {
      setBurnJobId(jobId);
      setBurnStatus("pending");
      setBurnProgress(0);
      setBurnUploadId(null);
      setBurnError(null);
    }}
  />
)}
```

- [ ] **Step 8: Add burn progress bar to action buttons area**

Inside the sticky action buttons div, after the existing conversion progress block (around line 2841), add:

```tsx
{/* Burn progress */}
{burnJobId && (burnStatus === "pending" || burnStatus === "transcribing" || burnStatus === "burning") && (
  <div className="flex flex-1 flex-col gap-1.5 min-w-0">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <div className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-white/20 border-t-purple-400" />
        <span className="text-xs text-white/60">
          {burnStatus === "transcribing" ? "Transcribing audio…" : burnStatus === "burning" ? "Burning overlays…" : "Starting burn…"}
        </span>
      </div>
      <span className="text-xs font-medium text-white/50 tabular-nums">{Math.round(burnProgress)}%</span>
    </div>
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-500 transition-[width] duration-500 ease-out"
        style={{ width: `${burnProgress}%` }}
      />
    </div>
  </div>
)}
{burnJobId && burnStatus === "failed" && (
  <div className="flex flex-1 items-center gap-1.5 min-w-0">
    <svg className="w-3.5 h-3.5 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
    <span className="truncate text-xs text-red-300">{burnError || "Burn failed."}</span>
  </div>
)}
```

- [ ] **Step 9: Block the schedule button while burn is in progress**

Find the `publishBlocked` variable (around line 2806):

```typescript
const publishBlocked = scheduling || selectedPlatforms.length === 0 || !!ttValidationError || verticalPending;
```

Replace with:

```typescript
const burnPending = burnJobId !== null && burnStatus !== "done" && burnStatus !== "failed";
const publishBlocked = scheduling || selectedPlatforms.length === 0 || !!ttValidationError || verticalPending || burnPending;
```

- [ ] **Step 10: Manual end-to-end verification**

1. Upload a short video (10–30s works well) and reach the details step
2. Expand the "Enhance Video" panel
3. Enable captions — verify the SubtitleStylePicker appears and the preview updates
4. Add a title layer "Test Title" — verify it appears in the preview at the correct scaled position
5. Add a text layer "Follow for more!" — adjust X/Y sliders, verify it moves in the preview
6. Upload a small PNG (your logo) — verify it appears in the preview
7. Click "Burn Overlays & Schedule" — verify the progress bar appears in the sticky button bar
8. Wait for the GitHub Actions workflow to complete (check Actions tab in GitHub)
9. Verify the job row in `overlay_burn_jobs` transitions: `pending → transcribing → burning → done`
10. Verify a new row appears in `uploads` for the burned video
11. Verify the schedule button now uses the burned upload ID (check the scheduled_posts row after scheduling)

- [ ] **Step 11: Commit**

```bash
git add src/app/uploads/page.tsx
git commit -m "feat: wire up overlay burn panel and progress bar in uploads page"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Expandable panel on details step (Task 8)
- ✅ Live CSS preview with scale math (Task 6)
- ✅ Captions tab with SubtitleStylePicker reuse (Task 7)
- ✅ Title layer (Task 7 LayerEditor + Task 5 ASS generation)
- ✅ Text layers with X/Y positioning (Task 7 + Task 5)
- ✅ Image layers (upload + brand assets) (Task 7 + Task 5)
- ✅ Brand assets GET/POST/DELETE (Task 3)
- ✅ overlay_burn_jobs table + API (Task 1 + Task 4)
- ✅ GitHub Actions workflow with faster-whisper + FFmpeg (Task 5)
- ✅ Portrait conversion modes (Task 5 in workflow)
- ✅ Burn progress bar in uploads page (Task 8)
- ✅ Scheduling uses burned upload ID when done (Task 8 Step 5)
- ✅ All plans: no plan gate (Task 4 checks active/trialing only)

**Type consistency confirmed:**
- `OverlayConfig`, `TitleLayer`, `TextLayer`, `ImageLayer` defined in Task 2, used consistently in Tasks 6, 7
- `DEFAULT_TITLE_LAYER`, `DEFAULT_TEXT_LAYER`, `DEFAULT_IMAGE_LAYER` defined once, spread in Task 7
- `burnJobId`/`burnStatus`/`burnUploadId`/`burnError`/`burnProgress` added in Task 8 Step 1 and referenced correctly in Steps 2–9
- `onBurnStart` callback in `EnhanceVideoPanel` (Task 7) matches usage in Task 8 Step 7

**No placeholders found.**
