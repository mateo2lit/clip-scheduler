"use client";

import { useEffect, useMemo, useState } from "react";

type PlatformAccount = {
  id: string;
  provider: string; // "youtube" | "tiktok" | ...
  created_at?: string;
};

type ProviderId =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "x"
  | "facebook"
  | "linkedin";

type ProviderConfig = {
  id: ProviderId;
  name: string;
  description: string;
  statusTag?: "Recommended" | "Popular";
  availableNow: boolean; // if OAuth + integration exists
  icon: (props: { className?: string }) => JSX.Element;
};

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "green" | "gray" | "yellow";
  children: React.ReactNode;
}) {
  const cls =
    tone === "green"
      ? "bg-green-500/10 text-green-600 border-green-500/20"
      : tone === "yellow"
      ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
      : "bg-muted text-muted-foreground border-border";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "secondary";
}) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition border";
  const styles =
    variant === "default"
      ? "bg-foreground text-background border-foreground hover:opacity-90"
      : "bg-background text-foreground border-border hover:bg-muted";
  const dis = disabled ? "opacity-50 cursor-not-allowed" : "";
  return (
    <button className={`${base} ${styles} ${dis}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-background p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// Simple icons (no deps)
function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} aria-hidden="true">
      <path
        d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12s0 3.6.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-2.2.5-5.8.5-5.8s0-3.6-.5-5.8ZM9.6 15.3V8.7l6.3 3.3-6.3 3.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.7 3c.4 2.7 2 4.3 4.6 4.6v3.1c-1.7.1-3.2-.4-4.6-1.3v6.7c0 3.6-2.9 6.5-6.5 6.5S3.7 19.7 3.7 16.1 6.6 9.6 10.2 9.6c.4 0 .8 0 1.2.1v3.4c-.4-.1-.8-.2-1.2-.2-1.7 0-3.2 1.4-3.2 3.2s1.4 3.2 3.2 3.2 3.2-1.4 3.2-3.2V3h3.3Z"
      />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm10 2H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3Zm-5 4.3A5.7 5.7 0 1 1 6.3 14 5.7 5.7 0 0 1 12 8.3Zm0 2A3.7 3.7 0 1 0 15.7 14 3.7 3.7 0 0 0 12 10.3ZM18 6.8a1 1 0 1 1-1 1 1 1 0 0 1 1-1Z"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.9 2H22l-6.8 7.8L23.3 22h-6.7l-5.2-6.7L5.6 22H2.5l7.3-8.4L1 2h6.9l4.7 6 6.3-6ZM17 19.2h1.8L7 4.7H5.1L17 19.2Z"
      />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.6 1.7-1.6h1.6V4.8c-.8-.1-1.8-.2-2.9-.2-2.8 0-4.7 1.7-4.7 4.9V11H6.7v3h2.5v8h4.3Z"
      />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.9 6.8A2.3 2.3 0 1 1 7 2.2a2.3 2.3 0 0 1-.1 4.6ZM5 21.8V9h3.8v12.8H5Zm6.5 0V9h3.6v1.8h.1c.5-1 1.8-2.1 3.7-2.1 4 0 4.7 2.6 4.7 6.1v7h-3.8v-6.2c0-1.5 0-3.4-2.1-3.4s-2.4 1.6-2.4 3.3v6.3h-3.8Z"
      />
    </svg>
  );
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "youtube",
    name: "YouTube",
    description: "Upload videos to your channel and schedule posts automatically.",
    statusTag: "Recommended",
    availableNow: true,
    icon: YouTubeIcon,
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Post shorts and schedule TikTok uploads.",
    statusTag: "Popular",
    availableNow: false,
    icon: TikTokIcon,
  },
  {
    id: "instagram",
    name: "Instagram Reels",
    description: "Schedule Reels uploads to your Instagram account.",
    availableNow: false,
    icon: InstagramIcon,
  },
  {
    id: "x",
    name: "X (Twitter)",
    description: "Schedule clips to post as videos on X.",
    availableNow: false,
    icon: XIcon,
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Post clips to Facebook pages and profiles.",
    availableNow: false,
    icon: FacebookIcon,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Post clips to your LinkedIn profile or company page.",
    availableNow: false,
    icon: LinkedInIcon,
  },
];

export default function ConnectedAccountsCard() {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/platform-accounts", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || "Failed to load platform accounts");

      setAccounts(Array.isArray(json?.accounts) ? json.accounts : []);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const connectedProviderSet = useMemo(() => {
    return new Set(accounts.map((a) => a.provider));
  }, [accounts]);

  const connected = useMemo(() => {
    return PROVIDERS.filter((p) => connectedProviderSet.has(p.id));
  }, [connectedProviderSet]);

  const availableToConnect = useMemo(() => {
    return PROVIDERS.filter((p) => !connectedProviderSet.has(p.id));
  }, [connectedProviderSet]);

  const onConnect = async (provider: ProviderId) => {
    if (provider === "youtube") {
      // your existing OAuth start route
      window.location.href = "/api/auth/youtube/start";
      return;
    }

    // Future providers
    alert(`${provider} connection is not available yet.`);
  };

  return (
    <Card
      title="Connected accounts"
      subtitle="Connect your accounts once — then uploads and schedules run automatically."
      right={
        <Button variant="secondary" onClick={load} disabled={loading}>
          Refresh
        </Button>
      }
    >
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading accounts…</div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Connected */}
      <div className="mt-2">
        <div className="mb-2 flex items-center gap-2">
          <div className="text-sm font-semibold">Connected</div>
          <Badge>{connected.length}</Badge>
        </div>

        {connected.length === 0 ? (
          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            No accounts connected yet. Connect YouTube to start uploading.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {connected.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-4 rounded-2xl border bg-background p-4"
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5 rounded-xl border bg-muted/30 p-2">
                      <Icon className="h-5 w-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{p.name}</div>
                        <Pill tone="green">Connected</Pill>
                        {p.statusTag ? <Badge>{p.statusTag}</Badge> : null}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{p.description}</div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Button variant="secondary" onClick={() => onConnect(p.id)}>
                      Manage
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      Manage on Settings for now
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available */}
      <div className="mt-6">
        <div className="mb-2 flex items-center gap-2">
          <div className="text-sm font-semibold">Available</div>
          <Badge>{availableToConnect.length}</Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {availableToConnect.map((p) => {
            const Icon = p.icon;
            const disabled = !p.availableNow;
            return (
              <div
                key={p.id}
                className={`flex items-start justify-between gap-4 rounded-2xl border bg-background p-4 ${
                  disabled ? "opacity-70" : ""
                }`}
              >
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-xl border bg-muted/30 p-2">
                    <Icon className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{p.name}</div>
                      {p.statusTag ? <Badge>{p.statusTag}</Badge> : null}
                      {disabled ? <Pill tone="gray">Coming soon</Pill> : <Pill tone="yellow">New</Pill>}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{p.description}</div>
                  </div>
                </div>

                <div>
                  <Button
                    onClick={() => onConnect(p.id)}
                    disabled={disabled}
                    variant={disabled ? "secondary" : "default"}
                  >
                    {disabled ? "Coming soon" : "Connect"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
