import { supabaseAdmin } from "./supabaseAdmin";
import { getTikTokAccessToken } from "./tiktok";

type UploadToTikTokArgs = {
  userId: string;
  platformAccountId: string;
  refreshToken: string;
  accessToken?: string | null;
  expiresAt?: string | null;

  bucket: string;
  storagePath: string;

  title: string;
  privacyLevel?: string;
  allowComments?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  brandOrganicToggle?: boolean;
  brandContentToggle?: boolean;
};

function assertOk(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://clipdash.org").replace(/\/+$/, "");

export async function uploadSupabaseVideoToTikTok(args: UploadToTikTokArgs): Promise<{
  publishId: string;
}> {
  const {
    userId,
    platformAccountId,
    refreshToken,
    accessToken: existingAccessToken,
    expiresAt: existingExpiresAt,
    bucket,
    storagePath,
    title,
    privacyLevel = "PUBLIC_TO_EVERYONE",
    allowComments = false,
    allowDuet = false,
    allowStitch = false,
    brandOrganicToggle = false,
    brandContentToggle = false,
  } = args;

  assertOk(refreshToken, "Missing refreshToken");
  assertOk(bucket, "Missing bucket");
  assertOk(storagePath, "Missing storagePath");
  assertOk(title, "Missing title");
  assertOk(process.env.TIKTOK_PROXY_SECRET, "Missing TIKTOK_PROXY_SECRET env var");

  // 1) Get fresh access token
  const tokens = await getTikTokAccessToken({
    refreshToken,
    accessToken: existingAccessToken,
    expiresAt: existingExpiresAt,
  });

  // Persist refreshed tokens
  await supabaseAdmin
    .from("platform_accounts")
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry: tokens.expiresAt.toISOString(),
    })
    .eq("id", platformAccountId)
    .eq("user_id", userId);

  // 2) Build proxy URL — TikTok fetches from clipdash.org (verified domain).
  //    The proxy streams the file from Supabase without buffering it in memory.
  const proxyUrl = `${APP_URL}/api/tiktok-video-proxy?path=${encodeURIComponent(storagePath)}&bucket=${encodeURIComponent(bucket)}&token=${encodeURIComponent(process.env.TIKTOK_PROXY_SECRET)}`;

  // 3) Initialize TikTok PULL_FROM_URL publish
  const initRes = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: title.slice(0, 2200),
          privacy_level: privacyLevel,
          disable_comment: !allowComments,
          disable_duet: !allowDuet,
          disable_stitch: !allowStitch,
          brand_organic_toggle: brandOrganicToggle,
          brand_content_toggle: brandContentToggle,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: proxyUrl,
        },
      }),
    }
  );

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`TikTok upload init failed: ${initRes.status} ${text}`);
  }

  const initData = await initRes.json();

  if (initData.error?.code && initData.error.code !== "ok") {
    throw new Error(`TikTok upload init error: ${initData.error.code} - ${initData.error.message}`);
  }

  const publishId = initData.data?.publish_id;

  if (!publishId) {
    throw new Error("TikTok upload init did not return publish_id");
  }

  // 4) Poll /v2/post/publish/status/fetch/ until TikTok finishes fetching and processing.
  //    Large files can take several minutes — poll for up to 10 minutes.
  const maxPolls = 120;
  const pollInterval = 5000;

  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollInterval);

    const statusRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      }
    );

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    const status = statusData.data?.status;

    if (status === "PUBLISH_COMPLETE") {
      return { publishId };
    }

    if (status === "FAILED") {
      const failReason = statusData.data?.fail_reason || "Unknown reason";
      throw new Error(`TikTok publish failed: ${failReason}`);
    }

    // PROCESSING_UPLOAD or PROCESSING_DOWNLOAD — keep polling
  }

  // Exhausted polls — TikTok may still be processing in the background
  return { publishId };
}
