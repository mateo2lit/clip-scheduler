import { comingSoonNotice } from "@/lib/platformAvailability";

/**
 * Amber "Coming soon" pill for a platform that cannot publish yet.
 * Renders nothing when the platform is live, so call sites need no conditional.
 */
export function ComingSoonBadge({
  provider,
  className = "",
}: {
  provider: string;
  className?: string;
}) {
  const notice = comingSoonNotice(provider);
  if (!notice) return null;

  return (
    <span
      title={notice.short}
      className={`inline-flex shrink-0 items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 ${className}`}
    >
      {notice.badge}
    </span>
  );
}

/**
 * Fuller inline explanation, for settings and the platform detail page.
 * Renders nothing when the platform is live.
 */
export function ComingSoonNote({
  provider,
  variant = "long",
  className = "",
}: {
  provider: string;
  variant?: "short" | "long";
  className?: string;
}) {
  const notice = comingSoonNotice(provider);
  if (!notice) return null;

  return (
    <div
      className={`rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3.5 py-2.5 text-xs leading-relaxed text-amber-200/85 ${className}`}
    >
      {variant === "short" ? notice.short : notice.long}
    </div>
  );
}
