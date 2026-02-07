import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube } from "@/lib/youtubeUpload";
import { uploadSupabaseVideoToTikTok } from "@/lib/tiktokUpload";

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

  const statuses = retryFailed ? ["scheduled", "failed"] : ["scheduled"];

  // Pull due posts (or a single post)
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

      // ✅ Concurrency-safe claim
      // Only claim if status is in the allowed set (scheduled, and failed if retryFailed)
      const claimStatuses = retryFailed ? ["scheduled", "failed"] : ["scheduled"];

      const { data: claimedRows, error: claimErr } = await supabaseAdmin
        .from("scheduled_posts")
        .update({ status: "posting", last_error: null })
        .eq("id", post.id)
        .in("status", claimStatuses)
        .select("id");

      if (claimErr) {
        throw new Error(`Failed to claim post: ${claimErr.message}`);
      }

      // If 0 rows returned, someone else already claimed it or it is not eligible anymore
      if (!claimedRows || claimedRows.length === 0) {
        results.push({
          id: post.id,
          ok: true,
          skipped: true,
          reason: "Already claimed or not eligible",
          ...(debugOut ? { debug: debugOut } : {}),
        });
        continue;
      }

      // Load upload row (probe schema)
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

      const bucket =
        typeof uploadBase.bucket === "string" && uploadBase.bucket.trim()
          ? uploadBase.bucket.trim()
          : DEFAULT_BUCKET;

      const storagePath = probed.value;

      const provider = post.provider || "youtube";

      // Load platform account
      const { data: acct, error: acctErr } = await supabaseAdmin
        .from("platform_accounts")
        .select("id, refresh_token, access_token, expires_at, platform_user_id")
        .eq("user_id", post.user_id)
        .eq("provider", provider)
        .maybeSingle();

      if (acctErr) {
        throw new Error(`Failed to load ${provider} account: ${acctErr.message}`);
      }

      if (!acct?.refresh_token) {
        throw new Error(
          `${provider} not connected for scheduled_posts.user_id=${post.user_id}`
        );
      }

      let platformPostId: string | null = null;

      if (provider === "tiktok") {
        // Fetch tiktok_settings separately to avoid breaking the main query if column doesn't exist
        let ttSettings: any = {};
        try {
          const { data: ttRow } = await supabaseAdmin
            .from("scheduled_posts")
            .select("tiktok_settings")
            .eq("id", post.id)
            .maybeSingle();
          ttSettings = ttRow?.tiktok_settings || {};
        } catch {}

        const tt = await uploadSupabaseVideoToTikTok({
          userId: post.user_id,
          platformAccountId: acct.id,
          refreshToken: acct.refresh_token,
          accessToken: acct.access_token,
          expiresAt: acct.expires_at,
          bucket,
          storagePath,
          title: post.title ?? "Clip Scheduler Upload",
          description: post.description ?? "",
          privacyLevel: ttSettings.privacy_level || "SELF_ONLY",
          allowComments: ttSettings.allow_comments ?? true,
          allowDuet: ttSettings.allow_duet ?? true,
          allowStitch: ttSettings.allow_stitch ?? true,
        });
        platformPostId = tt.publishId;
      } else {
        // YouTube (default)
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
        platformPostId = yt.youtubeVideoId;
      }

      // Mark posted
      await supabaseAdmin
        .from("scheduled_posts")
        .update({
          status: "posted",
          posted_at: new Date().toISOString(),
          platform_post_id: platformPostId,
          last_error: null,
        })
        .eq("id", post.id);

      const okResult: any = {
        id: post.id,
        ok: true,
        platformPostId,
      };
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

  return NextResponse.json({ ok: true, processed: results.length, results });
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
