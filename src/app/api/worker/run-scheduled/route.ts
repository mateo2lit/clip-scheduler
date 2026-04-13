import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube, CATEGORY_IDS } from "@/lib/youtubeUpload";
import { uploadSupabaseVideoToTikTok, checkTikTokPublishStatus } from "@/lib/tiktokUpload";
import { getTikTokAccessToken } from "@/lib/tiktok";
import { uploadSupabaseVideoToFacebook, postTextToFacebook } from "@/lib/facebookUpload";
import { createInstagramContainer, checkAndPublishInstagramContainer } from "@/lib/instagramUpload";
import { uploadSupabaseVideoToLinkedIn, postTextToLinkedIn } from "@/lib/linkedinUpload";
import { createThreadsContainer, checkAndPublishThreadsContainer, createThreadsTextContainer } from "@/lib/threadsUpload";
import { uploadToBluesky, postTextToBluesky } from "@/lib/blueskyUpload";
import { uploadVideoToX, postTextToX } from "@/lib/xUpload";
import { sendPostSuccessEmail, sendPostFailedEmail, sendReconnectEmail, sendGroupSummaryEmail } from "@/lib/email";
import { isThreadsEnabledForUserId } from "@/lib/platformAccess";
import { getYouTubeOAuthClient, getYouTubeApi } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BATCH = 5;

function requireWorkerAuth(req: Request) {
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret) throw new Error("WORKER_SECRET is not configured");

  const token = new URL(req.url).searchParams.get("token");
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const provided = bearer || token || "";

  // Accept WORKER_SECRET (manual/external calls) or CRON_SECRET (Vercel cron auto-injection)
  const cronSecret = process.env.CRON_SECRET;
  const valid = provided === workerSecret || (cronSecret && provided === cronSecret);
  if (!valid) throw new Error("Unauthorized worker request");
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

async function tryDeleteUploadFile(bucket: string, storagePath: string) {
  try {
    await supabaseAdmin.storage.from(bucket).remove([storagePath]);
  } catch {
    // Non-fatal — storage cleanup failure shouldn't break the worker
  }
}

