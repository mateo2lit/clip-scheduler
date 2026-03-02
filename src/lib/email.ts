import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "notifications@clipdash.org";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clipdash.org";

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    youtube: "YouTube",
    tiktok: "TikTok",
    instagram: "Instagram",
    facebook: "Facebook",
    linkedin: "LinkedIn",
  };
  return labels[provider.toLowerCase()] || provider;
}

export async function sendPostSuccessEmail(
  to: string,
  postTitle: string,
  platforms: string[]
) {
  if (!resend) return;

  const platformNames = platforms.map(providerLabel).join(", ");

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Your post is live!",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #10b981; margin: 0 0 16px;">Your post is live!</h2>
          <p style="color: #333; line-height: 1.6; margin: 0 0 16px;">
            Your post <strong>"${postTitle}"</strong> was successfully uploaded to <strong>${platformNames}</strong>.
          </p>
          <a href="${APP_URL}/posted" style="display: inline-block; background: #111; color: #fff; padding: 10px 24px; border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 500;">
            View on ClipDash
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">
            Sent from ClipDash
          </p>
        </div>
      `,
    });
  } catch (e) {
    console.error("Failed to send success email:", e);
  }
}

export async function sendPostFailedEmail(
  to: string,
  postTitle: string,
  platform: string,
  error: string
) {
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Post upload failed",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #ef4444; margin: 0 0 16px;">Post upload failed</h2>
          <p style="color: #333; line-height: 1.6; margin: 0 0 8px;">
            Your post <strong>"${postTitle}"</strong> failed to upload to <strong>${providerLabel(platform)}</strong>.
          </p>
          <p style="color: #666; line-height: 1.6; margin: 0 0 16px; font-size: 14px;">
            Error: ${error}
          </p>
          <a href="${APP_URL}/scheduled" style="display: inline-block; background: #111; color: #fff; padding: 10px 24px; border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 500;">
            Go to ClipDash to retry
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">
            Sent from ClipDash
          </p>
        </div>
      `,
    });
  } catch (e) {
    console.error("Failed to send failure email:", e);
  }
}

export async function sendGroupSummaryEmail(
  to: string,
  postTitle: string,
  results: Array<{ platform: string; ok: boolean; error?: string }>
) {
  if (!resend) return;

  const anyFailed = results.some((r) => !r.ok);
  const subject = anyFailed
    ? "Post failed on some platforms"
    : "Post summary: all platforms succeeded";

  const rows = results
    .map((r) => {
      const icon = r.ok
        ? '<span style="color:#10b981;">&#10004;</span>'
        : '<span style="color:#ef4444;">&#10008;</span>';
      const errorText = r.ok ? "" : ` — ${r.error || "Unknown error"}`;
      return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${icon} <strong>${providerLabel(r.platform)}</strong>${errorText}</td></tr>`;
    })
    .join("");

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: ${anyFailed ? "#ef4444" : "#10b981"}; margin: 0 0 16px;">${subject}</h2>
          <p style="color: #333; line-height: 1.6; margin: 0 0 16px;">
            Results for <strong>"${postTitle}"</strong>:
          </p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${rows}</table>
          <a href="${APP_URL}/${anyFailed ? "scheduled" : "posted"}" style="display: inline-block; background: #111; color: #fff; padding: 10px 24px; border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 500;">
            View on ClipDash
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">
            Sent from ClipDash
          </p>
        </div>
      `,
    });
  } catch (e) {
    console.error("Failed to send group summary email:", e);
  }
}

export async function sendTeamInviteEmail(
  to: string,
  inviterName: string,
  teamName: string
) {
  if (!resend) return;

  const signupUrl = `${APP_URL}/login?invite=1&email=${encodeURIComponent(to)}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `${inviterName} invited you to join ${teamName} on ClipDash`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #111; margin: 0 0 16px;">You've been invited to ClipDash</h2>
          <p style="color: #333; line-height: 1.6; margin: 0 0 16px;">
            <strong>${inviterName}</strong> has invited you to join their team <strong>${teamName}</strong> on ClipDash — a tool for scheduling and publishing videos across YouTube, TikTok, Instagram, Facebook, and LinkedIn.
          </p>
          <p style="color: #333; line-height: 1.6; margin: 0 0 24px;">
            Create your free account to accept the invitation. You'll be added to the team automatically when you sign up with this email address.
          </p>
          <a href="${signupUrl}" style="display: inline-block; background: #111; color: #fff; padding: 12px 28px; border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 500;">
            Accept Invitation
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">
            If you weren't expecting this invitation, you can ignore this email.<br/>Sent from ClipDash
          </p>
        </div>
      `,
    });
  } catch (e) {
    console.error("Failed to send team invite email:", e);
  }
}

export async function sendTeamJoinedEmail(
  to: string,
  inviterName: string,
  teamName: string
) {
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `${inviterName} added you to ${teamName} on ClipDash`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #10b981; margin: 0 0 16px;">You've been added to a team</h2>
          <p style="color: #333; line-height: 1.6; margin: 0 0 16px;">
            <strong>${inviterName}</strong> has added you to the team <strong>${teamName}</strong> on ClipDash.
          </p>
          <p style="color: #333; line-height: 1.6; margin: 0 0 24px;">
            Log in to start collaborating.
          </p>
          <a href="${APP_URL}/dashboard" style="display: inline-block; background: #111; color: #fff; padding: 12px 28px; border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 500;">
            Go to ClipDash
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">
            Sent from ClipDash
          </p>
        </div>
      `,
    });
  } catch (e) {
    console.error("Failed to send team joined email:", e);
  }
}

export async function sendReconnectEmail(
  to: string,
  platform: string
) {
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Platform reconnection needed",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #f59e0b; margin: 0 0 16px;">Platform reconnection needed</h2>
          <p style="color: #333; line-height: 1.6; margin: 0 0 16px;">
            Your <strong>${providerLabel(platform)}</strong> account needs to be reconnected. This may happen when your authorization expires.
          </p>
          <a href="${APP_URL}/settings" style="display: inline-block; background: #111; color: #fff; padding: 10px 24px; border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 500;">
            Go to ClipDash Settings to reconnect
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">
            Sent from ClipDash
          </p>
        </div>
      `,
    });
  } catch (e) {
    console.error("Failed to send reconnect email:", e);
  }
}
