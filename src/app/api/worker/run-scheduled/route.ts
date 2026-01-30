import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube } from "@/lib/youtubeUpload";

export const runtime = "nodejs";

const MAX_BATCH = 5;

function requireWorkerAuth(req: Request) {
  const expected = process.env.WORKER_SECRET;
  if (!expected) return;
  const token = new URL(req.url).searchParams.get("token");
  if (token !== expected) throw new Error("Unauthorized worker request");
}

type Status = "scheduled" | "posting" | "posted" | "failed";

function pickStoragePath(row: any): string | null {
  return (
    row?.storage_path ??
    row?.path ??
    row?.file_path ??
    row?.object_path ??
    row?.storage_key ??
    null
  );
}

async function runWorker(req: Request) {
  requireWorkerAuth(req);

  const url = new URL(req.url);
  const postId = url.searchParams.get("postId");
  const retryFailed = url.searchParams.get("retryFailed") === "1";
  const debug = url.searchParams.get("debug") === "1";

  const nowIso = new Date().toISOString();
  const statuses: Status[] = retryFailed ? ["scheduled", "failed"] : ["scheduled"];

  // Fetch targeted post (we only care about your test flow)
  if (!postId) {
    return NextResponse.json(
      { ok: false, error: "Missing postId (use ?postId=...)" },
      { status: 400 }
    );
  }

  const { data: posts, error: postErr } = await supabaseAdmin
    .from("scheduled_posts")
    .select("id,user_id,upload_id,title,description,privacy_status,status,scheduled_for,provider")
    .eq("id", postId)
    .in("status", statuses);

  if (postErr) return NextResponse.json({ ok: false, error: postErr.message }, { status: 500 });

  const post = posts?.[0];
  if (!post) return NextResponse.json({ ok: true, processed: 0, results: [] });

  // Debug early info
  const dbg: any = { post };

  // Enforce due + provider
  if (post.provider !== "youtube" || post.scheduled_for > nowIso) {
    if (debug) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        results: [],
        debug: { reason: "post not due or provider not youtube", ...dbg },
      });
    }
    return NextResponse.json({ ok: true, processed: 0, results: [] });
  }

  try {
    // Lock job
    const { data: locked, error: lockErr } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ status: "posting", last_error: null })
      .eq("id", post.id)
      .in("status", statuses)
      .select("id");

    if (lockErr) throw new Error(`Failed to lock post: ${lockErr.message}`);
    if (!locked || locked.length === 0) throw new Error("Failed to lock post (status changed)");

    // Load upload row
    const { data: uploadRow, error: uploadErr } = await supabaseAdmin
      .from("uploads")
      .select("id, user_id, bucket, storage_path, path, file_path, object_path, storage_key")
      .eq("id", post.upload_id)
      .maybeSingle();

    dbg.uploadRowExists = !!uploadRow;
    dbg.uploadLookupError = uploadErr?.message ?? null;

    // Also list recent uploads for that user (helps you pick a valid upload_id)
    const { data: recentUploads } = await supabaseAdmin
      .from("uploads")
      .select("id, created_at")
      .eq("user_id", post.user_id)
      .order("created_at", { ascending: false })
      .limit(5);

    dbg.recentUploads = recentUploads ?? [];

    if (!uploadRow) {
      throw new Error(`Upload row not found for upload_id=${post.upload_id}`);
    }

    const bucket = uploadRow.bucket ?? "uploads"; // change if needed
    const storagePath = pickStoragePath(uploadRow);
    if (!storagePath) throw new Error("Upload row exists but storage path is missing");

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
      bucket,
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
