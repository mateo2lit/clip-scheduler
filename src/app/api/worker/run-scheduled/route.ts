import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube } from "@/lib/youtubeUpload";

export const runtime = "nodejs";

const MAX_BATCH = 5;

function requireWorkerAuth(req: Request) {
  const expected = process.env.WORKER_SECRET;
  if (!expected) return; // allow locally if not set

  // ✅ Vercel Cron can include query params reliably
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";

  if (token !== expected) {
    throw new Error("Unauthorized worker request");
  }
}

async function runWorker(req: Request) {
  requireWorkerAuth(req);

  const nowIso = new Date().toISOString();

  console.log("worker/run-scheduled hit", {
    nowIso,
    ua: req.headers.get("user-agent"),
  });

  // ✅ Pull due jobs.
  // Supports:
  //  - provider='youtube'
  //  - OR platforms contains 'youtube' (if your scheduler uses platforms array)
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
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  console.log("duePosts", duePosts?.length ?? 0);

  if (!duePosts || duePosts.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [] });
  }

  const results: Array<{ id: string; ok: boolean; youtubeVideoId?: string; error?: string }> = [];

  for (const post of duePosts) {
    try {
      // Lock
      await supabaseAdmin
        .from("scheduled_posts")
        .update({ status: "posting", last_error: null })
        .eq("id", post.id)
        .eq("status", "scheduled");

      // Load upload
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

      // Upload to YouTube
      const yt = await uploadSupabaseVideoToYouTube({
        userId: post.user_id,
        platformAccountId: acct.id,
        refreshToken: acct.refresh_token,
        bucket: uploadRow.bucket,
        storagePath: uploadRow.storage_path, // ✅ correct property name
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

  return NextResponse.json({ ok: true, processed: results.length, results });
}

// ✅ Allow both GET and POST (debug + cron friendliness)
export async function GET(req: Request) {
  try {
    return await runWorker(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    return await runWorker(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unauthorized" }, { status: 401 });
  }
}
