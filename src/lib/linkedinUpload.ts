import { supabaseAdmin } from "./supabaseAdmin";
import type { LinkedInVisibility } from "./postOptions";

type UploadToLinkedInArgs = {
  userId: string;
  platformAccountId: string;
  accessToken: string;
  personUrn: string; // "urn:li:person:{id}"

  bucket: string;
  storagePath: string;

  title: string;
  description?: string;

  thumbnailBucket?: string;
  thumbnailPath?: string;
  visibility?: LinkedInVisibility;
  /** From linkedinExtras: stop others from resharing, and the video's alt text. */
  isReshareDisabledByAuthor?: boolean;
  altText?: string;
};

function assertOk(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function getSignedDownloadUrl(params: {
  bucket: string;
  path: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { bucket, path, expiresInSeconds = 60 * 15 } = params;

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message || "unknown error"}`);
  }

  return data.signedUrl;
}

/**
 * Reads a stream in exact-size pieces, holding at most one piece (plus one network
 * chunk) in memory. LinkedIn takes videos in ~4 MB parts, so this keeps a large
 * upload's memory flat instead of loading the whole file.
 */
export class ByteReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private leftover: Uint8Array = new Uint8Array(0);

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  /** The next `n` bytes; throws if the stream ends first. */
  async read(n: number): Promise<Uint8Array<ArrayBuffer>> {
    const out = new Uint8Array(new ArrayBuffer(n));
    let filled = 0;
    while (filled < n) {
      if (this.leftover.byteLength === 0) {
        const { done, value } = await this.reader.read();
        if (done) throw new Error(`Video ended early: needed ${n} bytes, got ${filled}`);
        this.leftover = value;
        continue;
      }
      const take = Math.min(n - filled, this.leftover.byteLength);
      out.set(this.leftover.subarray(0, take), filled);
      this.leftover = this.leftover.subarray(take);
      filled += take;
    }
    return out;
  }

  cancel(): Promise<void> {
    return this.reader.cancel().catch(() => {});
  }
}

/**
 * Upload a video to LinkedIn using the Video API.
 *
 * Flow:
 * 1. Open a stream of the video from Supabase (only its size is needed up front)
 * 2. Initialize upload — register the video with LinkedIn (get upload URLs + video URN)
 * 3. Upload binary parts — PUT each chunk to LinkedIn's upload URLs (collect ETags)
 * 4. Finalize upload — link all parts together
 * 5. Create post — publish the video with text
 */
export async function uploadSupabaseVideoToLinkedIn(args: UploadToLinkedInArgs): Promise<{
  linkedinPostId: string;
}> {
  const {
    userId,
    platformAccountId,
    accessToken,
    personUrn,
    bucket,
    storagePath,
    title,
    description,
    thumbnailBucket,
    thumbnailPath,
    visibility = "PUBLIC",
    isReshareDisabledByAuthor = false,
    altText,
  } = args;

  assertOk(accessToken, "Missing accessToken");
  assertOk(personUrn, "Missing personUrn");
  assertOk(bucket, "Missing bucket");
  assertOk(storagePath, "Missing storagePath");
  assertOk(title, "Missing title");

  const apiHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": "202601",
    "X-Restli-Protocol-Version": "2.0.0",
  };

  // 1) Open the video from storage. Only its size is needed for init; the bytes are read
  // part by part in step 3. Loading a large video whole got worker runs killed for memory,
  // which leaves no error behind (see CLAUDE.md).
  const signedUrl = await getSignedDownloadUrl({ bucket, path: storagePath });
  const videoRes = await fetch(signedUrl);
  const sizeHeader = videoRes.headers.get("content-length");
  const fileSizeBytes = sizeHeader ? Number(sizeHeader) : NaN;

  if (!videoRes.ok || !videoRes.body || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    throw new Error(`Failed to fetch video from storage: ${videoRes.status}`);
  }
  const video = new ByteReader(videoRes.body);

  const hasThumbnail = !!(thumbnailBucket && thumbnailPath);

  // 2) Initialize video upload with actual file size
  const initRes = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: personUrn,
        fileSizeBytes,
        uploadCaptions: false,
        uploadThumbnail: hasThumbnail,
      },
    }),
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    await video.cancel();
    throw new Error(`LinkedIn video init failed: ${initRes.status} ${text}`);
  }

  const initData = await initRes.json();
  const uploadInstructions = initData.value?.uploadInstructions;
  const videoUrn = initData.value?.video;
  const uploadToken = initData.value?.uploadToken ?? "";

  if (!uploadInstructions?.length || !videoUrn) {
    await video.cancel();
    throw new Error(`LinkedIn video init missing uploadInstructions or video URN. Response: ${JSON.stringify(initData)}`);
  }

  // 3) Upload each part and collect ETags. The stream is read front to back, so the parts
  // must cover the file in order with no gaps; LinkedIn's instructions always do.
  const parts = [...uploadInstructions].sort((a: any, b: any) => a.firstByte - b.firstByte);
  let expectedFirst = 0;
  for (const part of parts) {
    if (part.firstByte !== expectedFirst || part.lastByte < part.firstByte) {
      await video.cancel();
      throw new Error(`LinkedIn upload instructions don't cover the file in order: ${JSON.stringify(uploadInstructions)}`);
    }
    expectedFirst = part.lastByte + 1;
  }
  if (expectedFirst !== fileSizeBytes) {
    await video.cancel();
    throw new Error(`LinkedIn upload instructions cover ${expectedFirst} bytes, but the video is ${fileSizeBytes}`);
  }

  const uploadedPartIds: string[] = [];

  try {
    for (const { uploadUrl, firstByte, lastByte } of parts) {
      const chunk = await video.read(lastByte - firstByte + 1);

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: chunk,
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => "");
        throw new Error(`LinkedIn video part upload failed: ${uploadRes.status} ${text}`);
      }

      // Collect ETag from response header
      const etag = uploadRes.headers.get("etag");
      if (etag) {
        // Strip quotes if present
        uploadedPartIds.push(etag.replace(/"/g, ""));
      }
    }
  } catch (e) {
    await video.cancel();
    throw e;
  }

  // 4) Finalize the upload
  const finalizeRes = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify({
      finalizeUploadRequest: {
        video: videoUrn,
        uploadToken,
        uploadedPartIds,
      },
    }),
  });

  if (!finalizeRes.ok) {
    const text = await finalizeRes.text();
    throw new Error(`LinkedIn video finalize failed: ${finalizeRes.status} ${text}`);
  }

  // 5) Upload thumbnail if provided
  if (hasThumbnail) {
    const thumbnailUploadUrl = initData.value?.thumbnailUploadUrl;
    if (thumbnailUploadUrl) {
      try {
        const thumbSignedUrl = await getSignedDownloadUrl({ bucket: thumbnailBucket!, path: thumbnailPath! });
        const thumbRes = await fetch(thumbSignedUrl);
        if (thumbRes.ok) {
          const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
          const thumbUploadRes = await fetch(thumbnailUploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "media-type-family": "STILLIMAGE",
            },
            body: thumbBuffer,
          });
          if (!thumbUploadRes.ok) {
            console.error("[LinkedIn] Thumbnail upload failed:", thumbUploadRes.status);
          }
        }
      } catch (e: any) {
        console.error("[LinkedIn] Thumbnail upload error (non-fatal):", e?.message);
      }
    }
  }

  // 6) Create a post with the video
  const postText = `${title}${description ? `\n\n${description}` : ""}`;

  const postRes = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify({
      author: personUrn,
      commentary: postText.slice(0, 3000),
      visibility,
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          title: title.slice(0, 200),
          id: videoUrn,
          ...(altText ? { altText } : {}),
        },
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor,
    }),
  });

  if (!postRes.ok) {
    const text = await postRes.text();
    throw new Error(`LinkedIn post creation failed: ${postRes.status} ${text}`);
  }

  // LinkedIn returns the post URN in the x-restli-id header
  const linkedinPostId =
    postRes.headers.get("x-restli-id") ||
    postRes.headers.get("x-linkedin-id") ||
    videoUrn;

  return { linkedinPostId };
}

