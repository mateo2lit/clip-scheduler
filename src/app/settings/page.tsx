"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
    description: "Share Reels and video posts (Business or Creator account required)",
    available: true,
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
    available: true,
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

  // Team state
  type TeamMember = { userId: string; email: string | null; role: string; joinedAt: string };
  type TeamInvite = { id: string; email: string; status: string; created_at: string };
  const [teamRole, setTeamRole] = useState<"owner" | "member" | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Plan state
  const [plan, setPlan] = useState<string>("none");
  const [planStatus, setPlanStatus] = useState<string>("inactive");
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  type AccountInfo = { connected: boolean; profileName?: string; avatarUrl?: string };
  const [accounts, setAccounts] = useState<Record<ProviderKey, AccountInfo>>({
    youtube: { connected: false },
    tiktok: { connected: false },
    instagram: { connected: false },
    facebook: { connected: false },
    x: { connected: false },
  });

  const query = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const banner = useMemo(() => {
    const conn = query.get("connected");
    if (conn === "youtube") return { kind: "success" as const, text: "YouTube connected successfully" };
    if (conn === "tiktok") return { kind: "success" as const, text: "TikTok connected successfully" };
    if (conn === "facebook") return { kind: "success" as const, text: "Facebook connected successfully" };
    if (conn === "instagram") return { kind: "success" as const, text: "Instagram connected successfully" };
    const checkout = query.get("checkout");
    if (checkout === "success") return { kind: "success" as const, text: "Subscription activated! Welcome to ClipDash." };
    if (checkout === "canceled") return { kind: "info" as const, text: "Checkout was canceled. You can try again anytime." };
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
        setAccounts({ youtube: { connected: false }, tiktok: { connected: false }, instagram: { connected: false }, facebook: { connected: false }, x: { connected: false } });
        return;
      }

      const res = await fetch("/api/platform-accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (!res.ok || !json?.ok) return;

      const rows = (json.data || []) as Array<{ provider?: string; profile_name?: string; avatar_url?: string }>;
      const next: Record<ProviderKey, AccountInfo> = {
        youtube: { connected: false },
        tiktok: { connected: false },
        instagram: { connected: false },
        facebook: { connected: false },
        x: { connected: false },
      };

      for (const r of rows) {
        const p = (r.provider || "").toLowerCase() as ProviderKey;
        if (p in next) next[p] = { connected: true, profileName: r.profile_name, avatarUrl: r.avatar_url };
      }

      setAccounts(next);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const loadTeamInfo = useCallback(async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/team/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (json.ok) {
        setTeamRole(json.role);
        setTeamMembers(json.members ?? []);
        setTeamInvites(json.invites ?? []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadPlanInfo = useCallback(async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/team/plan", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok) {
        setPlan(json.plan);
        setPlanStatus(json.plan_status);
        setTrialEndsAt(json.trial_ends_at);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  async function handleCheckout(priceId: string) {
    setPlanLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert(json.error || "Failed to start checkout");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to start checkout");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleManageSubscription() {
    setPlanLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert(json.error || "Failed to open billing portal");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to open billing portal");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setInviteError(json.error || "Failed to send invite");
      } else {
        setInviteSuccess(json.joined ? "User added to team" : "Invite sent");
        setInviteEmail("");
        loadTeamInfo();
      }
    } catch (e: any) {
      setInviteError(e?.message || "Failed");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRemoveMember(targetUserId: string) {
    if (!confirm("Remove this member from your team?")) return;

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/team/invite?userId=${targetUserId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) loadTeamInfo();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!confirm("Cancel this invite?")) return;

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/team/invite?inviteId=${inviteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) loadTeamInfo();
    } catch (e) {
      console.error(e);
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
        setAccounts((prev) => ({ ...prev, youtube: { connected: false } }));
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
        setAccounts((prev) => ({ ...prev, tiktok: { connected: false } }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function connectFacebook() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        alert("Please log in first.");
        return;
      }

      const res = await fetch("/api/auth/facebook/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (!res.ok || !json?.ok || !json?.url) {
        alert("Failed to start Facebook connection. Please try again.");
        return;
      }

      window.location.href = json.url;
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Connect failed");
    }
  }

  async function disconnectFacebook() {
    if (!confirm("Disconnect Facebook? You'll need to reconnect before scheduling uploads.")) {
      return;
    }

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/platform-accounts?provider=facebook", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (res.ok && json?.ok) {
        setAccounts((prev) => ({ ...prev, facebook: { connected: false } }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function connectInstagram() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        alert("Please log in first.");
        return;
      }

      const res = await fetch("/api/auth/instagram/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (!res.ok || !json?.ok || !json?.url) {
        alert("Failed to start Instagram connection. Please try again.");
        return;
      }

      window.location.href = json.url;
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Connect failed");
    }
  }

  async function disconnectInstagram() {
    if (!confirm("Disconnect Instagram? You'll need to reconnect before scheduling uploads.")) {
      return;
    }

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/platform-accounts?provider=instagram", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (res.ok && json?.ok) {
        setAccounts((prev) => ({ ...prev, instagram: { connected: false } }));
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
    loadTeamInfo();
    loadPlanInfo();
  }, [loadTeamInfo, loadPlanInfo]);

  const connectedCount = Object.values(accounts).filter((a) => a.connected).length;

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent rounded-full blur-3xl" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight hover:text-white/80 transition-colors">Clip Dash</Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/40">Settings</span>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-3xl px-6 pt-10 pb-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/dashboard"
            className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-white/40">Manage your account and preferences</p>
          </div>
        </div>

        {/* Success Banner */}
        {banner && (
          <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {banner.text}
          </div>
        )}

        {/* Account Section */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Account</h2>
          <div className="rounded-2xl rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
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
                <button
                  onClick={async () => {
                    if (!sessionEmail) return;
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    const { error } = await supabase.auth.resetPasswordForEmail(sessionEmail, {
                      redirectTo: `${origin}/auth/callback?next=/reset-password`,
                    });
                    if (error) {
                      alert(error.message);
                    } else {
                      alert("Check your email for a password reset link.");
                    }
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                >
                  Reset
                </button>
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

          {/* Past due warning */}
          {planStatus === "past_due" && (
            <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400 flex items-center justify-between">
              <span>Payment failed — please update your payment method.</span>
              <button
                onClick={handleManageSubscription}
                disabled={planLoading}
                className="rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-black hover:bg-amber-400 transition-colors"
              >
                Update
              </button>
            </div>
          )}

          {/* No plan — show plan picker */}
          {(plan === "none" && planStatus !== "canceled") && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Creator */}
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/[0.04] p-6 flex flex-col relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-0.5 text-xs font-semibold">
                  Most Popular
                </div>
                <h3 className="text-lg font-semibold">Creator</h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold">$9.99</span>
                  <span className="text-white/40 text-sm ml-1">/month</span>
                </div>
                <ul className="space-y-2 text-sm text-white/60 mb-6 flex-1">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    Unlimited uploads
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    All platforms
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    1 team member (solo)
                  </li>
                </ul>
                <button
                  onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID || "")}
                  disabled={planLoading}
                  className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-colors disabled:opacity-50"
                >
                  {planLoading ? "Loading..." : "Start 7-day free trial"}
                </button>
              </div>

              {/* Team */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex flex-col">
                <h3 className="text-lg font-semibold">Team</h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold">$19.99</span>
                  <span className="text-white/40 text-sm ml-1">/month</span>
                </div>
                <ul className="space-y-2 text-sm text-white/60 mb-6 flex-1">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    Unlimited uploads
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    All platforms
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    Up to 5 team members
                  </li>
                </ul>
                <button
                  onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID || "")}
                  disabled={planLoading}
                  className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  {planLoading ? "Loading..." : "Start 7-day free trial"}
                </button>
              </div>
            </div>
          )}

          {/* Active or trialing plan */}
          {(planStatus === "trialing" || planStatus === "active") && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-emerald-500/10 p-3">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium capitalize">{plan === "creator" ? "Creator" : "Team"} Plan</div>
                    <div className="text-sm text-white/40 mt-0.5">
                      {planStatus === "trialing" && trialEndsAt
                        ? `Trial ends ${new Date(trialEndsAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`
                        : "Active subscription"}
                    </div>
                  </div>
                </div>
                {teamRole === "owner" && (
                  <button
                    onClick={handleManageSubscription}
                    disabled={planLoading}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {planLoading ? "Loading..." : "Manage Subscription"}
                  </button>
                )}
              </div>
              <div className="mt-5 pt-5 border-t border-white/5">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-semibold">&infin;</div>
                    <div className="text-xs text-white/40 mt-1">Uploads</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">{teamMembers.length}</div>
                    <div className="text-xs text-white/40 mt-1">Team member{teamMembers.length !== 1 ? "s" : ""}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">{connectedCount}</div>
                    <div className="text-xs text-white/40 mt-1">Connected</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Canceled */}
          {planStatus === "canceled" && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-red-500/10 p-3">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">Plan Canceled</div>
                    <div className="text-sm text-white/40 mt-0.5">Subscribe to continue scheduling posts</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setPlan("none");
                    setPlanStatus("inactive");
                  }}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 transition-colors"
                >
                  Re-subscribe
                </button>
              </div>
            </div>
          )}
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
          <div className="rounded-2xl rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
            {PLATFORMS.map((platform) => {
              const acct = accounts[platform.key];
              return (
                <div key={platform.key} className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className={`rounded-full p-2.5 ${acct.connected ? "bg-white/10 text-white" : "bg-white/5 text-white/40"}`}>
                          {platform.icon}
                        </div>
                        {acct.connected && acct.avatarUrl && (
                          <img
                            src={acct.avatarUrl}
                            alt=""
                            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#050505] object-cover"
                          />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{platform.name}</span>
                          {acct.connected && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400 border border-emerald-500/20">
                              Connected
                            </span>
                          )}
                          {!platform.available && !acct.connected && (
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/40 border border-white/10">
                              Coming soon
                            </span>
                          )}
                        </div>
                        {acct.connected && acct.profileName ? (
                          <div className="text-sm text-white/50 mt-0.5">{acct.profileName}</div>
                        ) : (
                          <div className="text-sm text-white/40 mt-0.5">{platform.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {teamRole === "owner" && (
                        <>
                          {platform.key === "youtube" && acct.connected && (
                            <button
                              onClick={disconnectYouTube}
                              className="rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              Disconnect
                            </button>
                          )}
                          {platform.key === "tiktok" && acct.connected && (
                            <button
                              onClick={disconnectTikTok}
                              className="rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              Disconnect
                            </button>
                          )}
                          {platform.key === "facebook" && acct.connected && (
                            <button
                              onClick={disconnectFacebook}
                              className="rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              Disconnect
                            </button>
                          )}
                          {platform.key === "instagram" && acct.connected && (
                            <button
                              onClick={disconnectInstagram}
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
                              {acct.connected ? "Reconnect" : "Connect"}
                            </button>
                          ) : platform.key === "tiktok" ? (
                            <button
                              onClick={connectTikTok}
                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                            >
                              {acct.connected ? "Reconnect" : "Connect"}
                            </button>
                          ) : platform.key === "facebook" ? (
                            <button
                              onClick={connectFacebook}
                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                            >
                              {acct.connected ? "Reconnect" : "Connect"}
                            </button>
                          ) : platform.key === "instagram" ? (
                            <button
                              onClick={connectInstagram}
                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                            >
                              {acct.connected ? "Reconnect" : "Connect"}
                            </button>
                          ) : (
                            <button
                              disabled
                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/30 cursor-not-allowed"
                            >
                              Connect
                            </button>
                          )}
                        </>
                      )}
                      {teamRole === "member" && !platform.available && (
                        <span className="text-xs text-white/30">Coming soon</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Team Section */}
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">Team</h2>
            <span className="text-xs text-white/30">{teamMembers.length + teamInvites.length}/{plan === "team" ? 5 : 1} members</span>
          </div>
          <div className="rounded-2xl rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
            {/* Members list */}
            {teamMembers.map((member) => (
              <div key={member.userId} className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-medium text-white/70">
                      {(member.email ?? "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-white/90">{member.email ?? "Unknown"}</div>
                      <div className="text-xs text-white/40 mt-0.5">
                        {member.role === "owner" ? "Owner" : "Member"} &middot; Joined {new Date(member.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                  {teamRole === "owner" && member.role !== "owner" && (
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Pending invites */}
            {teamInvites.map((invite) => (
              <div key={invite.id} className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-sm text-white/30">
                      ?
                    </div>
                    <div>
                      <div className="font-medium text-white/60">{invite.email}</div>
                      <div className="text-xs text-amber-400/70 mt-0.5">
                        Pending invite &middot; Sent {new Date(invite.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  </div>
                  {teamRole === "owner" && (
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Invite form (owner only) */}
            {teamRole === "owner" && (
              <div className="p-5">
                <div className="flex items-center gap-3">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      setInviteError(null);
                      setInviteSuccess(null);
                    }}
                    placeholder="Enter email to invite..."
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  />
                  <button
                    onClick={handleInvite}
                    disabled={inviteLoading || !inviteEmail.trim()}
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 transition-colors disabled:opacity-50"
                  >
                    {inviteLoading ? "Sending..." : "Invite"}
                  </button>
                </div>
                {inviteError && (
                  <p className="text-xs text-red-400 mt-2">{inviteError}</p>
                )}
                {inviteSuccess && (
                  <p className="text-xs text-emerald-400 mt-2">{inviteSuccess}</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Preferences Section */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Preferences</h2>
          <div className="rounded-2xl rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
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
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
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
            Clip Dash v0.1.0
          </p>
        </div>
      </div>
    </main>
  );
}
