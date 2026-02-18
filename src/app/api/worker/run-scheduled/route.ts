import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube, CATEGORY_IDS } from "@/lib/youtubeUpload";
import { uploadSupabaseVideoToTikTok } from "@/lib/tiktokUpload";
import { uploadSupabaseVideoToFacebook } from "@/lib/facebookUpload";
import { createInstagramContainer, checkAndPublishInstagramContainer } from "@/lib/instagramUpload";
import { uploadSupabaseVideoToLinkedIn } from "@/lib/linkedinUpload";
import { sendPostSuccessEmail, sendPostFailedEmail, sendReconnectEmail, sendGroupSummaryEmail } from "@/lib/email";

export const runtime = "nodejs";

const MAX_BATCH = 5;

function requireWorkerAuth(req: Request) {
  const expected = process.env.WORKER_SECRET;
  if (!expected) throw new Error("WORKER_SECRET is not configured");

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

async function getNotificationInfo(userId: string) {
  try {
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = user?.user?.email;
    if (!email) return null;

    const { data: prefs } = await supabaseAdmin
      .from("notification_preferences")
      .select("notify_post_success, notify_post_failed, notify_reconnect")
      .eq("user_id", userId)
      .maybeSingle();

    return {
      email,
      notifySuccess: prefs?.notify_post_success ?? true,
      notifyFailed: prefs?.notify_post_failed ?? true,
      notifyReconnect: prefs?.notify_reconnect ?? true,
    };
  } catch {
    return null;
  }
}

async function checkAndNotifyGroup(groupId: string, userId: string, postTitle: string) {
  try {
    const { data: groupPosts, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, provider, status, last_error")
      .eq("group_id", groupId);

    if (error || !groupPosts || groupPosts.length === 0) return;

    // If any post is still in a non-terminal state, wait for it
    const stillPending = groupPosts.some(
      (p: any) => ["scheduled", "posting", "ig_processing"].includes(p.status)
    );
    if (stillPending) return;

    const info = await getNotificationInfo(userId);
    if (!info) return;

    // Build results for summary email
    const results = groupPosts.map((p: any) => ({
      platform: p.provider,
      ok: p.status === "posted",
      error: p.last_error || undefined,
    }));

    const anyFailed = results.some((r) => !r.ok);

    if (anyFailed ? info.notifyFailed : info.notifySuccess) {
      await sendGroupSummaryEmail(info.email, postTitle, results);
    }

    // Send reconnect emails for any reconnect-type failures
    for (const p of groupPosts) {
      if (p.status === "failed" && p.last_error) {
        const isReconnectError = p.last_error.includes("not connected") || p.last_error.includes("reconnect") || p.last_error.includes("expired");
        if (isReconnectError && info.notifyReconnect) {
          await sendReconnectEmail(info.email, p.provider);
        }
      }
    }
  } catch (e) {
    console.error("checkAndNotifyGroup error:", e);
  }
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

  // ── Process ig_processing posts first ──────────────────────────────
  const igProcessingResults: any[] = [];
  {
    const { data: igPosts, error: igErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, user_id, team_id, provider, ig_container_id, ig_container_created_at, instagram_settings, group_id, title")
      .eq("status", "ig_processing")
      .limit(5);

    if (!igErr && igPosts && igPosts.length > 0) {
      for (const igPost of igPosts) {
        try {
          // Load platform account for access_token and ig_user_id
          const { data: acct } = await supabaseAdmin
            .from("platform_accounts")
            .select("id, access_token, ig_user_id")
            .eq("team_id", igPost.team_id)
            .eq("provider", "instagram")
            .maybeSingle();

          if (!acct?.access_token || !acct?.ig_user_id || !igPost.ig_container_id) {
            throw new Error("Missing Instagram account or container ID");
          }

          const result = await checkAndPublishInstagramContainer({
            containerId: igPost.ig_container_id,
            igUserId: acct.ig_user_id,
            accessToken: acct.access_token,
          });

          if (result.status === "posted") {
            await supabaseAdmin
              .from("scheduled_posts")
              .update({
                status: "posted",
                posted_at: new Date().toISOString(),
                platform_post_id: result.permalink || result.instagramMediaId,
                platform_media_id: result.instagramMediaId,
                last_error: null,
              })
              .eq("id", igPost.id);
            igProcessingResults.push({ id: igPost.id, ok: true, platformPostId: result.permalink || result.instagramMediaId });

            // Notify
            if (igPost.group_id) {
              await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
            } else {
              const info = await getNotificationInfo(igPost.user_id);
              if (info?.notifySuccess) {
                await sendPostSuccessEmail(info.email, igPost.title ?? "Untitled", ["instagram"]);
              }
            }
          } else if (result.status === "error") {
            await supabaseAdmin
              .from("scheduled_posts")
              .update({ status: "failed", last_error: result.error })
              .eq("id", igPost.id);
            igProcessingResults.push({ id: igPost.id, ok: false, error: result.error });

            // Notify
            if (igPost.group_id) {
              await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
            } else {
              const info = await getNotificationInfo(igPost.user_id);
              if (info?.notifyFailed) {
                await sendPostFailedEmail(info.email, igPost.title ?? "Untitled", "instagram", result.error || "Unknown error");
              }
            }
          } else {
            // Still processing — check timeout (10 min)
            const createdAt = igPost.ig_container_created_at ? new Date(igPost.ig_container_created_at).getTime() : 0;
            const tenMinAgo = Date.now() - 10 * 60 * 1000;
            if (createdAt < tenMinAgo) {
              await supabaseAdmin
                .from("scheduled_posts")
                .update({ status: "failed", last_error: "Instagram processing timed out" })
                .eq("id", igPost.id);
              igProcessingResults.push({ id: igPost.id, ok: false, error: "Instagram processing timed out" });

              // Notify
              if (igPost.group_id) {
                await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
              } else {
                const info = await getNotificationInfo(igPost.user_id);
                if (info?.notifyFailed) {
                  await sendPostFailedEmail(info.email, igPost.title ?? "Untitled", "instagram", "Instagram processing timed out");
                }
              }
            }
            // else: do nothing, next cron tick will retry
          }
        } catch (e: any) {
          await supabaseAdmin
            .from("scheduled_posts")
            .update({ status: "failed", last_error: e?.message || "Unknown error" })
            .eq("id", igPost.id);
          igProcessingResults.push({ id: igPost.id, ok: false, error: e?.message });

          // Notify
          if (igPost.group_id) {
            await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
          } else {
            const info = await getNotificationInfo(igPost.user_id);
            if (info?.notifyFailed) {
              await sendPostFailedEmail(info.email, igPost.title ?? "Untitled", "instagram", e?.message || "Unknown error");
            }
          }
        }
      }
    }
  }

  const statuses = retryFailed ? ["scheduled", "failed"] : ["scheduled"];

  // Pull due posts (or a single post)
  let query = supabaseAdmin
    .from("scheduled_posts")
    .select("id,user_id,team_id,upload_id,title,description,privacy_status,status,scheduled_for,provider,instagram_settings,youtube_settings,thumbnail_path,group_id")
    .in("status", statuses)
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_BATCH);

  if (postId) {
    query = supabaseAdmin
      .from("scheduled_posts")
      .select("id,user_id,team_id,upload_id,title,description,privacy_status,status,scheduled_for,provider,instagram_settings,youtube_settings,thumbnail_path,group_id")
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

      // Load platform account (team-based lookup)
      const { data: acct, error: acctErr } = await supabaseAdmin
        .from("platform_accounts")
        .select("id, refresh_token, access_token, expiry, platform_user_id, page_id, page_access_token, ig_user_id")
        .eq("team_id", post.team_id)
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
          expiresAt: acct.expiry,
          bucket,
          storagePath,
          title: post.title ?? "Clip Scheduler Upload",
          privacyLevel: ttSettings.privacy_level || "SELF_ONLY",
          allowComments: ttSettings.allow_comments ?? false,
          allowDuet: ttSettings.allow_duet ?? false,
          allowStitch: ttSettings.allow_stitch ?? false,
          brandOrganicToggle: ttSettings.brand_organic_toggle ?? false,
          brandContentToggle: ttSettings.brand_content_toggle ?? false,
        });
        platformPostId = tt.publishId;
      } else if (provider === "facebook") {
        if (!acct.page_id || !acct.page_access_token) {
          throw new Error("Facebook Page not configured. Please reconnect your Facebook account.");
        }

        const fbArgs: any = {
          userId: post.user_id,
          platformAccountId: acct.id,
          pageId: acct.page_id,
          pageAccessToken: acct.page_access_token,
          bucket,
          storagePath,
          title: post.title ?? "Clip Scheduler Upload",
          description: post.description ?? "",
        };

        if (post.thumbnail_path) {
          fbArgs.thumbnailBucket = bucket;
          fbArgs.thumbnailPath = post.thumbnail_path;
        }

        const fb = await uploadSupabaseVideoToFacebook(fbArgs);
        platformPostId = fb.facebookVideoId;
      } else if (provider === "instagram") {
        if (!acct.ig_user_id || !acct.access_token) {
          throw new Error("Instagram account not configured. Please reconnect your Instagram account.");
        }

        // Determine media type from instagram_settings
        const igSettings = post.instagram_settings as any;
        const igType = igSettings?.ig_type || "reel";
        const mediaType = igType === "story" ? "STORIES" as const : "REELS" as const;

        // Create container only — next cron tick will poll and publish
        const igContainerArgs: any = {
          igUserId: acct.ig_user_id,
          accessToken: acct.access_token,
          bucket,
          storagePath,
          caption: `${post.title ?? ""}\n\n${post.description ?? ""}`.trim(),
          mediaType,
        };

        if (post.thumbnail_path) {
          igContainerArgs.thumbnailBucket = bucket;
          igContainerArgs.thumbnailPath = post.thumbnail_path;
        }

        const { containerId } = await createInstagramContainer(igContainerArgs);

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "ig_processing",
            ig_container_id: containerId,
            ig_container_created_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", post.id);

        results.push({ id: post.id, ok: true, igProcessing: true, containerId });
        continue; // Skip the "mark posted" step below
      } else if (provider === "linkedin") {
        if (!acct.access_token || !acct.platform_user_id) {
          throw new Error("LinkedIn account not configured. Please reconnect your LinkedIn account.");
        }

        const liArgs: any = {
          userId: post.user_id,
          platformAccountId: acct.id,
          accessToken: acct.access_token,
          personUrn: `urn:li:person:${acct.platform_user_id}`,
          bucket,
          storagePath,
          title: post.title ?? "Clip Scheduler Upload",
          description: post.description ?? "",
        };

        if (post.thumbnail_path) {
          liArgs.thumbnailBucket = bucket;
          liArgs.thumbnailPath = post.thumbnail_path;
        }

        const li = await uploadSupabaseVideoToLinkedIn(liArgs);
        platformPostId = li.linkedinPostId;
      } else {
        // YouTube (default)
        const yts = (post.youtube_settings ?? {}) as any;
        const ytArgs: any = {
          userId: post.user_id,
          platformAccountId: acct.id,
          refreshToken: acct.refresh_token,
          bucket,
          storagePath,
          title: post.title ?? "Clip Scheduler Upload",
          description: post.description ?? "",
          privacyStatus: (["private", "unlisted", "public"].includes(post.privacy_status ?? "")
            ? post.privacy_status
            : "private") as any,
          categoryId: CATEGORY_IDS[yts.category] || undefined,
          madeForKids: yts.made_for_kids ?? false,
          embeddable: yts.allow_embedding ?? true,
          notifySubscribers: yts.notify_subscribers ?? true,
          publicStatsViewable: yts.public_stats_viewable ?? true,
        };

        if (post.thumbnail_path) {
          ytArgs.thumbnailBucket = bucket;
          ytArgs.thumbnailPath = post.thumbnail_path;
        }

        const yt = await uploadSupabaseVideoToYouTube(ytArgs);
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

      // Email notification (awaited to ensure delivery before response)
      if (post.group_id) {
        await checkAndNotifyGroup(post.group_id, post.user_id, post.title ?? "Untitled");
      } else {
        const info = await getNotificationInfo(post.user_id);
        if (info?.notifySuccess) {
          await sendPostSuccessEmail(info.email, post.title ?? "Untitled", [provider]);
        }
      }

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

      // Email notification (awaited to ensure delivery before response)
      const provider = post.provider || "youtube";
      if (post.group_id) {
        await checkAndNotifyGroup(post.group_id, post.user_id, post.title ?? "Untitled");
      } else {
        const isReconnectError = message.includes("not connected") || message.includes("reconnect") || message.includes("expired");
        const info = await getNotificationInfo(post.user_id);
        if (info) {
          if (isReconnectError && info.notifyReconnect) {
            await sendReconnectEmail(info.email, provider);
          } else if (info.notifyFailed) {
            await sendPostFailedEmail(info.email, post.title ?? "Untitled", provider, message);
          }
        }
      }

      const badResult: any = { id: post.id, ok: false, error: message };
      if (debugOut) badResult.debug = debugOut;

      results.push(badResult);
    }
  }

  const allResults = [...igProcessingResults, ...results];
  return NextResponse.json({ ok: true, processed: allResults.length, results: allResults });
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