// ── Text-only post ────────────────────────────────────────────────────────────

type PostTextToLinkedInArgs = {
  accessToken: string;
  personUrn: string; // "urn:li:person:{id}"
  text: string; // max 3000 chars
  visibility?: LinkedInVisibility;
  isReshareDisabledByAuthor?: boolean;
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
};

/**
 * Publish a text-only (or text + link card) post to LinkedIn.
 * No video or media upload required.
 */
export async function postTextToLinkedIn(args: PostTextToLinkedInArgs): Promise<{
  linkedinPostId: string;
}> {
  const { accessToken, personUrn, text, visibility = "PUBLIC", isReshareDisabledByAuthor = false, linkUrl, linkTitle, linkDescription } = args;

  assertOk(accessToken, "Missing accessToken");
  assertOk(personUrn, "Missing personUrn");

  const apiHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": "202601",
    "X-Restli-Protocol-Version": "2.0.0",
  };

  const body: any = {
    author: personUrn,
    commentary: text.slice(0, 3000),
    visibility,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor,
  };

  // Add article link card when a URL is provided
  if (linkUrl) {
    body.content = {
      article: {
        source: linkUrl,
        ...(linkTitle ? { title: linkTitle.slice(0, 400) } : {}),
        ...(linkDescription ? { description: linkDescription.slice(0, 400) } : {}),
      },
    };
  }

  const postRes = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify(body),
  });

  if (!postRes.ok) {
    const errText = await postRes.text();
    throw new Error(`LinkedIn text post failed: ${postRes.status} ${errText}`);
  }

  const linkedinPostId =
    postRes.headers.get("x-restli-id") ||
    postRes.headers.get("x-linkedin-id") ||
    "unknown";

  return { linkedinPostId };
}
