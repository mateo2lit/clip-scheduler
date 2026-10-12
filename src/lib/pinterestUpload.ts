import { supabaseAdmin } from "./supabaseAdmin";
import { PINTEREST_DESCRIPTION_MAX, type pinterestExtras } from "./postOptions";

type PinterestUploadArgs = {
  accessToken: string;
  bucket: string;
  storagePath: string;
  title: string;
  description?: string;
  boardId: string;
  /** Optional Pin fields from pinterestExtras (link, alt text, board section, AI label, cover frame). */
  extras?: ReturnType<typeof pinterestExtras>;
  /** The post's custom thumbnail, used as the video's cover image. Wins over a cover frame. */
  coverImageUrl?: string;
};

async function getSignedUrl(bucket: string, path: string, expiresInSeconds = 15 * 60): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(`Failed to create signed URL: ${error?.message}`);
  return data.signedUrl;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** A request body that sends `head`, then every chunk of `middle`, then `tail`, without buffering. */
function concatStream(head: Uint8Array, middle: ReadableStream<Uint8Array>, tail: Uint8Array): ReadableStream<Uint8Array> {
  const reader = middle.getReader();
  let stage: "head" | "middle" | "tail" | "done" = "head";
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (stage === "head") {
        stage = "middle";
        controller.enqueue(head);
        return;
      }
      if (stage === "middle") {
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(value);
          return;
        }
        stage = "tail";
      }
      if (stage === "tail") {
        stage = "done";
        controller.enqueue(tail);
        controller.close();
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/**
 * Builds a multipart/form-data upload (S3-style POST policy: the policy fields first,
 * the file last) whose file part streams from `file`. S3 rejects chunked uploads, so
 * the exact Content-Length is computed from the parts and the file's size.
 */
export function streamingMultipart(
  fields: Record<string, string>,
  file: ReadableStream<Uint8Array>,
  fileSize: number,
  boundary = `----ClipDash${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`
): { body: ReadableStream<Uint8Array>; contentType: string; contentLength: number } {
  const enc = new TextEncoder();
  let headText = "";
  for (const [k, v] of Object.entries(fields)) {
    headText += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  }
  headText += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`;
  const head = enc.encode(headText);
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  return {
    body: concatStream(head, file, tail),
    contentType: `multipart/form-data; boundary=${boundary}`,
    contentLength: head.byteLength + fileSize + tail.byteLength,
  };
}

export async function uploadToPinterest(args: PinterestUploadArgs): Promise<{ platform_post_id: string }> {
  const { accessToken, bucket, storagePath, title, description, boardId, extras = {}, coverImageUrl } = args;

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

  // 2. Stream the video from storage to Pinterest's upload URL. Pinterest takes videos up to
  // 2 GB; reading one into memory first got worker runs killed (see CLAUDE.md), so it is
  // never buffered.
  const videoUrl = await getSignedUrl(bucket, storagePath);
  const videoRes = await fetch(videoUrl);
  const sizeHeader = videoRes.headers.get("content-length");
  const fileSize = sizeHeader ? Number(sizeHeader) : NaN;
  if (!videoRes.ok || !videoRes.body || !Number.isFinite(fileSize)) {
    throw new Error(`Failed to fetch video from storage: ${videoRes.status}`);
  }

  let uploadRes: Response;
  if (upload_parameters && Object.keys(upload_parameters).length > 0) {
    // Multipart form upload (S3-style)
    const form = streamingMultipart(upload_parameters as Record<string, string>, videoRes.body, fileSize);
    uploadRes = await fetch(upload_url, {
      method: "POST",
      headers: { "Content-Type": form.contentType, "Content-Length": String(form.contentLength) },
      body: form.body,
      // Required by Node's fetch for a streamed request body
      duplex: "half",
    } as RequestInit);
  } else {
    uploadRes = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(fileSize) },
      body: videoRes.body,
      duplex: "half",
    } as RequestInit);
  }
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Pinterest video upload failed: ${uploadRes.status} ${text}`);
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
  const { cover_image_key_frame_time, ...pinFields } = extras;
  const pinRes = await fetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers,
    body: JSON.stringify({
      board_id: boardId,
      title: title.slice(0, 100),
      description: (description ?? "").slice(0, PINTEREST_DESCRIPTION_MAX),
      ...pinFields,
      media_source: {
        source_type: "video_id",
        media_id,
        // A custom thumbnail wins; otherwise a chosen frame; otherwise Pinterest picks one.
        ...(coverImageUrl
          ? { cover_image_url: coverImageUrl }
          : cover_image_key_frame_time !== undefined
          ? { cover_image_key_frame_time }
          : {}),
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

/** Signed URL for the post's thumbnail, long enough for Pinterest to fetch it. */
export async function pinterestCoverUrl(bucket: string, thumbnailPath: string): Promise<string | undefined> {
  try {
    return await getSignedUrl(bucket, thumbnailPath, 60 * 60);
  } catch {
    return undefined; // a missing cover just lets Pinterest pick a frame
  }
}
