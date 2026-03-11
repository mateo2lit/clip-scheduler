import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "notifications@clipdash.org";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://clipdash.org").replace(/\/+$/, "");
const BRAND_NAME = "ClipDash";

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    youtube: "YouTube",
    tiktok: "TikTok",
    instagram: "Instagram",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    threads: "Threads",
    bluesky: "Bluesky",
    x: "X",
  };
  return labels[String(provider || "").toLowerCase()] || provider;
}

function appUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_URL}${cleanPath}`;
}

function escapeHtml(input: string) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(input: string, max = 280) {
  const value = String(input || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}

function humanList(values: string[]) {
  const items = values.filter(Boolean);
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

type EmailTheme = "success" | "warning" | "danger" | "neutral";

function themeColors(theme: EmailTheme) {
  switch (theme) {
    case "success":
      return { accent: "#34d399", badgeBg: "rgba(16,185,129,0.16)", badgeText: "#6ee7b7", badgeBorder: "rgba(16,185,129,0.35)" };
    case "warning":
      return { accent: "#fbbf24", badgeBg: "rgba(245,158,11,0.16)", badgeText: "#fcd34d", badgeBorder: "rgba(245,158,11,0.35)" };
    case "danger":
      return { accent: "#f87171", badgeBg: "rgba(248,113,113,0.16)", badgeText: "#fca5a5", badgeBorder: "rgba(248,113,113,0.35)" };
    default:
      return { accent: "#60a5fa", badgeBg: "rgba(96,165,250,0.16)", badgeText: "#93c5fd", badgeBorder: "rgba(96,165,250,0.35)" };
  }
}

type RenderEmailArgs = {
  preview: string;
  theme: EmailTheme;
  heading: string;
  bodyHtml: string;
  primaryCtaLabel?: string;
  primaryCtaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
  footerNote?: string;
};

function renderEmail(args: RenderEmailArgs) {
  const colors = themeColors(args.theme);
  const footerNote = args.footerNote || "You are receiving this because email notifications are enabled in your settings.";
  const pageBg = "#050505";
  const cardBg = "#0b0b10";
  const cardBorder = "rgba(255,255,255,0.12)";
  const titleColor = "#f8fafc";
  const textColor = "#cbd5e1";
  const mutedColor = "#94a3b8";
  const buttonBg = "#ffffff";
  const buttonText = "#050505";

  const html = `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:${pageBg};">
      <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(args.preview)}</span>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${pageBg};padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;">
              <tr>
                <td style="padding:0 0 14px 4px;color:${mutedColor};font-size:13px;font-weight:600;letter-spacing:.2px;">${BRAND_NAME}</td>
              </tr>
              <tr>
                <td style="background:
                  radial-gradient(460px circle at 10% -10%, rgba(59,130,246,0.14), rgba(59,130,246,0) 55%),
                  radial-gradient(420px circle at 90% -20%, rgba(168,85,247,0.14), rgba(168,85,247,0) 56%),
                  radial-gradient(340px circle at 50% 120%, rgba(236,72,153,0.10), rgba(236,72,153,0) 58%),
                  ${cardBg};
                  border:1px solid ${cardBorder};border-radius:14px;padding:26px;">
                  <div style="display:inline-block;background:${colors.badgeBg};border:1px solid ${colors.badgeBorder};color:${colors.badgeText};font-size:12px;font-weight:700;line-height:1;padding:8px 10px;border-radius:999px;">Notification</div>
                  <h1 style="margin:14px 0 10px 0;font-size:24px;line-height:1.25;color:${titleColor};">${escapeHtml(args.heading)}</h1>
                  <div style="color:${textColor};font-size:15px;line-height:1.65;">${args.bodyHtml}</div>

                  ${args.primaryCtaLabel && args.primaryCtaUrl ? `
                    <div style="margin-top:22px;">
                      <a href="${args.primaryCtaUrl}" style="display:inline-block;background:${buttonBg};color:${buttonText};text-decoration:none;font-size:14px;font-weight:700;padding:11px 18px;border-radius:999px;">${escapeHtml(args.primaryCtaLabel)}</a>
                    </div>
                  ` : ""}

                  ${args.secondaryCtaLabel && args.secondaryCtaUrl ? `
                    <div style="margin-top:12px;">
                      <a href="${args.secondaryCtaUrl}" style="display:inline-block;color:${mutedColor};text-decoration:none;font-size:13px;font-weight:600;">${escapeHtml(args.secondaryCtaLabel)}</a>
                    </div>
                  ` : ""}

                  <div style="margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);color:${mutedColor};font-size:12px;line-height:1.6;">
                    ${escapeHtml(footerNote)}<br/>
                    ${BRAND_NAME} - <a href="${appUrl("/settings")}" style="color:${textColor};text-decoration:underline;">Manage notification settings</a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  const text = [
    args.heading,
    "",
    args.preview,
    "",
    `Open ${BRAND_NAME}: ${args.primaryCtaUrl || appUrl("/dashboard")}`,
    args.secondaryCtaUrl ? `More: ${args.secondaryCtaUrl}` : "",
    "",
    `${BRAND_NAME} settings: ${appUrl("/settings")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}

async function sendEmail(to: string, subject: string, rendered: { html: string; text: string }) {
  if (!resend) return;
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html: rendered.html,
    text: rendered.text,
  });
}

export async function sendPostSuccessEmail(
  to: string,
  postTitle: string,
  platforms: string[]
) {
  if (!resend) return;

  const platformNames = platforms.map(providerLabel);
  const platformText = humanList(platformNames);
  const safeTitle = escapeHtml(postTitle || "Untitled");

  try {
    const rendered = renderEmail({
      preview: `Your post \"${truncate(postTitle || "Untitled", 70)}\" was published to ${platformText}.`,
      theme: "success",
      heading: "Your post is live",
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Great news. <strong>${safeTitle}</strong> was published to <strong>${escapeHtml(platformText)}</strong>.</p>
        <p style="margin:0;">ClipDash handled publishing automatically, so your schedule stayed on track without manual posting.</p>
      `,
      primaryCtaLabel: "View published posts",
      primaryCtaUrl: appUrl("/posted"),
      secondaryCtaLabel: "Create your next upload",
      secondaryCtaUrl: appUrl("/upload"),
      footerNote: "Tip: Keep a weekly queue loaded so you can publish consistently even on busy days.",
    });

    await sendEmail(to, "Your post is live", rendered);
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

  const platformName = providerLabel(platform);
  const safeTitle = escapeHtml(postTitle || "Untitled");
  const safeError = escapeHtml(truncate(error || "Unknown error", 600));

  try {
    const rendered = renderEmail({
      preview: `${platformName} could not publish \"${truncate(postTitle || "Untitled", 60)}\".`,
      theme: "danger",
      heading: "A post failed to publish",
      bodyHtml: `
        <p style="margin:0 0 12px 0;">We could not publish <strong>${safeTitle}</strong> to <strong>${escapeHtml(platformName)}</strong>.</p>
        <div style="margin:0 0 12px 0;padding:10px 12px;border:1px solid rgba(248,113,113,0.35);background:rgba(248,113,113,0.12);border-radius:10px;color:#fecaca;font-size:13px;line-height:1.55;">
          <strong>Reason:</strong> ${safeError}
        </div>
        <p style="margin:0;">Open Scheduled posts to retry or edit the post. If this keeps happening, reconnect the platform in Settings.</p>
      `,
      primaryCtaLabel: "Open scheduled posts",
      primaryCtaUrl: appUrl("/scheduled"),
      secondaryCtaLabel: "Reconnect accounts in Settings",
      secondaryCtaUrl: appUrl("/settings"),
      footerNote: "Reliable publishing depends on active platform authorization and policy-compliant video settings.",
    });

    await sendEmail(to, "Post upload failed", rendered);
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

  const failed = results.filter((r) => !r.ok);
  const succeeded = results.filter((r) => r.ok);
  const anyFailed = failed.length > 0;
  const subject = anyFailed
    ? "Post summary: some platforms failed"
    : "Post summary: all platforms succeeded";

  const rows = results
    .map((r) => {
      const statusColor = r.ok ? "#6ee7b7" : "#fca5a5";
      const statusBg = r.ok ? "rgba(16,185,129,0.16)" : "rgba(248,113,113,0.16)";
      const statusBorder = r.ok ? "rgba(16,185,129,0.35)" : "rgba(248,113,113,0.35)";
      const statusText = r.ok ? "Published" : "Failed";
      const details = r.ok ? "" : `<div style=\"margin-top:4px;color:#fecaca;font-size:12px;\">${escapeHtml(truncate(r.error || "Unknown error", 180))}</div>`;

      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:14px;color:#f8fafc;font-weight:600;">${escapeHtml(providerLabel(r.platform))}</div>
            <div style="display:inline-block;margin-top:6px;background:${statusBg};border:1px solid ${statusBorder};color:${statusColor};font-size:11px;font-weight:700;border-radius:999px;padding:6px 9px;">${statusText}</div>
            ${details}
          </td>
        </tr>`;
    })
    .join("");

  const safeTitle = escapeHtml(postTitle || "Untitled");

  try {
    const rendered = renderEmail({
      preview: anyFailed
        ? `${failed.length} platform(s) failed for \"${truncate(postTitle || "Untitled", 60)}\".`
        : `All ${succeeded.length} platforms succeeded for \"${truncate(postTitle || "Untitled", 60)}\".`,
      theme: anyFailed ? "warning" : "success",
      heading: anyFailed ? "Publishing finished with issues" : "Publishing finished successfully",
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Final results for <strong>${safeTitle}</strong>:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
        <p style="margin:12px 0 0 0;">${anyFailed
          ? `Published on ${succeeded.length} platform(s), failed on ${failed.length}.`
          : `Published on all ${succeeded.length} selected platform(s).`}</p>
      `,
      primaryCtaLabel: anyFailed ? "Fix failed platforms" : "View published posts",
      primaryCtaUrl: anyFailed ? appUrl("/scheduled") : appUrl("/posted"),
      secondaryCtaLabel: "Open dashboard",
      secondaryCtaUrl: appUrl("/dashboard"),
      footerNote: "Grouped summaries help your team quickly spot issues without digging through each post.",
    });

    await sendEmail(to, subject, rendered);
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

  const signupUrl = appUrl(`/login?invite=1&email=${encodeURIComponent(to)}`);
  const safeInviter = escapeHtml(inviterName || "A teammate");
  const safeTeam = escapeHtml(teamName || "your team");

  try {
    const rendered = renderEmail({
      preview: `${inviterName} invited you to join ${teamName} on ${BRAND_NAME}.`,
      theme: "neutral",
      heading: "You have been invited",
      bodyHtml: `
        <p style="margin:0 0 12px 0;"><strong>${safeInviter}</strong> invited you to join <strong>${safeTeam}</strong> on ${BRAND_NAME}.</p>
        <p style="margin:0;">Join the workspace to collaborate on scheduling, publishing, and notifications in one shared dashboard.</p>
      `,
      primaryCtaLabel: "Accept invitation",
      primaryCtaUrl: signupUrl,
      secondaryCtaLabel: "Learn more about ClipDash",
      secondaryCtaUrl: APP_URL,
      footerNote: "If this invite was not expected, you can safely ignore this email.",
    });

    await sendEmail(to, `${inviterName} invited you to join ${teamName} on ClipDash`, rendered);
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

  const safeInviter = escapeHtml(inviterName || "A teammate");
  const safeTeam = escapeHtml(teamName || "your team");

  try {
    const rendered = renderEmail({
      preview: `You were added to ${teamName} on ${BRAND_NAME}.`,
      theme: "success",
      heading: "You were added to a team",
      bodyHtml: `
        <p style="margin:0 0 12px 0;"><strong>${safeInviter}</strong> added you to <strong>${safeTeam}</strong>.</p>
        <p style="margin:0;">You can now collaborate on uploads, schedules, and account management based on your team role.</p>
      `,
      primaryCtaLabel: "Open dashboard",
      primaryCtaUrl: appUrl("/dashboard"),
      secondaryCtaLabel: "Review team settings",
      secondaryCtaUrl: appUrl("/settings?tab=team"),
      footerNote: "Use team roles to control who can connect accounts, schedule posts, and manage billing.",
    });

    await sendEmail(to, `${inviterName} added you to ${teamName} on ClipDash`, rendered);
  } catch (e) {
    console.error("Failed to send team joined email:", e);
  }
}

export async function sendSupportTicketUserEmail(
  to: string,
  subject: string,
  ticketId: string
) {
  if (!resend) return;

  const safeSubject = escapeHtml(subject || "your issue");

  try {
    const rendered = renderEmail({
      preview: `We received your support ticket about "${truncate(subject || "your issue", 70)}".`,
      theme: "neutral",
      heading: "Support ticket received",
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Thanks for reaching out. We received your ticket about <strong>${safeSubject}</strong>.</p>
        <p style="margin:0;">We'll get back to you soon.</p>
      `,
      primaryCtaLabel: "View your tickets",
      primaryCtaUrl: appUrl("/support?tab=tickets"),
      footerNote: "You are receiving this because you submitted a support ticket.",
    });

    await sendEmail(to, `Support ticket received — ${subject}`, rendered);
  } catch (e) {
    console.error("Failed to send support ticket user email:", e);
  }
}

