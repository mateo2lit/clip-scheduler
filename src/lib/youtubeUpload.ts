import { Readable } from "node:stream";
import { getYouTubeApi, getYouTubeOAuthClient, readOAuthTokens } from "./youtube";
import { supabaseAdmin } from "./supabaseAdmin";

type UploadToYouTubeArgs = {
  userId: string;
  platformAccountId: string;
  refreshToken: string;

  bucket: string;
  storagePath: string;

  title: string;
  description?: string;
  privacyStatus: "private" | "unlisted" | "public";

  thumbnailBucket?: string;
  thumbnailPath?: string;
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

  // Supabase signed URLs: createSignedUrl(bucket, path, expiresInSeconds). :contentReference[oaicite:2]{index=2}
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message || "unknown error"}`);
  }

  return data.signedUrl;
}

/**
 * Converts fetch() Response.body (web ReadableStream) to Node Readable stream.
 */
function toNodeReadable(webStream: ReadableStream<Uint8Array>): Readable {
  // Node 18+ supports Readable.fromWeb
  // @ts-expect-error - types can be finicky depending on TS lib versions
  return Readable.fromWeb(webStream);
}

export async function uploadSupabaseVideoToYouTube(args: UploadToYouTubeArgs): Promise<{
  youtubeVideoId: string;
}> {
  const {
    userId,
    platformAccountId,
    refreshToken,
    bucket,
    storagePath,
    title,
    description,
    privacyStatus,
    thumbnailBucket,
    thumbnailPath,
  } = args;

  assertOk(refreshToken, "Missing refreshToken");
  assertOk(bucket, "Missing bucket");
  assertOk(storagePath, "Missing storagePath");
  assertOk(title, "Missing title");

  // 1) Get OAuth client authenticated for this user (via refresh token)
  const auth = await getYouTubeOAuthClient({ refreshToken });

  // 2) Optional: persist refreshed access token + expiry
  const { accessToken, expiresAt } = readOAuthTokens(auth);
  if (accessToken || expiresAt) {
    await supabaseAdmin
      .from("platform_accounts")
      .update({
        access_token: accessToken ?? null,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      })
      .eq("id", platformAccountId)
      .eq("user_id", userId);
  }

  // 3) Create a signed URL to stream the video file from Supabase Storage
  const signedUrl = await getSignedDownloadUrl({ bucket, path: storagePath });

  // 4) Stream download -> stream upload (avoid buffering whole file in memory)
  const res = await fetch(signedUrl);
  if (!res.ok || !res.body) {
    throw new Error(
      `Failed to fetch video from signed URL. status=${res.status} ${res.statusText}`
    );
  }

  const nodeStream = toNodeReadable(res.body);

  // 5) Upload to YouTube via Data API videos.insert
  // Upload method supports media upload. :contentReference[oaicite:3]{index=3}
  const youtube = getYouTubeApi(auth);

  const uploadResp = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description: description ?? "",
      },
      status: {
        privacyStatus,
      },
    },
    media: {
      body: nodeStream,
    },
  });

  const youtubeVideoId = uploadResp.data.id;
  if (!youtubeVideoId) {
    throw new Error("YouTube upload succeeded but no video ID was returned.");
  }

  // Set custom thumbnail if provided
  if (thumbnailPath) {
    try {
      const thumbBucket = thumbnailBucket || bucket;
      const thumbSignedUrl = await getSignedDownloadUrl({ bucket: thumbBucket, path: thumbnailPath });
      const thumbRes = await fetch(thumbSignedUrl);

      if (thumbRes.ok && thumbRes.body) {
        const thumbStream = toNodeReadable(thumbRes.body);

        await youtube.thumbnails.set({
          videoId: youtubeVideoId,
          media: {
            body: thumbStream,
          },
        });
      }
    } catch (thumbErr: any) {
      // Thumbnail set can fail if the channel isn't verified — don't fail the whole upload
      console.error(`[YouTube] Failed to set thumbnail for ${youtubeVideoId}:`, thumbErr?.message);
    }
  }

  return { youtubeVideoId };
}
