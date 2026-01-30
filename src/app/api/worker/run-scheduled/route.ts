import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube } from "@/lib/youtubeUpload";

export const runtime = "nodejs";

const MAX_BATCH = 5;

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

  const { data: duePosts, error } = await supabaseAdmin
    .from("scheduled_posts")
    .select(
      "id, user_id, provider, upload_id, title, description, privacy_status, platforms, scheduled_for, status"
    )
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .or("provider.eq.youtube,platforms.cs.{youtube}")
    .order("scheduled_for", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    return { ok: false, error: error.message, processed: 0, results: [] as any[] };
  }

  if (!duePosts || duePosts.length === 0) {
    return { ok: true, processed: 0, results: [] as any[] };
  }

  const results: Array<{ id: string; ok: boolean; youtubeVideoId?: string; error?: string }> = [];

  for (const post of duePosts) {
    try {
      // Lock the job
      await supabaseAdmin
        .from("scheduled_posts")
        .update({ status: "posting", last_error: null })
        .eq("id", post.id)
        .eq("status", "scheduled");

      // Load upload row
      const { data: uploadRow, error: uploadErr } = await supabaseAdmin
        .from("uploads")
        .select("id, user_id, bucket, storage_path")
        .eq("id", post.upload_id)
        .eq("user_id", post.user_id)
        .single();

      if (uploadErr || !uploadRow) {
        throw new Error(`Upload not found for scheduled_post=${post.id}`);
      }

      // Load YouTube account
      const { data: acct, error: acctErr } = await supabaseAdmin
        .from("platform_accounts")
        .select("id, refresh_token")
        .eq("user_id", post.user_id)
        .eq("provider", "youtube")
        .single();

      if (acctErr || !acct?.refresh_token) {
        throw new Error("YouTube not connected (missing refresh_token)");
      }

      // Upload
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

      // Mark posted
      await supabaseAdmin
        .from("scheduled_posts")
        .update({
          status: "posted",
          provider: "youtube",
          platform_post_id: yt.youtubeVideoId,
          posted_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", post.id);

      results.push({ id: post.id, ok: true, youtubeVideoId: yt.youtubeVideoId });
    } catch (e: any) {
      const message = e?.message || "Unknown error";

      await supabaseAdmin
        .from("scheduled_posts")
        .update({
          status: "failed",
          last_error: message,
        })
        .eq("id", post.id);

      results.push({ id: post.id, ok: false, error: message });
    }
  }

  return { ok: true, processed: results.length, results };
}

// ✅ Accept BOTH POST and GET so Supabase cron and manual tests work.
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const out = await runWorker();
  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const out = await runWorker();
  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}