export async function sendSupportTicketAdminEmail(
  ticketSubject: string,
  description: string,
  type: string,
  userEmail: string,
  ticketId: string
) {
  if (!process.env.SUPPORT_EMAIL) return;
  if (!resend) return;

  const typeLabels: Record<string, string> = {
    bug: "Bug Report",
    question: "Question",
    billing: "Billing",
    feature: "Feature Request",
  };
  const typeLabel = typeLabels[type] || type;
  const safeSubject = escapeHtml(ticketSubject || "(no subject)");
  const safeEmail = escapeHtml(userEmail || "");
  const safeDescription = escapeHtml(description || "").replace(/\n/g, "<br/>");
  const resolveUrl = appUrl(`/api/support/tickets/${ticketId}/resolve?secret=${process.env.SUPPORT_ADMIN_SECRET}`);
  const replyUrl = `mailto:${userEmail}?subject=${encodeURIComponent("Re: " + ticketSubject)}`;

  try {
    const rendered = renderEmail({
      preview: `New ${typeLabel} ticket from ${userEmail}: "${truncate(ticketSubject || "", 60)}"`,
      theme: "warning",
      heading: "New support ticket",
      bodyHtml: `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
          <tr><td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#94a3b8;font-size:13px;width:80px;">From</td><td style="padding:6px 0 6px 12px;border-bottom:1px solid rgba(255,255,255,0.08);color:#f8fafc;font-size:13px;">${safeEmail}</td></tr>
          <tr><td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#94a3b8;font-size:13px;">Type</td><td style="padding:6px 0 6px 12px;border-bottom:1px solid rgba(255,255,255,0.08);color:#f8fafc;font-size:13px;">${escapeHtml(typeLabel)}</td></tr>
          <tr><td style="padding:6px 0;color:#94a3b8;font-size:13px;">Subject</td><td style="padding:6px 0 6px 12px;color:#f8fafc;font-size:13px;">${safeSubject}</td></tr>
        </table>
        <div style="padding:10px 12px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);border-radius:8px;color:#cbd5e1;font-size:13px;line-height:1.6;white-space:pre-wrap;">${safeDescription}</div>
      `,
      primaryCtaLabel: "Resolve this ticket",
      primaryCtaUrl: resolveUrl,
      secondaryCtaLabel: `Reply via email to ${userEmail}`,
      secondaryCtaUrl: replyUrl,
      footerNote: "This notification was sent to the support inbox.",
    });

    await sendEmail(process.env.SUPPORT_EMAIL, `[Support] ${typeLabel} — ${ticketSubject}`, rendered);
  } catch (e) {
    console.error("Failed to send support ticket admin email:", e);
  }
}

