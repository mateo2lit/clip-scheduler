import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube } from "@/lib/youtubeUpload";

export const runtime = "nodejs";

const MAX_BATCH = 5;

function requireWorkerAuth(req: Request) {
  const expected = process.env.WORKER_SECRET;
  if (!expected) return; // allow local if not set

  const token = new URL(req.url).searchParams.get("token");
  if (token !== expected) {
    throw new Error("Unauthorized worker request");
  }
}

type Status = "scheduled" | "posting" | "posted" | "failed";

async function runWorker(req: Request) {
  requireWorkerAuth(req);

  const url = new URL(req.url);
  const postId = url.searchParams.get("postId"); // optional: process exactly one job
  const retryFailed = url.searchParams.get("retryFailed") === "1"; // optional: include failed

  const nowIso = new Date().toISOString();

  // Build status filter
  const statuses: Status[] = retryFailed ? ["scheduled", "failed"] : ["scheduled"];

  // Fetch due posts (or one post)
  let duePosts: any[] | null = null;

  if (postId) {
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id,user_id,upload_id,title,description,privacy_status,status,scheduled_for,provider")
      .eq("id", postId)
      .in("status", statuses);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    duePosts = data ?? [];
  } else {
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id,user_id,upload_id,title,description,privacy_status,status,scheduled_for,provider")
      .in("status", statuses)
      .lte("scheduled_for", nowIso)
      .eq("provider", "youtube")
      .order("scheduled_for", { ascending: true })
      .limit(MAX_BATCH);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    duePosts = data ?? [];
  }

  // If we're processing a single post, still enforce provider + due time
  if (postId && duePosts.length > 0) {
    duePosts = duePosts.filter((p) => {
      const due = !p.scheduled_for || p.scheduled_for <= nowIso;
      return p.provider === "youtube" && due;
    });
  }

  if (!duePosts || duePosts.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [] });
  }

  const results: any[] = [];

  for (const post of duePosts) {
    try {
      // Lock the job
      const { data: locked, error: lockErr } = await supabaseAdmin
        .from("scheduled_posts")
        .update({ status: "posting", last_error: null })
        .eq("id", post.id)
        .in("status", statuses)
        .select("id");

      if (lockErr) throw new Error(`Failed to lock post: ${lockErr.message}`);
      if (!locked || locked.length === 0) throw new Error("Failed to lock post (status changed)");

      // Load upload row (your uploads table may not have bucket/storage_path — adjust to your schema)
      const { data: uploadRow, error: uploadErr } = await supabaseAdmin
        .from("uploads")
        .select("bucket, storage_path")
        .eq("id", post.upload_id)
        .single();

      if (uploadErr || !uploadRow) throw new Error("Upload file missing");

      // Load YouTube account for that SAME user_id
      const { data: acct, error: acctErr } = await supabaseAdmin
        .from("platform_accounts")
        .select("id, refresh_token")
        .eq("user_id", post.user_id)
        .eq("provider", "youtube")
        .single();

      if (acctErr || !acct?.refresh_token) {
        throw new Error(
          `YouTube not connected for scheduled_posts.user_id=${post.user_id} (missing refresh_token)`
        );
      }

      const yt = await uploadSupabaseVideoToYouTube({
        userId: post.user_id,
        platformAccountId: acct.id,
        refreshToken: acct.refresh_token,
        bucket: uploadRow.bucket,
        storagePath: uploadRow.storage_path,
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

      results.push({ id: post.id, ok: true, youtubeVideoId: yt.youtubeVideoId });
    } catch (e: any) {
      const message = e?.message || "Unknown error";

      await supabaseAdmin
        .from("scheduled_posts")
        .update({ status: "failed", last_error: message })
        .eq("id", post.id);

      results.push({ id: post.id, ok: false, error: message });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
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
