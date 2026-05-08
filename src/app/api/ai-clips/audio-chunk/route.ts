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