export async function sendSupportTicketResolvedEmail(
  to: string,
  ticketSubject: string,
  replyMessage: string | null | undefined
) {
  if (!resend) return;

  const safeSubject = escapeHtml(ticketSubject || "your issue");
  const replyBlock = replyMessage
    ? `<div style="margin-top:12px;padding:10px 12px;border:1px solid rgba(52,211,153,0.3);background:rgba(16,185,129,0.08);border-radius:8px;color:#6ee7b7;font-size:13px;line-height:1.6;">${escapeHtml(replyMessage).replace(/\n/g, "<br/>")}</div>`
    : "";

  try {
    const rendered = renderEmail({
      preview: `Your ticket about "${truncate(ticketSubject || "your issue", 60)}" has been resolved.`,
      theme: "success",
      heading: "Your ticket has been resolved",
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Your ticket about <strong>${safeSubject}</strong> has been resolved.</p>
        ${replyBlock}
      `,
      primaryCtaLabel: "Open Support",
      primaryCtaUrl: appUrl("/support"),
      footerNote: "You are receiving this because your support ticket was resolved.",
    });

    await sendEmail(to, "Your support ticket has been resolved", rendered);
  } catch (e) {
    console.error("Failed to send support ticket resolved email:", e);
  }
}

export async function sendReconnectEmail(
  to: string,
  platform: string
) {
  if (!resend) return;

  const platformName = providerLabel(platform);

  try {
    const rendered = renderEmail({
      preview: `Reconnect ${platformName} to keep scheduled publishing running.`,
      theme: "warning",
      heading: "Reconnect required",
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Your <strong>${escapeHtml(platformName)}</strong> connection needs attention.</p>
        <p style="margin:0;">This usually happens when tokens expire or permissions are revoked. Reconnecting now prevents future posts from failing.</p>
      `,
      primaryCtaLabel: "Reconnect in Settings",
      primaryCtaUrl: appUrl("/settings"),
      secondaryCtaLabel: "View scheduled posts",
      secondaryCtaUrl: appUrl("/scheduled"),
      footerNote: "Pro tip: reconnecting proactively is the easiest way to protect your posting streak.",
    });

    await sendEmail(to, "Platform reconnection needed", rendered);
  } catch (e) {
    console.error("Failed to send reconnect email:", e);
  }
}
