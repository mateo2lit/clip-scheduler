import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube } from "@/lib/youtubeUpload";

export const runtime = "nodejs";

const DEFAULT_BUCKET = process.env.UPLOADS_BUCKET || "uploads";

function requireWorkerAuth(req: Request) {
  const expected = process.env.WORKER_SECRET;
  if (!expected) return;
  const token = new URL(req.url).searchParams.get("token");
  if (token !== expected) throw new Error("Unauthorized worker request");
}

type Status = "scheduled" | "posting" | "posted" | "failed";

async function probeUploadPath(uploadId: string): Promise<{ column?: string; value?: string }> {
  const candidates = ["path", "file_path", "object_path", "storage_key", "key", "url"] as const;

  for (const col of candidates) {
    const { data, error } = await supabaseAdmin
      .from("uploads")
      .select(`id, ${col}`)
      .eq("id", uploadId)
      .maybeSingle();

    // If column doesn't exist, Supabase returns an error like "column uploads.X does not exist"
    if (error) continue;

    const value = (data as any)?.[col];
    if (typeof value === "string" && value.length > 0) {
      return { column: col, value };
    }
  }

  return {};
}

async function runWorker(req: Request) {
  requireWorkerAuth(req);

  const url = new URL(req.url);
  const postId = url.searchParams.get("postId");
  const retryFailed = url.searchParams.get("retryFailed") === "1";
  const debug = url.searchParams.get("debug") === "1";
  const patchUploadId = url.searchParams.get("setUploadId");

  const statuses: Status[] = retryFailed ? ["scheduled", "failed"] : ["scheduled"];
  const nowIso = new Date().toISOString();

  if (!postId) {
    return NextResponse.json({ ok: false, error: "Missing postId" }, { status: 400 });
  }

  // Optional: patch upload id + make due
  if (patchUploadId) {
    const { error: patchErr } = await supabaseAdmin
      .from("scheduled_posts")
      .update({
        upload_id: patchUploadId,
        status: "scheduled",
        scheduled_for: new Date(Date.now() - 60_000).toISOString(),
        last_error: null,
      })
      .eq("id", postId);

    if (patchErr) {
      return NextResponse.json({ ok: false, error: patchErr.message }, { status: 500 });
    }
  }

  const { data: posts, error: postErr } = await supabaseAdmin
    .from("scheduled_posts")
    .select("id,user_id,upload_id,title,description,privacy_status,status,scheduled_for,provider")
    .eq("id", postId)
    .in("status", statuses);

  if (postErr) return NextResponse.json({ ok: false, error: postErr.message }, { status: 500 });

  const post = posts?.[0];
  if (!post) return NextResponse.json({ ok: true, processed: 0, results: [] });

  const dbg: any = { post };

  // Must be youtube + due
  if (post.provider !== "youtube" || post.scheduled_for > nowIso) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      results: [],
      ...(debug ? { debug: { reason: "post not due or provider not youtube", ...dbg } } : {}),
    });
  }

  try {
    // Lock
    const { data: locked, error: lockErr } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ status: "posting", last_error: null })
      .eq("id", post.id)
      .in("status", statuses)
      .select("id");

    if (lockErr) throw new Error(`Failed to lock post: ${lockErr.message}`);
    if (!locked || locked.length === 0) throw new Error("Failed to lock post (status changed)");

    // ✅ Upload base row (guaranteed columns only)
    const { data: uploadBase, error: uploadBaseErr } = await supabaseAdmin
      .from("uploads")
      .select("id, user_id, created_at")
      .eq("id", post.upload_id)
      .maybeSingle();

    dbg.uploadBaseExists = !!uploadBase;
    dbg.uploadBaseError = uploadBaseErr?.message ?? null;

    const { data: recentUploads } = await supabaseAdmin
      .from("uploads")
      .select("id, created_at")
      .eq("user_id", post.user_id)
      .order("created_at", { ascending: false })
      .limit(5);

    dbg.recentUploads = recentUploads ?? [];

    if (!uploadBase) throw new Error(`Upload row not found for upload_id=${post.upload_id}`);

    // ✅ Probe which column actually contains the storage path
    const probed = await probeUploadPath(post.upload_id);
    dbg.pathColumn = probed.column ?? null;

    if (!probed.value) {
      throw new Error(
        "Upload row exists but no usable path field found. Expected one of: path, file_path, object_path, storage_key, key, url"
      );
    }

    const storagePath = probed.value;

    // Load YouTube account
    const { data: acct, error: acctErr } = await supabaseAdmin
      .from("platform_accounts")
      .select("id, refresh_token")
      .eq("user_id", post.user_id)
      .eq("provider", "youtube")
      .single();

    if (acctErr || !acct?.refresh_token) {
      throw new Error(`YouTube not connected for scheduled_posts.user_id=${post.user_id}`);
    }

    const yt = await uploadSupabaseVideoToYouTube({
      userId: post.user_id,
      platformAccountId: acct.id,
      refreshToken: acct.refresh_token,
      bucket: DEFAULT_BUCKET,
      storagePath,
      title: post.title ?? "Clip Scheduler Upload",
      description: post.description ?? "",
      privacyStatus: (post.privacy_status ?? "private") as any,
    });

    await supabaseAdmin
      .from("scheduled_posts")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        platform_post_id: yt.youtubeVideoId,
        last_error: null,
      })
      .eq("id", post.id);

    return NextResponse.json({
      ok: true,
      processed: 1,
      results: [{ id: post.id, ok: true, youtubeVideoId: yt.youtubeVideoId }],
      ...(debug ? { debug: dbg } : {}),
    });
  } catch (e: any) {
    const message = e?.message || "Unknown error";

    await supabaseAdmin
      .from("scheduled_posts")
      .update({ status: "failed", last_error: message })
      .eq("id", post.id);

    return NextResponse.json({
      ok: true,
      processed: 1,
      results: [{ id: post.id, ok: false, error: message }],
      ...(debug ? { debug: dbg } : {}),
    });
  }
}

export async function POST(req: Request) {
  try {
    return await runWorker(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Unknown error" }, { status: 401 });
  }
}

export async function GET(req: Request) {
  try {
    return await runWorker(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Unknown error" }, { status: 401 });
  }
}
