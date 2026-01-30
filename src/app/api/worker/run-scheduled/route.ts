import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube } from "@/lib/youtubeUpload";

export const runtime = "nodejs";

const MAX_BATCH = 5;

/**
 * Simple worker auth:
 * Requires ?token=WORKER_SECRET in production.
 */
function isAuthorized(req: Request) {
  const expected = process.env.WORKER_SECRET;

  // Allow locally if not set
  if (!expected) return true;

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  return token === expected;
}

async function runWorker() {
  const nowIso = new Date().toISOString();

  /**
   * ✅ Find due scheduled posts
   * Only YouTube for now (provider column exists)
   */
  const { data: duePosts, error } = await supabaseAdmin
    .from("scheduled_posts")
    .select(
      "id, user_id, provider, upload_id, title, description, privacy_status, scheduled_for, status"
    )
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .eq("provider", "youtube")
    .order("scheduled_for", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    return {
      ok: false,
      error: error.message,
      processed: 0,
      results: [],
    };
  }

  if (!duePosts || duePosts.length === 0) {
    return {
      ok: true,
      processed: 0,
      results: [],
    };
  }

  const results: Array<{
    id: string;
    ok: boolean;
    youtubeVideoId?: string;
    error?: string;
  }> = [];

  /**
   * ✅ Process each scheduled post
   */
  for (const post of duePosts) {
    try {
      /**
       * Step 1: Lock job → posting
       */
      const { error: lockErr } = await supabaseAdmin
        .from("scheduled_posts")
        .update({ status: "posting", last_error: null })
        .eq("id", post.id)
        .eq("status", "scheduled");

      if (lockErr) {
        throw new Error("Failed to lock post: " + lockErr.message);
      }

      /**
       * Step 2: Load upload file info
       */
      const { data: uploadRow, error: uploadErr } = await supabaseAdmin
        .from("uploads")
        .select("id, bucket, storage_path")
        .eq("id", post.upload_id)
        .single();

      if (uploadErr || !uploadRow) {
        throw new Error("Upload file missing for scheduled_post=" + post.id);
      }

      /**
       * Step 3: Load platform refresh_token
       */
      const provider = post.provider ?? "youtube";

      const { data: acct, error: acctErr } = await supabaseAdmin
        .from("platform_accounts")
        .select("id, refresh_token")
        .eq("user_id", post.user_id)
        .eq("provider", provider)
        .single();

      if (acctErr || !acct?.refresh_token) {
        throw new Error("Missing refresh_token for provider=" + provider);
      }

      /**
       * Step 4: Upload video to YouTube
       */
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

      /**
       * Step 5: Mark as posted
       */
      const { error: postedErr } = await supabaseAdmin
        .from("scheduled_posts")
        .update({
          status: "posted",
          platform_post_id: yt.youtubeVideoId,
          posted_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", post.id);

      if (postedErr) {
        throw new Error("Failed to mark posted: " + postedErr.message);
      }

      results.push({
        id: post.id,
        ok: true,
        youtubeVideoId: yt.youtubeVideoId,
      });
    } catch (e: any) {
      const message = e?.message || "Unknown worker error";

      await supabaseAdmin
        .from("scheduled_posts")
        .update({
          status: "failed",
          last_error: message,
        })
        .eq("id", post.id);

      results.push({
        id: post.id,
        ok: false,
        error: message,
      });
    }
  }

  return {
    ok: true,
    processed: results.length,
    results,
  };
}

/**
 * ✅ POST (Supabase cron)
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const out = await runWorker();
  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}

/**
 * ✅ GET (Manual browser testing)
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const out = await runWorker();
  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}