async function checkAndMaybeDeleteFile(
  groupId: string | null | undefined,
  bucket: string,
  storagePath: string,
  uploadId?: string | null
) {
  try {
    if (groupId) {
      const { data: groupPosts } = await supabaseAdmin
        .from("scheduled_posts")
        .select("status")
        .eq("group_id", groupId);
      if (!groupPosts || groupPosts.length === 0) return;
      const allPosted = groupPosts.every((p: any) => p.status === "posted");
      if (!allPosted) return;
    }
    await tryDeleteUploadFile(bucket, storagePath);
    if (uploadId) {
      await supabaseAdmin
        .from("uploads")
        .update({ storage_deleted: true })
        .eq("id", uploadId);
    }
  } catch {
    // Non-fatal
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

  // ── Process ig_processing posts first (YouTube Shorts + Instagram + Threads + TikTok) ─
  const igProcessingResults: any[] = [];
  {
    const { data: igPosts, error: igErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, user_id, team_id, upload_id, provider, ig_container_id, ig_container_created_at, instagram_settings, youtube_settings, group_id, title, platform_account_id")
      .eq("status", "ig_processing")
      .in("provider", ["instagram", "threads", "tiktok", "youtube"])
      .limit(5);

    if (!igErr && igPosts && igPosts.length > 0) {
      for (const igPost of igPosts) {
        try {
          const isTikTok = igPost.provider === "tiktok";
          const isThreads = igPost.provider === "threads";
          if (isThreads && !isThreadsEnabledForUserId(igPost.user_id)) {
            throw new Error("Threads is not available for this account.");
          }

          if (!igPost.ig_container_id) {
            throw new Error("Missing publish/container ID");
          }

          // ── YouTube Shorts processing check ─────────────────────────
          if (igPost.provider === "youtube") {
            const { data: ytAcct } = await supabaseAdmin
              .from("platform_accounts")
              .select("id, refresh_token")
              .eq("id", igPost.platform_account_id)
              .maybeSingle();

            if (!ytAcct?.refresh_token) {
              throw new Error("YouTube account not found or missing refresh token. Please reconnect.");
            }

            const auth = await getYouTubeOAuthClient({ refreshToken: ytAcct.refresh_token });
            const youtube = getYouTubeApi(auth);

            const videoResp = await youtube.videos.list({
              part: ["status", "processingDetails"],
              id: [igPost.ig_container_id],
            });

            const video = videoResp.data.items?.[0];

            if (!video) {
              // Video not found — likely deleted or rejected by YouTube
              throw new Error("YouTube video not found after upload. It may have been rejected.");
            }

            const processingStatus = video.processingDetails?.processingStatus;
            const privacyStatus = video.status?.privacyStatus;

            if (processingStatus === "succeeded") {
              await supabaseAdmin.from("scheduled_posts").update({
                status: "posted",
                posted_at: new Date().toISOString(),
                platform_post_id: igPost.ig_container_id,
                last_error: null,
              }).eq("id", igPost.id);
              igProcessingResults.push({ id: igPost.id, ok: true, privacyStatus });

              if (igPost.group_id) {
                await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
              } else {
                const info = await getNotificationInfo(igPost.user_id);
                if (info?.notifySuccess) await sendPostSuccessEmail(info.email, igPost.title ?? "Untitled", ["youtube"]);
              }

              if (igPost.upload_id) {
                const { data: ytUpload } = await supabaseAdmin.from("uploads").select("bucket, file_path, storage_path, path, object_path").eq("id", igPost.upload_id).maybeSingle();
                if (ytUpload) {
                  const ytProbed = pickFirstNonEmpty(ytUpload, ["file_path", "storage_path", "path", "object_path"]);
                  if (ytProbed.value) await checkAndMaybeDeleteFile(igPost.group_id, ytUpload.bucket?.trim() || DEFAULT_BUCKET, ytProbed.value, igPost.upload_id);
                }
              }
            } else if (processingStatus === "failed") {
              const errMsg = `YouTube processing failed: ${video.processingDetails?.processingFailureReason ?? "unknown reason"}`;
              await supabaseAdmin.from("scheduled_posts").update({ status: "failed", last_error: errMsg }).eq("id", igPost.id);
              igProcessingResults.push({ id: igPost.id, ok: false, error: errMsg });

              if (igPost.group_id) {
                await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
              } else {
                const info = await getNotificationInfo(igPost.user_id);
                if (info?.notifyFailed) await sendPostFailedEmail(info.email, igPost.title ?? "Untitled", "youtube", errMsg);
              }
            } else {
              // Still processing — check 15-minute timeout
              const createdAt = igPost.ig_container_created_at ? new Date(igPost.ig_container_created_at).getTime() : 0;
              if (createdAt < Date.now() - 15 * 60 * 1000) {
                const timeoutMsg = "YouTube Short processing timed out — please check YouTube Studio";
                await supabaseAdmin.from("scheduled_posts").update({ status: "failed", last_error: timeoutMsg }).eq("id", igPost.id);
                igProcessingResults.push({ id: igPost.id, ok: false, error: timeoutMsg });

                if (igPost.group_id) {
                  await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
                } else {
                  const info = await getNotificationInfo(igPost.user_id);
                  if (info?.notifyFailed) await sendPostFailedEmail(info.email, igPost.title ?? "Untitled", "youtube", timeoutMsg);
                }
              }
              // else: still within window, next cron tick will check again
            }
            continue;
          }

          // ── TikTok async publish check ──────────────────────────────
          if (isTikTok) {
            const { data: ttAcct } = await supabaseAdmin
              .from("platform_accounts")
              .select("id, access_token, refresh_token, expiry")
              .eq("id", igPost.platform_account_id)
              .maybeSingle();

            if (!ttAcct?.refresh_token) {
              throw new Error("TikTok account not found or missing refresh token. Please reconnect.");
            }

            const tokens = await getTikTokAccessToken({
              refreshToken: ttAcct.refresh_token,
              accessToken: ttAcct.access_token,
              expiresAt: ttAcct.expiry,
            });
            await supabaseAdmin
              .from("platform_accounts")
              .update({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken, expiry: tokens.expiresAt.toISOString() })
              .eq("id", ttAcct.id);

            const ttResult = await checkTikTokPublishStatus(igPost.ig_container_id, tokens.accessToken);

            if (ttResult.status === "posted") {
              await supabaseAdmin.from("scheduled_posts").update({
                status: "posted", posted_at: new Date().toISOString(),
                platform_post_id: igPost.ig_container_id, last_error: null,
              }).eq("id", igPost.id);
              igProcessingResults.push({ id: igPost.id, ok: true });
              if (igPost.group_id) {
                await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
              } else {
                const info = await getNotificationInfo(igPost.user_id);
                if (info?.notifySuccess) await sendPostSuccessEmail(info.email, igPost.title ?? "Untitled", ["tiktok"]);
              }
              if (igPost.upload_id) {
                const { data: ttUpload } = await supabaseAdmin.from("uploads").select("bucket, file_path, storage_path, path, object_path").eq("id", igPost.upload_id).maybeSingle();
                if (ttUpload) {
                  const ttProbed = pickFirstNonEmpty(ttUpload, ["file_path", "storage_path", "path", "object_path"]);
                  if (ttProbed.value) await checkAndMaybeDeleteFile(igPost.group_id, ttUpload.bucket?.trim() || DEFAULT_BUCKET, ttProbed.value, igPost.upload_id);
                }
              }
            } else if (ttResult.status === "failed") {
              const errMsg = `TikTok publish failed: ${ttResult.failReason}`;
              await supabaseAdmin.from("scheduled_posts").update({ status: "failed", last_error: errMsg }).eq("id", igPost.id);
              igProcessingResults.push({ id: igPost.id, ok: false, error: errMsg });
              if (igPost.group_id) {
                await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
              } else {
                const info = await getNotificationInfo(igPost.user_id);
                if (info?.notifyFailed) await sendPostFailedEmail(info.email, igPost.title ?? "Untitled", "tiktok", errMsg);
              }
            } else {
              // Still processing — check timeout (15 min)
              const createdAt = igPost.ig_container_created_at ? new Date(igPost.ig_container_created_at).getTime() : 0;
              if (createdAt < Date.now() - 15 * 60 * 1000) {
                const timeoutMsg = "TikTok processing timed out — please retry";
                await supabaseAdmin.from("scheduled_posts").update({ status: "failed", last_error: timeoutMsg }).eq("id", igPost.id);
                igProcessingResults.push({ id: igPost.id, ok: false, error: timeoutMsg });
                if (igPost.group_id) {
                  await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
                } else {
                  const info = await getNotificationInfo(igPost.user_id);
                  if (info?.notifyFailed) await sendPostFailedEmail(info.email, igPost.title ?? "Untitled", "tiktok", timeoutMsg);
                }
              }
              // else: still within window, next tick will check again
            }
            continue;
          }

          // Load platform account — prefer platform_account_id, fall back to team+provider
          const igAcctQ = supabaseAdmin
            .from("platform_accounts")
            .select("id, access_token, ig_user_id");
          const { data: acct } = igPost.platform_account_id
            ? await igAcctQ.eq("id", igPost.platform_account_id).maybeSingle()
            : await igAcctQ.eq("team_id", igPost.team_id).eq("provider", isThreads ? "threads" : "instagram").maybeSingle();

          if (!acct?.access_token || !acct?.ig_user_id) {
            throw new Error(`Missing ${isThreads ? "Threads" : "Instagram"} account or container ID`);
          }

          // Check + publish via provider-specific function
          let result: { status: "processing" | "posted" | "error"; mediaId?: string; error?: string };

          if (isThreads) {
            const r = await checkAndPublishThreadsContainer({
              containerId: igPost.ig_container_id,
              threadsUserId: acct.ig_user_id,
              accessToken: acct.access_token,
            });
            result = { status: r.status, mediaId: r.threadsMediaId, error: r.error };
          } else {
            const r = await checkAndPublishInstagramContainer({
              containerId: igPost.ig_container_id,
              igUserId: acct.ig_user_id,
              accessToken: acct.access_token,
            });
            result = { status: r.status, mediaId: r.instagramMediaId || r.permalink, error: r.error };
          }

          if (result.status === "posted") {
            await supabaseAdmin
              .from("scheduled_posts")
              .update({
                status: "posted",
                posted_at: new Date().toISOString(),
                platform_post_id: result.mediaId || null,
                platform_media_id: result.mediaId || null,
                last_error: null,
              })
              .eq("id", igPost.id);
            igProcessingResults.push({ id: igPost.id, ok: true, platformPostId: result.mediaId });

            // Notify
            if (igPost.group_id) {
              await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
            } else {
              const info = await getNotificationInfo(igPost.user_id);
              if (info?.notifySuccess) {
                await sendPostSuccessEmail(info.email, igPost.title ?? "Untitled", [igPost.provider || "instagram"]);
              }
            }

            // Delete source file if all group posts are now posted (or solo post)
            if (igPost.upload_id) {
              const { data: igUpload } = await supabaseAdmin
                .from("uploads")
                .select("bucket, file_path, storage_path, path, object_path")
                .eq("id", igPost.upload_id)
                .maybeSingle();
              if (igUpload) {
                const igProbed = pickFirstNonEmpty(igUpload, ["file_path", "storage_path", "path", "object_path"]);
                if (igProbed.value) {
                  const igBucket = igUpload.bucket?.trim() || DEFAULT_BUCKET;
                  await checkAndMaybeDeleteFile(igPost.group_id, igBucket, igProbed.value, igPost.upload_id);
                }
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
                await sendPostFailedEmail(info.email, igPost.title ?? "Untitled", igPost.provider || "instagram", result.error || "Unknown error");
              }
            }
          } else {
            // Still processing — check timeout (10 min)
            const createdAt = igPost.ig_container_created_at ? new Date(igPost.ig_container_created_at).getTime() : 0;
            const tenMinAgo = Date.now() - 10 * 60 * 1000;
            if (createdAt < tenMinAgo) {
              const timeoutMsg = `${igPost.provider === "threads" ? "Threads" : "Instagram"} processing timed out`;
              await supabaseAdmin
                .from("scheduled_posts")
                .update({ status: "failed", last_error: timeoutMsg })
                .eq("id", igPost.id);
              igProcessingResults.push({ id: igPost.id, ok: false, error: timeoutMsg });

              // Notify
              if (igPost.group_id) {
                await checkAndNotifyGroup(igPost.group_id, igPost.user_id, igPost.title ?? "Untitled");
              } else {
                const info = await getNotificationInfo(igPost.user_id);
                if (info?.notifyFailed) {
                  await sendPostFailedEmail(info.email, igPost.title ?? "Untitled", igPost.provider || "instagram", timeoutMsg);
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
              await sendPostFailedEmail(info.email, igPost.title ?? "Untitled", igPost.provider || "instagram", e?.message || "Unknown error");
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
    .select("id,user_id,team_id,upload_id,post_type,text_post_content,title,description,privacy_status,status,scheduled_for,provider,instagram_settings,youtube_settings,facebook_settings,linkedin_settings,bluesky_settings,threads_settings,x_settings,thumbnail_path,group_id,platform_account_id")
    .in("status", statuses)
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_BATCH);

  if (postId) {
    query = supabaseAdmin
      .from("scheduled_posts")
      .select("id,user_id,team_id,upload_id,post_type,text_post_content,title,description,privacy_status,status,scheduled_for,provider,instagram_settings,youtube_settings,facebook_settings,linkedin_settings,bluesky_settings,threads_settings,x_settings,thumbnail_path,group_id,platform_account_id")
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
        .update({ status: "posting", last_error: null, ig_container_created_at: new Date().toISOString() })
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

      const isTextPost = (post as any).post_type === "text";
      const textContent = (post as any).text_post_content as any;

      let bucket: string = DEFAULT_BUCKET;
      let storagePath: string = "";

      if (!isTextPost) {
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

        bucket =
          typeof uploadBase.bucket === "string" && uploadBase.bucket.trim()
            ? uploadBase.bucket.trim()
            : DEFAULT_BUCKET;

        storagePath = probed.value;
      } else {
        // Text posts need content body
        if (!textContent?.body) {
          throw new Error("Text post is missing content body");
        }
        if (debugOut) debugOut.isTextPost = true;
      }

      const provider = post.provider || "youtube";

      // Load platform account — prefer platform_account_id, fall back to team+provider for legacy posts
      const acctQ = supabaseAdmin
        .from("platform_accounts")
        .select("id, refresh_token, access_token, expiry, platform_user_id, page_id, page_access_token, ig_user_id");
      const { data: acct, error: acctErr } = post.platform_account_id
        ? await acctQ.eq("id", post.platform_account_id).maybeSingle()
        : await acctQ.eq("team_id", post.team_id).eq("provider", provider).maybeSingle();

      if (acctErr) {
        throw new Error(`Failed to load ${provider} account: ${acctErr.message}`);
      }

      // Text posts on Threads/Bluesky use access_token; others need refresh_token
      const needsRefreshToken = !isTextPost || !["threads", "bluesky"].includes(provider);
      if (needsRefreshToken && !acct?.refresh_token) {
        throw new Error(
          `${provider} not connected for scheduled_posts.user_id=${post.user_id}`
        );
      }
      if (!acct) {
        throw new Error(`${provider} account not found for user_id=${post.user_id}`);
      }

      let platformPostId: string | null = null;

      // ── Text post execution ──────────────────────────────────────────────────
      if (isTextPost) {
        const TEXT_POST_PLATFORMS = ["linkedin", "facebook", "threads", "bluesky", "x"];
        if (!TEXT_POST_PLATFORMS.includes(provider)) {
          throw new Error(`${provider} does not support text-only posts`);
        }

        const hashtags = (textContent.hashtags || []) as string[];
        const baseText = textContent.body as string;
        const fullText = hashtags.length > 0
          ? `${baseText}\n\n${hashtags.map((t: string) => `#${t}`).join(" ")}`
          : baseText;

        if (provider === "linkedin") {
          if (!acct.access_token || !acct.platform_user_id) {
            throw new Error("LinkedIn account not configured. Please reconnect your LinkedIn account.");
          }
          const liSettings = (post.linkedin_settings ?? {}) as any;
          const li = await postTextToLinkedIn({
            accessToken: acct.access_token,
            personUrn: `urn:li:person:${acct.platform_user_id}`,
            text: fullText.slice(0, 3000),
            visibility: liSettings.visibility || "PUBLIC",
            linkUrl: textContent.link_url,
            linkTitle: textContent.link_title,
            linkDescription: textContent.link_description,
          });
          platformPostId = li.linkedinPostId;

        } else if (provider === "facebook") {
          if (!acct.page_id || !acct.page_access_token) {
            throw new Error("Facebook Page not configured. Please reconnect your Facebook account.");
          }
          const fb = await postTextToFacebook({
            pageId: acct.page_id,
            pageAccessToken: acct.page_access_token,
            message: fullText.slice(0, 63206),
            linkUrl: textContent.link_url,
          });
          platformPostId = fb.facebookPostId;

        } else if (provider === "threads") {
          if (!isThreadsEnabledForUserId(post.user_id)) {
            throw new Error("Threads is not available for this account.");
          }
          if (!acct.access_token || !acct.ig_user_id) {
            throw new Error("Threads account not configured. Please reconnect your Threads account.");
          }
          // TEXT containers are ready immediately — create and publish in one tick
          const { containerId } = await createThreadsTextContainer({
            threadsUserId: acct.ig_user_id,
            accessToken: acct.access_token,
            text: fullText.slice(0, 500),
            linkAttachmentUrl: textContent.link_url,
          });
          const publishResult = await checkAndPublishThreadsContainer({
            containerId,
            threadsUserId: acct.ig_user_id,
            accessToken: acct.access_token,
          });
          if (publishResult.status === "error") {
            throw new Error(publishResult.error || "Threads text publish failed");
          }
          if (publishResult.status === "processing") {
            // Unexpected — fall back to async polling path
            await supabaseAdmin.from("scheduled_posts").update({
              status: "ig_processing",
              ig_container_id: containerId,
              ig_container_created_at: new Date().toISOString(),
              last_error: null,
            }).eq("id", post.id);
            results.push({ id: post.id, ok: true, igProcessing: true, containerId });
            continue;
          }
          platformPostId = publishResult.threadsMediaId || null;

        } else if (provider === "bluesky") {
          if (!acct.access_token || !acct.platform_user_id) {
            throw new Error("Bluesky account not configured. Please reconnect your Bluesky account.");
          }
          const bskyResult = await postTextToBluesky({
            did: acct.platform_user_id,
            accessJwt: acct.access_token,
            refreshJwt: acct.refresh_token || acct.access_token,
            text: fullText,
            linkCard: textContent.link_url
              ? {
                  uri: textContent.link_url,
                  title: textContent.link_title || "",
                  description: textContent.link_description || "",
                  thumbUrl: textContent.link_image || undefined,
                }
              : undefined,
          });
          // Persist refreshed tokens
          if (
            bskyResult.accessJwt !== acct.access_token ||
            bskyResult.refreshJwt !== (acct.refresh_token || acct.access_token)
          ) {
            await supabaseAdmin.from("platform_accounts").update({
              access_token: bskyResult.accessJwt,
              refresh_token: bskyResult.refreshJwt,
              updated_at: new Date().toISOString(),
            }).eq("id", acct.id);
          }
          platformPostId = bskyResult.uri;

        } else if (provider === "x") {
          if (!acct.access_token || !acct.refresh_token) {
            throw new Error("X account not configured. Please reconnect your X account.");
          }
          const xSettings = ((post as any).x_settings ?? {}) as any;
          const xResult = await postTextToX({
            userId: post.user_id,
            platformAccountId: acct.id,
            refreshToken: acct.refresh_token,
            accessToken: acct.access_token,
            expiresAt: acct.expiry || null,
            text: fullText.slice(0, 280),
            replySettings: xSettings.reply_settings || "everyone",
          });
          platformPostId = xResult.tweetId;
        }

        // Mark posted and notify — shared path below handles this
        // (fall through to the "Mark posted" block)

      } else if (provider === "tiktok") {
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
        // TikTok processes asynchronously — store publish_id and poll on next worker ticks
        await supabaseAdmin.from("scheduled_posts").update({
          status: "ig_processing",
          ig_container_id: tt.publishId,
          ig_container_created_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", post.id);
        results.push({ id: post.id, ok: true, status: "ig_processing", publishId: tt.publishId });
        continue;
      } else if (provider === "facebook") {
        if (!acct.page_id || !acct.page_access_token) {
          throw new Error("Facebook Page not configured. Please reconnect your Facebook account.");
        }

        const fbSettings = (post.facebook_settings ?? {}) as any;
        const fbArgs: any = {
          userId: post.user_id,
          platformAccountId: acct.id,
          pageId: acct.page_id,
          pageAccessToken: acct.page_access_token,
          bucket,
          storagePath,
          title: fbSettings.title_override || post.title || "Clip Scheduler Upload",
          description: fbSettings.description_override ?? post.description ?? "",
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
      } else if (provider === "threads") {
        if (!isThreadsEnabledForUserId(post.user_id)) {
          throw new Error("Threads is not available for this account.");
        }

        if (!acct.access_token || !acct.ig_user_id) {
          throw new Error("Threads account not configured. Please reconnect your Threads account.");
        }

        const { containerId } = await createThreadsContainer({
          threadsUserId: acct.ig_user_id,
          accessToken: acct.access_token,
          bucket,
          storagePath,
          caption: `${post.title ?? ""}\n\n${post.description ?? ""}`.trim(),
        });

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
        continue; // Skip mark-posted step
      } else if (provider === "bluesky") {
        if (!acct.access_token || !acct.platform_user_id) {
          throw new Error("Bluesky account not configured. Please reconnect your Bluesky account.");
        }

        const bskySettings = (post.bluesky_settings ?? {}) as any;
        const bskyCaption = bskySettings.description_override || `${post.title ?? ""}\n\n${post.description ?? ""}`.trim();
        const bskyResult = await uploadToBluesky({
          did: acct.platform_user_id,
          handle: acct.platform_user_id,
          accessJwt: acct.access_token,
          refreshJwt: acct.refresh_token || acct.access_token,
          bucket,
          storagePath,
          caption: bskyCaption,
        });

        if (
          bskyResult.accessJwt !== acct.access_token ||
          bskyResult.refreshJwt !== (acct.refresh_token || acct.access_token)
        ) {
          await supabaseAdmin
            .from("platform_accounts")
            .update({
              access_token: bskyResult.accessJwt,
              refresh_token: bskyResult.refreshJwt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", acct.id);
        }

        platformPostId = bskyResult.uri;
      } else if (provider === "linkedin") {
        if (!acct.access_token || !acct.platform_user_id) {
          throw new Error("LinkedIn account not configured. Please reconnect your LinkedIn account.");
        }

        const liSettings = (post.linkedin_settings ?? {}) as any;
        const liArgs: any = {
          userId: post.user_id,
          platformAccountId: acct.id,
          accessToken: acct.access_token,
          personUrn: `urn:li:person:${acct.platform_user_id}`,
          bucket,
          storagePath,
          title: liSettings.title_override || post.title || "Clip Scheduler Upload",
          description: liSettings.description_override ?? post.description ?? "",
          visibility: liSettings.visibility || "PUBLIC",
        };

        if (post.thumbnail_path) {
          liArgs.thumbnailBucket = bucket;
          liArgs.thumbnailPath = post.thumbnail_path;
        }

        const li = await uploadSupabaseVideoToLinkedIn(liArgs);
        platformPostId = li.linkedinPostId;
      } else if (provider === "x") {
        if (!acct.access_token || !acct.refresh_token) {
          throw new Error("X account not configured. Please reconnect your X account.");
        }

        const xSettings = ((post as any).x_settings ?? {}) as any;
        const rawText = xSettings.description_override
          || `${post.title ?? ""}\n\n${post.description ?? ""}`.trim();
        const tweetText = rawText.slice(0, 280);

        const xResult = await uploadVideoToX({
          userId: post.user_id,
          platformAccountId: acct.id,
          accessToken: acct.access_token,
          refreshToken: acct.refresh_token,
          expiresAt: acct.expiry,
          bucket,
          storagePath,
          tweetText,
          replySettings: xSettings.reply_settings || "everyone",
        });

        platformPostId = xResult.tweetId;
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

        if (yts.is_short) {
          // Shorts go through YouTube's async processing pipeline — poll until live
          await supabaseAdmin.from("scheduled_posts").update({
            status: "ig_processing",
            ig_container_id: yt.youtubeVideoId,
            ig_container_created_at: new Date().toISOString(),
            last_error: null,
          }).eq("id", post.id);
          results.push({ id: post.id, ok: true, status: "yt_processing", youtubeVideoId: yt.youtubeVideoId });
          continue;
        }

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

      // Delete source file if all group posts are now posted (or solo post) — video posts only
      if (!isTextPost && storagePath) {
        await checkAndMaybeDeleteFile(post.group_id, bucket, storagePath, post.upload_id);
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
