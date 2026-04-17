import { supabaseAdmin } from "./supabaseAdmin";

type SnapchatPostType = "spotlight" | "stories";

type SnapchatUploadArgs = {
  accessToken: string;
  snapchatUserId: string;
  bucket: string;
  storagePath: string;
  caption: string;
  postType: SnapchatPostType;
};

async function getSignedUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 15 * 60);
  if (error || !data?.signedUrl) throw new Error(`Failed to create signed URL: ${error?.message}`);
  return data.signedUrl;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function uploadToSnapchat(args: SnapchatUploadArgs): Promise<{ platform_post_id: string }> {
  const { accessToken, snapchatUserId, bucket, storagePath, caption, postType } = args;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const videoUrl = await getSignedUrl(bucket, storagePath);
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  // 1. Upload media
  const uploadInitRes = await fetch(`https://adsapi.snapchat.com/v1/adaccounts/${snapchatUserId}/media`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      media: [{
        name: `clip-dash-upload-${Date.now()}`,
        type: "VIDEO",
        ad_account_id: snapchatUserId,
      }],
    }),
  });

  if (!uploadInitRes.ok) {
    const text = await uploadInitRes.text();
    throw new Error(`Snapchat media create failed: ${uploadInitRes.status} ${text}`);
  }

  const initData = await uploadInitRes.json();
  const mediaId = initData.media?.[0]?.media?.id;
  if (!mediaId) throw new Error("Snapchat media create returned no ID");

  // 2. Upload video bytes
  const uploadRes = await fetch(
    `https://adsapi.snapchat.com/v1/media/${mediaId}/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "video/mp4",
      },
      body: videoBuffer,
    }
  );

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Snapchat media upload failed: ${uploadRes.status} ${text}`);
  }

  // 3. Poll for processing
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    const statusRes = await fetch(`https://adsapi.snapchat.com/v1/media/${mediaId}`, { headers });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const status = statusData.media?.[0]?.media?.status;
    if (status === "READY") break;
    if (status === "FAILED") throw new Error("Snapchat media processing failed");
  }

  // 4. Create snap (Spotlight or Stories)
  const creativeType = postType === "spotlight" ? "SPOTLIGHT" : "STORY";

  const snapRes = await fetch(`https://adsapi.snapchat.com/v1/adaccounts/${snapchatUserId}/creatives`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      creatives: [{
        name: `clip-dash-${Date.now()}`,
        ad_account_id: snapchatUserId,
        type: creativeType,
        top_snap_media_id: mediaId,
        headline: caption.slice(0, 34),
      }],
    }),
  });

  if (!snapRes.ok) {
    const text = await snapRes.text();
    throw new Error(`Snapchat creative create failed: ${snapRes.status} ${text}`);
  }

  const snapData = await snapRes.json();
  const creativeId = snapData.creatives?.[0]?.creative?.id ?? mediaId;
  return { platform_post_id: creativeId };
}
