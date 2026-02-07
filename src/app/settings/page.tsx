"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/login/supabaseClient";
import Link from "next/link";

type ProviderKey = "youtube" | "tiktok" | "instagram" | "facebook" | "x";

type PlatformConfig = {
  key: ProviderKey;
  name: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
};

async function safeReadJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("application/json")) {
    try {
      return { ok: true, json: JSON.parse(text), raw: text };
    } catch {
      return { ok: false, json: null, raw: text };
    }
  }
  return { ok: false, json: null, raw: text };
}

const PLATFORMS: PlatformConfig[] = [
  {
    key: "youtube",
    name: "YouTube",
    description: "Upload videos and Shorts to your channel",
    available: true,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
  },
  {
    key: "tiktok",
    name: "TikTok",
    description: "Post videos to your TikTok account",
    available: true,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
      </svg>
    ),
  },
  {
    key: "instagram",
    name: "Instagram",
    description: "Share Reels and video posts",
    available: false,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  {
    key: "x",
    name: "X (Twitter)",
    description: "Post video clips to X",
    available: false,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    key: "facebook",
    name: "Facebook",
    description: "Share videos to your page or profile",
    available: false,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const [connected, setConnected] = useState<Record<ProviderKey, boolean>>({
    youtube: false,
    tiktok: false,
    instagram: false,
    facebook: false,
    x: false,
  });

  const query = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const banner = useMemo(() => {
    const conn = query.get("connected");
    if (conn === "youtube") return { kind: "success" as const, text: "YouTube connected successfully" };
    if (conn === "tiktok") return { kind: "success" as const, text: "TikTok connected successfully" };
    return null;
  }, [query]);

  async function loadConnectedAccounts() {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const user = sess.session?.user;

      setSessionEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
      setCreatedAt(user?.created_at ?? null);

      if (!token) {
        setConnected({ youtube: false, tiktok: false, instagram: false, facebook: false, x: false });
        return;
      }

      const res = await fetch("/api/platform-accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (!res.ok || !json?.ok) return;

      const rows = (json.data || []) as Array<{ provider?: string }>;
      const next: Record<ProviderKey, boolean> = {
        youtube: false,
        tiktok: false,
        instagram: false,
        facebook: false,
        x: false,
      };

      for (const r of rows) {
        const p = (r.provider || "").toLowerCase() as ProviderKey;
        if (p in next) next[p] = true;
      }

      setConnected(next);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function connectYouTube() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        alert("Please log in first.");
        return;
      }

      const res = await fetch("/api/auth/youtube/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (!res.ok || !json?.ok || !json?.url) {
        alert("Failed to start YouTube connection. Please try again.");
        return;
      }

      window.location.href = json.url;
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Connect failed");
    }
  }

  async function disconnectYouTube() {
    if (!confirm("Disconnect YouTube? You'll need to reconnect before scheduling uploads.")) {
      return;
    }

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/platform-accounts?provider=youtube", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (res.ok && json?.ok) {
        setConnected((prev) => ({ ...prev, youtube: false }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function connectTikTok() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        alert("Please log in first.");
        return;
      }

      const res = await fetch("/api/auth/tiktok/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (!res.ok || !json?.ok || !json?.url) {
        alert("Failed to start TikTok connection. Please try again.");
        return;
      }

      window.location.href = json.url;
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Connect failed");
    }
  }

  async function disconnectTikTok() {
    if (!confirm("Disconnect TikTok? You'll need to reconnect before scheduling uploads.")) {
      return;
    }

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/platform-accounts?provider=tiktok", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (res.ok && json?.ok) {
        setConnected((prev) => ({ ...prev, tiktok: false }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  useEffect(() => {
    loadConnectedAccounts();
  }, []);

  const connectedCount = Object.values(connected).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/50 via-transparent to-transparent" />
      </div>

      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Header */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-white/40 hover:text-white/70 transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>

        <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
        <p className="text-white/40 mt-1">Manage your account and preferences</p>

        {/* Success Banner */}
        {banner && (
          <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {banner.text}
          </div>
        )}

        {/* Account Section */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Account</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white/40">Email</div>
                  <div className="mt-1 font-medium">{sessionEmail || "—"}</div>
                </div>
                <button
                  disabled
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/40 cursor-not-allowed"
                >
                  Change
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white/40">Password</div>
                  <div className="mt-1 text-white/60">••••••••••••</div>
                </div>
                <Link
                  href="/reset-password"
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                >
                  Reset
                </Link>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white/40">Member since</div>
                  <div className="mt-1 text-white/60">
                    {createdAt
                      ? new Date(createdAt).toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Subscription Section */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Subscription</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-emerald-500/10 p-3">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium">Free Plan</div>
                  <div className="text-sm text-white/40 mt-0.5">Basic features for getting started</div>
                </div>
              </div>
              <button
                disabled
                className="rounded-full bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/40 cursor-not-allowed"
              >
                Upgrade — Coming soon
              </button>
            </div>
            <div className="mt-5 pt-5 border-t border-white/5">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-semibold">5</div>
                  <div className="text-xs text-white/40 mt-1">Uploads/month</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">1</div>
                  <div className="text-xs text-white/40 mt-1">Team member</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">{connectedCount}</div>
                  <div className="text-xs text-white/40 mt-1">Connected</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Connected Accounts Section */}
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">Connected Accounts</h2>
            <button
              onClick={loadConnectedAccounts}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
            {PLATFORMS.map((platform) => (
              <div key={platform.key} className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`rounded-full p-2.5 ${connected[platform.key] ? "bg-white/10 text-white" : "bg-white/5 text-white/40"}`}>
                      {platform.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{platform.name}</span>
                        {connected[platform.key] && (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400 border border-emerald-500/20">
                            Connected
                          </span>
                        )}
                        {!platform.available && !connected[platform.key] && (
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/40 border border-white/10">
                            Coming soon
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-white/40 mt-0.5">{platform.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {platform.key === "youtube" && connected.youtube && (
                      <button
                        onClick={disconnectYouTube}
                        className="rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        Disconnect
                      </button>
                    )}
                    {platform.key === "tiktok" && connected.tiktok && (
                      <button
                        onClick={disconnectTikTok}
                        className="rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        Disconnect
                      </button>
                    )}
                    {platform.key === "youtube" ? (
                      <button
                        onClick={connectYouTube}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                      >
                        {connected.youtube ? "Reconnect" : "Connect"}
                      </button>
                    ) : platform.key === "tiktok" ? (
                      <button
                        onClick={connectTikTok}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                      >
                        {connected.tiktok ? "Reconnect" : "Connect"}
                      </button>
                    ) : (
                      <button
                        disabled
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/30 cursor-not-allowed"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Team Section */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Team</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-purple-500/10 p-3">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium">Invite team members</div>
                  <div className="text-sm text-white/40 mt-0.5">
                    Let editors and collaborators manage uploads on your behalf
                  </div>
                </div>
              </div>
              <button
                disabled
                className="rounded-full bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/40 cursor-not-allowed"
              >
                Coming soon
              </button>
            </div>
          </div>
        </section>

        {/* Preferences Section */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Preferences</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Email notifications</div>
                  <div className="text-sm text-white/40 mt-0.5">Get notified when posts go live</div>
                </div>
                <button
                  disabled
                  className="rounded-full bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/40 cursor-not-allowed"
                >
                  Coming soon
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Default privacy</div>
                  <div className="text-sm text-white/40 mt-0.5">Set default privacy for new uploads</div>
                </div>
                <button
                  disabled
                  className="rounded-full bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/40 cursor-not-allowed"
                >
                  Coming soon
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Saved presets</div>
                  <div className="text-sm text-white/40 mt-0.5">Manage your saved upload presets</div>
                </div>
                <button
                  disabled
                  className="rounded-full bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/40 cursor-not-allowed"
                >
                  Coming soon
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-red-400/60 uppercase tracking-wider mb-4">Danger Zone</h2>
          <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.02] divide-y divide-red-500/5">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Sign out</div>
                  <div className="text-sm text-white/40 mt-0.5">Sign out of your account on this device</div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-red-400">Delete account</div>
                  <div className="text-sm text-white/40 mt-0.5">Permanently delete your account and all data</div>
                </div>
                <button
                  disabled
                  className="rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400/50 cursor-not-allowed"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-xs text-white/30">
            Clip Scheduler v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
}
