import { supabaseAdmin } from "./supabaseAdmin";

type PinterestUploadArgs = {
  accessToken: string;
  bucket: string;
  storagePath: string;
  title: string;
  description?: string;
  boardId: string;
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

export async function uploadToPinterest(args: PinterestUploadArgs): Promise<{ platform_post_id: string }> {
  const { accessToken, bucket, storagePath, title, description, boardId } = args;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // 1. Register media upload
  const registerRes = await fetch("https://api.pinterest.com/v5/media", {
    method: "POST",
    headers,
    body: JSON.stringify({ media_type: "video" }),
  });

  if (!registerRes.ok) {
    const text = await registerRes.text();
    throw new Error(`Pinterest media register failed: ${registerRes.status} ${text}`);
  }

  const { media_id, upload_url, upload_parameters } = await registerRes.json();

  // 2. Upload video to the signed URL (multipart form if parameters provided, else PUT)
  const videoUrl = await getSignedUrl(bucket, storagePath);
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok || !videoRes.body) throw new Error(`Failed to fetch video from storage: ${videoRes.status}`);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  if (upload_parameters && Object.keys(upload_parameters).length > 0) {
    // Multipart form upload (S3-style)
    const form = new FormData();
    for (const [k, v] of Object.entries(upload_parameters)) {
      form.append(k, v as string);
    }
    form.append("file", new Blob([videoBuffer], { type: "video/mp4" }), "video.mp4");
    const uploadRes = await fetch(upload_url, { method: "POST", body: form });
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`Pinterest video upload failed: ${uploadRes.status} ${text}`);
    }
  } else {
    const uploadRes = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: videoBuffer,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`Pinterest video upload failed: ${uploadRes.status} ${text}`);
    }
  }

  // 3. Poll until media processing is complete
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const statusRes = await fetch(`https://api.pinterest.com/v5/media/${media_id}`, { headers });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    if (statusData.status === "succeeded") break;
    if (statusData.status === "failed") throw new Error("Pinterest video processing failed");
  }

  // 4. Create pin
  const pinRes = await fetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers,
    body: JSON.stringify({
      board_id: boardId,
      title: title.slice(0, 100),
      description: (description ?? "").slice(0, 500),
      media_source: {
        source_type: "video_id",
        media_id,
      },
    }),
  });

  if (!pinRes.ok) {
    const text = await pinRes.text();
    throw new Error(`Pinterest pin creation failed: ${pinRes.status} ${text}`);
  }

  const pin = await pinRes.json();
  return { platform_post_id: pin.id as string };
}
