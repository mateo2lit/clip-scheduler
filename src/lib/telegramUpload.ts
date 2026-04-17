import { supabaseAdmin } from "./supabaseAdmin";

type TelegramUploadArgs = {
  botToken: string;
  channelId: string;
  bucket: string;
  storagePath: string;
  caption: string;
};

export async function uploadToTelegram(args: TelegramUploadArgs): Promise<{ platform_post_id: string }> {
  const { botToken, channelId, bucket, storagePath, caption } = args;

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(storagePath, 15 * 60);

  if (error || !data?.signedUrl) throw new Error(`Failed to create signed URL: ${error?.message}`);

  const body = {
    chat_id: channelId,
    video: data.signedUrl,
    caption: caption.slice(0, 1024),
    supports_streaming: true,
  };

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram sendVideo failed: ${res.status} ${text}`);
  }

  const data2 = await res.json();
  if (!data2.ok) throw new Error(`Telegram error: ${data2.description || "Unknown error"}`);

  return { platform_post_id: String(data2.result.message_id) };
}
