import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube } from "@/lib/youtubeUpload";

export const runtime = "nodejs";

const MAX_BATCH = 5;

/**
 * Requires ?token=WORKER_SECRET in production
 * (Locally allowed if WORKER_SECRET is not set)
 */
function isAuthorized(req: Request) {
  const expected = process.env.WORKER_SECRET;
  if (!expected) return true;

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  return token === expected;
}

async function runWorker() {
  const nowIso = new Date().toISOString();

  // Bucket name for Supabase Storage where videos are uploaded
  const uploadsBucket = process.env.SUPABASE_UPLOADS_BUCKET || "uploads";

  const { data: duePosts, error } = await supabaseAdmin
    .from("scheduled_posts")
    .select(
      [
        "id",
        "user_id",
        "provider",
        "status",
        "scheduled_for",
        "title",
        "description",
        "privacy_status",
        "upload_file_name",
        "upload_title",
      ].join(",")
    )
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .eq("provider", "youtube")
    .order("scheduled_for", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    return { ok: false, error: error.message, processed: 0, results: [] as any[] };
  }

  if (!duePosts || duePosts.length === 0) {
    return { ok: true, processed: 0, results: [] as any[] };
  }

  const results: Array<{ id: string; ok: boolean; youtubeVideoId?: string; error?: string }> = [];

  for (const post of duePosts as any[]) {
    try {
      // 1) Lock the job
      const { error: lockErr } = await supabaseAdmin
        .from("scheduled_posts")
        .update({ status: "posting", last_error: null })
        .eq("id", post.id)
        .eq("status", "scheduled");

      if (lockErr) throw new Error("Failed to lock post: " + lockErr.message);

      // 2) Compute storage location directly from scheduled_posts fields
      const fileName = post.upload_file_name as string | null;
      if (!fileName) {
        throw new Error("Missing upload_file_name on scheduled_posts row");
      }

      // ✅ Assumes your upload flow stores videos at: `${user_id}/${filename}`
      const storagePath = `${post.user_id}/${fileName}`;

      // 3) Load YouTube refresh_token for that user (and provider)
      const provider = post.provider ?? "youtube";

      const { data: acct, error: acctErr } = await supabaseAdmin
        .from("platform_accounts")
        .select("id, refresh_token")
        .eq("user_id", post.user_id)
        .eq("provider", provider)
        .single();

      if (acctErr || !acct?.refresh_token) {
        throw new Error("YouTube not connected (missing refresh_token)");
      }

      // 4) Upload to YouTube
      const yt = await uploadSupabaseVideoToYouTube({
        userId: post.user_id,
        platformAccountId: acct.id,
        refreshToken: acct.refresh_token,
        bucket: uploadsBucket,
        storagePath,
        title: post.title ?? post.upload_title ?? "Clip Scheduler Upload",
        description: post.description ?? "",
        privacyStatus: (post.privacy_status ?? "private") as any,
      });

      // 5) Mark posted
      const { error: postedErr } = await supabaseAdmin
        .from("scheduled_posts")
        .update({
          status: "posted",
          platform_post_id: yt.youtubeVideoId,
          posted_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", post.id);

      if (postedErr) throw new Error("Failed to mark posted: " + postedErr.message);

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

  return { ok: true, processed: results.length, results };
}

// ✅ POST (cron)
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const out = await runWorker();
  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}

// ✅ GET (manual test)
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const out = await runWorker();
  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}
