import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube } from "@/lib/youtubeUpload";

export const runtime = "nodejs";

const MAX_BATCH = 5;

function requireWorkerAuth(req: Request) {
  const expected = process.env.WORKER_SECRET;
  // Allow locally if not set
  if (!expected) return;

  const token = new URL(req.url).searchParams.get("token");
  if (token !== expected) {
    throw new Error("Unauthorized worker request");
  }
}

function qs(req: Request) {
  return new URL(req.url).searchParams;
}

function pickFirstNonEmpty(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim().length > 0) return { key: k, value: v };
  }
  return { key: null as string | null, value: null as string | null };
}

async function runWorker(req: Request) {
  requireWorkerAuth(req);

  const params = qs(req);
  const nowIso = new Date().toISOString();

  const postId = params.get("postId");
  const retryFailed = params.get("retryFailed") === "1";
  const debug = params.get("debug") === "1";
  const setUploadId = params.get("setUploadId"); // optional debug override

  const DEFAULT_BUCKET = process.env.UPLOADS_BUCKET || "uploads";

  // statuses to fetch
  const statuses = retryFailed ? ["scheduled", "failed"] : ["scheduled"];

  let query = supabaseAdmin
    .from("scheduled_posts")
    .select("id,user_id,upload_id,title,description,privacy_status,status,scheduled_for,provider")
    .in("status", statuses)
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_BATCH);

  if (postId) {
    query = supabaseAdmin
      .from("scheduled_posts")
      .select("id,user_id,upload_id,title,description,privacy_status,status,scheduled_for,provider")
      .eq("id", postId)
      .limit(1);
  }

  const { data: duePosts, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, processed: 0, results: [] },
      { status: 500 }
    );
  }

  if (!duePosts || duePosts.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [] });
  }

  const results: any[] = [];

  for (const post of duePosts) {
    const debugOut: any = debug ? { post: { ...post } } : undefined;

    try {
      // Optional debug override: set upload_id on this post
      if (setUploadId && post.id) {
        await supabaseAdmin
          .from("scheduled_posts")
          .update({ upload_id: setUploadId })
          .eq("id", post.id);

        post.upload_id = setUploadId;
        if (debugOut) debugOut.post.upload_id = setUploadId;
      }

      // Lock job (best-effort)
      const { error: lockErr } = await supabaseAdmin
        .from("scheduled_posts")
        .update({ status: "posting", last_error: null })
        .eq("id", post.id);

      if (lockErr) {
        throw new Error(
          `Failed to lock post: ${lockErr.message || "Unknown lock error"}`
        );
      }

      // Load upload row (we don't assume column names — we probe)
      const { data: uploadBase, error: uploadBaseErr } = await supabaseAdmin
        .from("uploads")
        .select("*")
        .eq("id", post.upload_id)
        .maybeSingle();

      if (debugOut) {
        debugOut.uploadBaseExists = !!uploadBase;
        debugOut.uploadBaseError = uploadBaseErr?.message || null;
      }

      if (uploadBaseErr || !uploadBase) {
        throw new Error(`Upload row not found for upload_id=${post.upload_id}`);
      }

      // Determine path column (your schema drift has changed names)
      const probed = pickFirstNonEmpty(uploadBase, [
        "file_path",
        "storage_path",
        "path",
        "object_path",
      ]);

      if (debugOut) debugOut.pathColumn = probed.key;

      if (!probed.value) {
        throw new Error("Upload row exists but storage path is missing");
      }

      // ✅ Read bucket from uploads table if present, else fallback
      const bucket =
        (typeof uploadBase.bucket === "string" && uploadBase.bucket.trim()
          ? uploadBase.bucket.trim()
          : DEFAULT_BUCKET);

      const storagePath = probed.value;

      // Load YouTube account (must have refresh_token)
      const { data: acct, error: acctErr } = await supabaseAdmin
        .from("platform_accounts")
        .select("id, refresh_token")
        .eq("user_id", post.user_id)
        .eq("provider", "youtube")
        .maybeSingle();

      if (acctErr) {
        throw new Error(`Failed to load YouTube account: ${acctErr.message}`);
      }

      if (!acct?.refresh_token) {
        throw new Error(
          `YouTube not connected for scheduled_posts.user_id=${post.user_id}`
        );
      }

      // Upload to YouTube
      const yt = await uploadSupabaseVideoToYouTube({
        userId: post.user_id,
        platformAccountId: acct.id,
        refreshToken: acct.refresh_token,
        bucket,
        storagePath,
        title: post.title ?? "Clip Scheduler Upload",
        description: post.description ?? "",
        privacyStatus: (post.privacy_status ?? "private") as any,
      });

      // Mark posted
      await supabaseAdmin
        .from("scheduled_posts")
        .update({
          status: "posted",
          provider: "youtube",
          posted_at: new Date().toISOString(),
          platform_post_id: yt.youtubeVideoId,
          last_error: null,
        })
        .eq("id", post.id);

      const okResult: any = { id: post.id, ok: true, youtubeVideoId: yt.youtubeVideoId };
      if (debugOut) okResult.debug = debugOut;

      results.push(okResult);
    } catch (e: any) {
      const message = e?.message || "Unknown error";

      await supabaseAdmin
        .from("scheduled_posts")
        .update({
          status: "failed",
          last_error: message,
        })
        .eq("id", post.id);

      const badResult: any = { id: post.id, ok: false, error: message };
      if (debugOut) badResult.debug = debugOut;

      results.push(badResult);
    }
  }

  const out: any = { ok: true, processed: results.length, results };
  return NextResponse.json(out);
}

export async function POST(req: Request) {
  try {
    return await runWorker(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    return await runWorker(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Unknown error" }, { status: 500 });
  }
}
