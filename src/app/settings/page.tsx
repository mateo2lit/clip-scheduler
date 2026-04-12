"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/app/login/supabaseClient";
import Link from "next/link";
import { isThreadsEnabledForUserIdClient } from "@/lib/platformAccess";
import AppPageOrb from "@/components/AppPageOrb";

type ProviderKey = "youtube" | "tiktok" | "instagram" | "facebook" | "linkedin" | "threads" | "bluesky" | "x";
const SPOTLIGHT_DISABLED_KEY = "clipdash:disable-hover-spotlight";
const SPOTLIGHT_PREF_EVENT = "clipdash:spotlight-pref-change";

type PlatformConfig = {
  key: ProviderKey;
  name: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
};
type SettingsTab = "account" | "subscription" | "connected" | "team" | "notifications" | "defaults" | "queue" | "danger";

function proxiedAvatar(url: string | null | undefined): string | null {
  if (!url) return null;
  // Local API endpoints (e.g. /api/avatar-live) — return directly, no double-wrapping
  if (url.startsWith("/")) return url;
  return `/api/avatar-proxy?url=${encodeURIComponent(url)}`;
}

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
    key: "linkedin",
    name: "LinkedIn",
    description: "Post videos to your LinkedIn profile",
    available: true,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
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
  {
    key: "threads" as ProviderKey,
    name: "Threads",
    description: "Post videos to your Threads account (Meta Graph API)",
    available: true,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.5 12.068V12c.05-4.073 1.364-7.298 3.905-9.58C7.628.302 10.594-.06 12.186 0c2.64.065 4.955.942 6.681 2.534.94.861 1.696 1.957 2.25 3.258l-2.145.9c-.427-1.012-1.03-1.881-1.793-2.582-1.33-1.218-3.15-1.872-5.053-1.915-1.275-.032-3.6.239-5.392 1.913C4.899 5.69 3.884 8.26 3.84 11.998c.038 3.733 1.053 6.3 3.014 7.847 1.782 1.374 4.107 1.662 5.367 1.682 1.254-.005 3.424-.237 5.25-1.624.926-.71 1.63-1.63 2.09-2.73-1.208-.226-2.457-.285-3.73-.147-2.02.217-3.717-.185-5.04-1.196-.959-.728-1.505-1.833-1.514-2.949-.013-1.208.496-2.372 1.389-3.191 1.083-.994 2.67-1.487 4.712-1.487a11.91 11.91 0 0 1 1.96.164c-.143-.49-.38-.882-.714-1.165-.522-.442-1.329-.667-2.396-.667l-.118.001c-.899.01-2.094.317-2.823 1.218l-1.617-1.38C9.5 7.067 11.083 6.5 12.72 6.5l.156-.001c1.597-.007 2.936.388 3.88 1.168.99.815 1.534 2.016 1.617 3.578.1 1.828-.265 3.382-1.086 4.624-.821 1.241-2.071 2.097-3.617 2.475a10.6 10.6 0 0 1-2.52.296c-2.01-.003-3.41-.55-4.165-1.636-.48-.687-.636-1.504-.49-2.413.215-1.326 1.1-2.477 2.482-3.235 1.028-.565 2.2-.808 3.468-.72.447.03.883.084 1.303.161-.12-.857-.477-1.423-.979-1.694-.545-.292-1.245-.355-1.78-.16-.617.224-1.126.747-1.516 1.555l-1.972-.906c.568-1.24 1.46-2.154 2.643-2.72 1.002-.476 2.123-.616 3.237-.405 1.4.267 2.483 1.038 3.13 2.233.551 1.014.787 2.285.696 3.78a11.72 11.72 0 0 1-.1.99c-.11.762-.286 1.46-.52 2.083 1.58.048 3.121.386 4.573.996-.015.14-.03.278-.046.414-.257 2.155-1.023 3.932-2.278 5.282C17.236 22.803 14.85 23.975 12.186 24z"/>
      </svg>
    ),
  },
  {
    key: "bluesky" as ProviderKey,
    name: "Bluesky",
    description: "Post videos to your Bluesky account (AT Protocol)",
    available: true,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 600 530" fill="currentColor">
        <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.106 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/>
      </svg>
    ),
  },
  {
    key: "x" as ProviderKey,
    name: "X (Twitter)",
    description: "Post videos to your X (Twitter) account",
    available: true,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/>
      </svg>
    ),
  },
];

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; subtitle: string }> = [
  { id: "account", label: "Account", subtitle: "Profile and password" },
  { id: "subscription", label: "Subscription", subtitle: "Plan and billing" },
  { id: "connected", label: "Connected Accounts", subtitle: "Platform access" },
  { id: "team", label: "Team", subtitle: "Members and invites" },
  { id: "notifications", label: "Notifications", subtitle: "Email alerts" },
  { id: "defaults", label: "Upload Defaults", subtitle: "Platform presets" },
  { id: "queue", label: "Queue", subtitle: "Posting schedule" },
  { id: "danger", label: "Danger Zone", subtitle: "Sign out and delete" },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  // Team state
  type TeamMember = { userId: string; email: string | null; role: string; joinedAt: string };
  type TeamInvite = { id: string; email: string; status: string; created_at: string };
  const [teamRole, setTeamRole] = useState<"owner" | "member" | "admin" | null>(null);
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
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [postedCount, setPostedCount] = useState<number>(0);
  const [planBillingInterval, setPlanBillingInterval] = useState<"month" | "year" | null>(null);
  const [planPriceAmount, setPlanPriceAmount] = useState<number | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [isResubscribe, setIsResubscribe] = useState(false);

  type AccountInfo = { id: string; profileName?: string; avatarUrl?: string; label?: string };
  const [accounts, setAccounts] = useState<Record<ProviderKey, AccountInfo[]>>({
    youtube: [],
    tiktok: [],
    instagram: [],
    facebook: [],
    linkedin: [],
    threads: [],
    bluesky: [],
    x: [],
  });
  const [editingName, setEditingName] = useState<{ id: string; value: string } | null>(null);

  // Queue schedule state
  type QueueSlot = { id: string; time: string; days: boolean[] };
  type QueueScheduleConfig = { slots: QueueSlot[]; randomize: boolean; timezone: string };
  const [queueSchedule, setQueueSchedule] = useState<QueueScheduleConfig>({ slots: [], randomize: false, timezone: "UTC" });
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [queueSaving, setQueueSaving] = useState(false);
  const [newSlotTime, setNewSlotTime] = useState("12:00");

  const query = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const threadsEnabled = isThreadsEnabledForUserIdClient(userId);
  const visiblePlatforms = useMemo(
    () => PLATFORMS.filter((p) => p.key !== "threads" || threadsEnabled),
    [threadsEnabled]
  );

  const banner = useMemo(() => {
    const conn = query.get("connected");
    if (conn === "youtube") return { kind: "success" as const, text: "YouTube connected successfully" };
    if (conn === "tiktok") return { kind: "success" as const, text: "TikTok connected successfully" };
    if (conn === "facebook") return { kind: "success" as const, text: "Facebook connected successfully" };
    if (conn === "instagram") return { kind: "success" as const, text: "Instagram connected successfully" };
    if (conn === "linkedin") return { kind: "success" as const, text: "LinkedIn connected successfully" };
    if (conn === "threads") return { kind: "success" as const, text: "Threads connected successfully" };
    if (conn === "x") return { kind: "success" as const, text: "X connected successfully" };
    const error = query.get("error");
    if (error === "auth_denied") return { kind: "error" as const, text: "Connection was canceled." };
    if (error === "expired") return { kind: "error" as const, text: "Connection timed out — the authorization window is 15 minutes. Please try again." };
    if (error === "invalid") return { kind: "error" as const, text: "Something went wrong during authorization. Please try again." };
    if (error === "no_team") return { kind: "error" as const, text: "Account setup issue detected. Please log out and back in." };
    if (error === "save_failed") return { kind: "error" as const, text: "Failed to save your account. Please try again." };
    if (error === "token_exchange") return { kind: "error" as const, text: "Connection failed — the platform returned an error. Please try again." };
    if (error === "no_youtube_channel") return { kind: "error" as const, text: "No YouTube channel found on that Google account. Create a channel first, then reconnect." };
    if (error === "no_refresh_token") return { kind: "error" as const, text: "Google didn't return a refresh token. Revoke Clip Scheduler's access in your Google Account security settings, then reconnect." };
    if (error === "no_pages") return { kind: "error" as const, text: "No Facebook Pages found on that account. You need a Facebook Page to post — create one at facebook.com, then reconnect." };
    if (error === "unknown") return { kind: "error" as const, text: "Something went wrong. Please try again or contact support if it persists." };
    const checkout = query.get("checkout");
    if (checkout === "success") return { kind: "success" as const, text: "Subscription activated! Welcome to ClipDash." };
    if (checkout === "canceled") return { kind: "info" as const, text: "Checkout was canceled. You can try again anytime." };
    return null;
  }, [query]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const byQuery = query.get("tab");
    const byHash = window.location.hash.replace("#", "");
    const candidate = (byQuery || byHash) as SettingsTab;
    if (SETTINGS_TABS.some((t) => t.id === candidate)) {
      setActiveTab(candidate);
    }
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
        window.location.href = "/login";
        return;
      }

      const res = await fetch("/api/platform-accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (!res.ok || !json?.ok) return;

      const rows = (json.data || []) as Array<{ id?: string; provider?: string; profile_name?: string; avatar_url?: string; label?: string }>;
      const next: Record<ProviderKey, AccountInfo[]> = {
        youtube: [],
        tiktok: [],
        instagram: [],
        facebook: [],
        linkedin: [],
        threads: [],
        bluesky: [],
        x: [],
      };

      for (const r of rows) {
        const p = (r.provider || "").toLowerCase() as ProviderKey;
        if (p in next && r.id) next[p].push({ id: r.id, profileName: r.profile_name, avatarUrl: r.avatar_url, label: r.label });
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
        setRenewalDate(json.current_period_end ?? null);
        setPostedCount(json.posted_count ?? 0);
        setPlanBillingInterval(json.billing_interval ?? null);
        setPlanPriceAmount(json.price_amount ?? null);
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

  async function handleRoleToggle(targetUserId: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "member" : "admin";
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/team/role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: targetUserId, role: newRole }),
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
        setAccounts((prev) => ({ ...prev, youtube: [] }));
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
        setAccounts((prev) => ({ ...prev, tiktok: [] }));
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
        setAccounts((prev) => ({ ...prev, facebook: [] }));
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
        setAccounts((prev) => ({ ...prev, instagram: [] }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function connectLinkedIn() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        alert("Please log in first.");
        return;
      }

      const res = await fetch("/api/auth/linkedin/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (!res.ok || !json?.ok || !json?.url) {
        alert("Failed to start LinkedIn connection. Please try again.");
        return;
      }

      window.location.href = json.url;
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Connect failed");
    }
  }

  async function disconnectLinkedIn() {
    if (!confirm("Disconnect LinkedIn? You'll need to reconnect before scheduling uploads.")) {
      return;
    }

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/platform-accounts?provider=linkedin", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { json } = await safeReadJson(res);
      if (res.ok && json?.ok) {
        setAccounts((prev) => ({ ...prev, linkedin: [] }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function connectThreads() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { alert("Please log in first."); return; }
      const res = await fetch("/api/auth/threads/start", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const { json } = await safeReadJson(res);
      if (!res.ok || !json?.ok || !json?.url) { alert("Failed to start Threads connection. Please try again."); return; }
      window.location.href = json.url;
    } catch (e: any) { alert(e?.message || "Connect failed"); }
  }

  async function disconnectThreads() {
    if (!confirm("Disconnect Threads?")) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/platform-accounts?provider=threads", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const { json } = await safeReadJson(res);
      if (res.ok && json?.ok) setAccounts((prev) => ({ ...prev, threads: [] }));
    } catch (e) { console.error(e); }
  }

  async function connectX() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { alert("Please log in first."); return; }
      const res = await fetch("/api/auth/x/start", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const { json } = await safeReadJson(res);
      if (!res.ok || !json?.ok || !json?.url) {
        alert(`Failed to start X connection: ${json?.error || `HTTP ${res.status}`}`);
        return;
      }
      window.location.href = json.url;
    } catch (e: any) { alert(e?.message || "Connect failed"); }
  }

  async function disconnectX() {
    if (!confirm("Disconnect X? You'll need to reconnect before scheduling uploads.")) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/platform-accounts?provider=x", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const { json } = await safeReadJson(res);
      if (res.ok && json?.ok) setAccounts((prev) => ({ ...prev, x: [] }));
    } catch (e) { console.error(e); }
  }

  const [blueskyHandle, setBlueskyHandle] = useState("");
  const [blueskyPassword, setBlueskyPassword] = useState("");
  const [blueskyConnecting, setBlueskyConnecting] = useState(false);
  const [blueskyError, setBlueskyError] = useState<string | null>(null);

  async function connectBluesky() {
    if (!blueskyHandle.trim() || !blueskyPassword.trim()) { setBlueskyError("Handle and app password are required."); return; }
    setBlueskyConnecting(true);
    setBlueskyError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setBlueskyError("Not logged in."); return; }
      const res = await fetch("/api/auth/bluesky/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ handle: blueskyHandle.trim(), appPassword: blueskyPassword.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setBlueskyError(json?.error || "Connection failed"); return; }
      setBlueskyHandle(""); setBlueskyPassword("");
      loadConnectedAccounts();
    } catch (e: any) { setBlueskyError(e?.message || "Connection failed"); }
    finally { setBlueskyConnecting(false); }
  }

  async function disconnectBluesky() {
    if (!confirm("Disconnect Bluesky?")) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/platform-accounts?provider=bluesky", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const { json } = await safeReadJson(res);
      if (res.ok && json?.ok) setAccounts((prev) => ({ ...prev, bluesky: [] }));
    } catch (e) { console.error(e); }
  }

  async function disconnectAccount(provider: ProviderKey, accountId: string) {
    if (!confirm(`Disconnect this ${provider} account? Scheduled posts using it will not be affected.`)) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/platform-accounts?id=${accountId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const { json } = await safeReadJson(res);
      if (res.ok && json?.ok) {
        setAccounts((prev) => ({
          ...prev,
          [provider]: prev[provider].filter((a) => a.id !== accountId),
        }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState({
    notify_post_success: true,
    notify_post_failed: true,
    notify_reconnect: true,
  });
  const [notifLoading, setNotifLoading] = useState(true);
  const [hoverSpotlightEnabled, setHoverSpotlightEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setHoverSpotlightEnabled(window.localStorage.getItem(SPOTLIGHT_DISABLED_KEY) !== "1");
    } catch {
      setHoverSpotlightEnabled(true);
    }
  }, []);

  const loadNotifPrefs = useCallback(async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/notifications/preferences", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok && json.preferences) {
        setNotifPrefs({
          notify_post_success: json.preferences.notify_post_success,
          notify_post_failed: json.preferences.notify_post_failed,
          notify_reconnect: json.preferences.notify_reconnect,
        });
      }
    } catch {}
    setNotifLoading(false);
  }, []);

  async function updateNotifPref(key: string, value: boolean) {
    const prev = { ...notifPrefs };
    setNotifPrefs((p) => ({ ...p, [key]: value }));

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: value }),
      });

      const json = await res.json();
      if (!json.ok) {
        setNotifPrefs(prev);
      }
    } catch {
      setNotifPrefs(prev);
    }
  }

  function updateHoverSpotlightPref(value: boolean) {
    setHoverSpotlightEnabled(value);
    if (typeof window === "undefined") return;

    try {
      if (value) {
        window.localStorage.removeItem(SPOTLIGHT_DISABLED_KEY);
      } else {
        window.localStorage.setItem(SPOTLIGHT_DISABLED_KEY, "1");
      }
      window.dispatchEvent(new Event(SPOTLIGHT_PREF_EVENT));
    } catch {}
  }

  // Platform defaults
  type PlatformDefaultsMap = Record<string, Record<string, any>>;
  const [platformDefaults, setPlatformDefaults] = useState<PlatformDefaultsMap>({});
  const [defaultsTab, setDefaultsTab] = useState<"youtube" | "tiktok" | "instagram">("youtube");
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  const loadPlatformDefaults = useCallback(async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/platform-defaults", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok && json.defaults) {
        const map: PlatformDefaultsMap = {};
        for (const row of json.defaults) {
          map[row.platform] = row.settings || {};
        }
        setPlatformDefaults(map);
      }
    } catch {}
  }, []);

  function getDefault(platform: string, key: string, fallback: any) {
    return platformDefaults[platform]?.[key] ?? fallback;
  }

  function setDefaultField(platform: string, key: string, value: any) {
    setPlatformDefaults((prev) => ({
      ...prev,
      [platform]: { ...(prev[platform] || {}), [key]: value },
    }));
    setDefaultsSaved(false);
  }

  async function savePlatformDefault(platform: string) {
    setDefaultsSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      await fetch("/api/platform-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ platform, settings: platformDefaults[platform] || {} }),
      });
      setDefaultsSaved(true);
      setTimeout(() => setDefaultsSaved(false), 2000);
    } catch {}
    setDefaultsSaving(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  useEffect(() => {
    async function init() {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        window.location.href = "/login";
        return;
      }
      loadConnectedAccounts();
      loadTeamInfo();
      loadPlanInfo();
      loadNotifPrefs();
      loadPlatformDefaults();
    }
    init();
  }, [loadTeamInfo, loadPlanInfo, loadNotifPrefs, loadPlatformDefaults]);

  const connectedCount = Object.values(accounts).filter((arr) => arr.length > 0).length;

  async function saveAccountName(acctId: string, name: string) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await fetch("/api/platform-accounts", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: acctId, profile_name: name }),
    });
    setAccounts((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next) as ProviderKey[]) {
        next[key] = next[key].map((a) => a.id === acctId ? { ...a, profileName: name, label: name } : a);
      }
      return next;
    });
    setEditingName(null);
  }

  // Recommended post times based on cross-platform engagement research
  const RECOMMENDED_TIMES = [
    { time: "09:00", label: "9:00 AM", note: "Morning check-in", days: [true,true,true,true,true,false,false] },
    { time: "12:00", label: "12:00 PM", note: "Lunch break",     days: [true,true,true,true,true,false,false] },
    { time: "15:00", label: "3:00 PM",  note: "Afternoon peak",  days: [true,true,true,true,true,true,true] },
    { time: "19:00", label: "7:00 PM",  note: "Evening prime",   days: [true,true,true,true,true,true,true] },
  ];

  // Load queue when Queue tab is opened
  useEffect(() => {
    if (activeTab !== "queue" || queueLoaded) return;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/queue", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (json?.schedule) {
            setQueueSchedule({ slots: json.schedule.slots || [], randomize: !!json.schedule.randomize, timezone: json.schedule.timezone || tz });
          } else {
            // First time setup — pre-populate with recommended times and save
            const defaultSlots = RECOMMENDED_TIMES.map(r => ({ id: crypto.randomUUID(), time: r.time, days: r.days }));
            const defaults = { slots: defaultSlots, randomize: false, timezone: tz };
            setQueueSchedule(defaults);
            await fetch("/api/queue", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(defaults) });
          }
        }
      } catch {}
      setQueueLoaded(true);
    })();
  }, [activeTab, queueLoaded]);

  async function saveQueueSchedule(updated: QueueScheduleConfig) {
    try {
      setQueueSaving(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      await fetch("/api/queue", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    } catch {} finally { setQueueSaving(false); }
  }

  function addQueueSlot() {
    if (!newSlotTime || queueSchedule.slots.find(s => s.time === newSlotTime)) return;
    const updated: QueueScheduleConfig = { ...queueSchedule, slots: [...queueSchedule.slots, { id: crypto.randomUUID(), time: newSlotTime, days: [true, true, true, true, true, true, true] }].sort((a, b) => a.time.localeCompare(b.time)) };
    setQueueSchedule(updated); saveQueueSchedule(updated);
  }

  function removeQueueSlot(id: string) {
    const updated: QueueScheduleConfig = { ...queueSchedule, slots: queueSchedule.slots.filter(s => s.id !== id) };
    setQueueSchedule(updated); saveQueueSchedule(updated);
  }

  function toggleQueueDay(slotId: string, dayIdx: number) {
    const updated: QueueScheduleConfig = { ...queueSchedule, slots: queueSchedule.slots.map(s => s.id === slotId ? { ...s, days: s.days.map((v, i) => i === dayIdx ? !v : v) } : s) };
    setQueueSchedule(updated); saveQueueSchedule(updated);
  }

  function toggleQueueRandomize() {
    const updated: QueueScheduleConfig = { ...queueSchedule, randomize: !queueSchedule.randomize };
    setQueueSchedule(updated); saveQueueSchedule(updated);
  }

  function formatQueueTime(t: string) {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
  }


  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <AppPageOrb />
      {/* Background gradient orbs */}

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center"><img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" /></Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/40">Settings</span>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-10 pb-16">
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

        {/* Banner */}
        {banner && (
          <div className={`mt-6 rounded-xl px-4 py-3 text-sm ${banner.kind === "error" ? "border border-red-500/20 bg-red-500/10 text-red-400" : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"}`}>
            {banner.text}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-fit rounded-3xl border border-white/10 bg-white/[0.03] p-2 shadow-[0_20px_70px_rgba(2,6,23,0.45)] lg:sticky lg:top-8">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("tab", tab.id);
                    window.history.replaceState({}, "", url.toString());
                  }
                }}
                className={`w-full rounded-2xl px-4 py-3 text-left transition-colors ${
                  activeTab === tab.id
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white/80"
                }`}
              >
                <div className="text-sm font-medium">{tab.label}</div>
                <div className="text-xs text-white/40">{tab.subtitle}</div>
              </button>
            ))}
            <a
              href="/support"
              className="w-full rounded-2xl px-4 py-3 text-left transition-colors text-white/60 hover:bg-white/5 hover:text-white/80 block"
            >
              <div className="text-sm font-medium">Support</div>
              <div className="text-xs text-white/40">Help & tickets</div>
            </a>
          </aside>

          <div>

        {activeTab === "account" && (
        <section className="mt-0">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Account</h2>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] divide-y divide-white/5">
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
        )}

        {activeTab === "subscription" && (
        <section className="mt-0 space-y-4">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">Subscription</h2>

          {/* Past due warning */}
          {planStatus === "past_due" && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400 flex items-center justify-between">
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
            <div>
              {/* Billing period toggle */}
              <div className="flex justify-center mb-5">
                <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5 text-sm">
                  <button
                    onClick={() => setBillingPeriod("monthly")}
                    className={`rounded-full px-4 py-1.5 font-medium transition-colors ${billingPeriod === "monthly" ? "bg-white text-black" : "text-white/50 hover:text-white/80"}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingPeriod("annual")}
                    className={`rounded-full px-4 py-1.5 font-medium transition-colors ${billingPeriod === "annual" ? "bg-white text-black" : "text-white/50 hover:text-white/80"}`}
                  >
                    Annual <span className={`ml-1 text-xs font-semibold ${billingPeriod === "annual" ? "text-emerald-600" : "text-emerald-400"}`}>Save 17%</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-blue-500/30 bg-blue-500/[0.04] p-6 flex flex-col relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-0.5 text-xs font-semibold">
                    Most Popular
                  </div>
                  <h3 className="text-lg font-semibold">Creator</h3>
                  <div className="mt-2 mb-4">
                    {billingPeriod === "annual" ? (
                      <>
                        <span className="text-3xl font-bold">$8.17</span>
                        <span className="text-white/40 text-sm ml-1">/month</span>
                        <div className="text-xs text-white/40 mt-0.5">$98 billed annually</div>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">$9.99</span>
                        <span className="text-white/40 text-sm ml-1">/month</span>
                      </>
                    )}
                  </div>
                  <ul className="space-y-2 text-sm text-white/60 mb-6 flex-1">
                    <li className="flex items-center gap-2"><svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Unlimited uploads</li>
                    <li className="flex items-center gap-2"><svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>All 7 platforms</li>
                    <li className="flex items-center gap-2"><svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>25 GB storage</li>
                    <li className="flex items-center gap-2"><svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>1 team member (solo)</li>
                  </ul>
                  <button
                    onClick={() => handleCheckout(billingPeriod === "annual" ? (process.env.NEXT_PUBLIC_STRIPE_CREATOR_ANNUAL_PRICE_ID || "") : (process.env.NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID || ""))}
                    disabled={planLoading}
                    className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-colors disabled:opacity-50"
                  >
                    {planLoading ? "Loading..." : isResubscribe ? "Subscribe — Creator" : "Start 7-day free trial"}
                  </button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col">
                  <h3 className="text-lg font-semibold">Team</h3>
                  <div className="mt-2 mb-4">
                    {billingPeriod === "annual" ? (
                      <>
                        <span className="text-3xl font-bold">$16.58</span>
                        <span className="text-white/40 text-sm ml-1">/month</span>
                        <div className="text-xs text-white/40 mt-0.5">$199 billed annually</div>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">$19.99</span>
                        <span className="text-white/40 text-sm ml-1">/month</span>
                      </>
                    )}
                  </div>
                  <ul className="space-y-2 text-sm text-white/60 mb-6 flex-1">
                    <li className="flex items-center gap-2"><svg className="w-4 h-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Unlimited uploads</li>
                    <li className="flex items-center gap-2"><svg className="w-4 h-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>All 7 platforms</li>
                    <li className="flex items-center gap-2"><svg className="w-4 h-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>50 GB storage</li>
                    <li className="flex items-center gap-2"><svg className="w-4 h-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Up to 5 team members</li>
                  </ul>
                  <button
                    onClick={() => handleCheckout(billingPeriod === "annual" ? (process.env.NEXT_PUBLIC_STRIPE_TEAM_ANNUAL_PRICE_ID || "") : (process.env.NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID || ""))}
                    disabled={planLoading}
                    className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {planLoading ? "Loading..." : isResubscribe ? "Subscribe — Team" : "Start 7-day free trial"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active or trialing plan */}
          {(planStatus === "trialing" || planStatus === "active") && (() => {
            const timeSavedHrs = Math.round((postedCount * 5) / 60 * 10) / 10;
            const isAnnual = planBillingInterval === "year";
            const planPrice = planPriceAmount != null
              ? `$${(planPriceAmount / 100).toFixed(2).replace(/\.00$/, "")}`
              : plan === "team" ? (isAnnual ? "$199" : "$19.99") : (isAnnual ? "$98" : "$9.99");
            const planPriceLabel = isAnnual ? `${planPrice}/yr` : `${planPrice}/month`;
            const planStorage = plan === "team" ? "50 GB" : "25 GB";
            const isTrialing = planStatus === "trialing";
            const dateStr = isTrialing && trialEndsAt
              ? new Date(trialEndsAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
              : renewalDate
              ? new Date(renewalDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
              : null;
            return (
              <div className="space-y-3">
                {/* Plan header card */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-2 ${isTrialing ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                        {isTrialing ? (
                          <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{plan === "creator" ? "Creator" : plan === "team" ? "Team" : "Creator"} Plan</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${isTrialing ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                            {isTrialing ? "Trial" : "Active"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-sm text-white/40">
                          {planPriceLabel}
                          {dateStr && (
                            <span className="ml-2 text-white/25">·</span>
                          )}
                          {dateStr && (
                            <span className="ml-2">{isTrialing ? "Trial ends" : "Renews"} {dateStr}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {teamRole === "owner" && (
                      <button
                        onClick={handleManageSubscription}
                        disabled={planLoading}
                        className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors disabled:opacity-50"
                      >
                        {planLoading ? "Loading..." : "Manage"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                    <p className="text-2xl font-semibold text-white">{postedCount}</p>
                    <p className="mt-0.5 text-xs text-white/40">Posts published</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                    <p className="text-2xl font-semibold text-blue-300">{connectedCount}</p>
                    <p className="mt-0.5 text-xs text-white/40">Platforms active</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                    <p className="text-2xl font-semibold text-purple-300">{timeSavedHrs}h</p>
                    <p className="mt-0.5 text-xs text-white/40">Est. time saved</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                    <p className="text-2xl font-semibold text-white/80">{planStorage}</p>
                    <p className="mt-0.5 text-xs text-white/40">Storage included</p>
                  </div>
                </div>

                {/* Retention nudge */}
                {postedCount > 0 && (
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 flex items-start gap-3">
                    <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                    </svg>
                    <p className="text-sm text-white/50">
                      You&apos;ve published <span className="text-white/80 font-medium">{postedCount} post{postedCount !== 1 ? "s" : ""}</span> across <span className="text-white/80 font-medium">{connectedCount} platform{connectedCount !== 1 ? "s" : ""}</span> with Clip Dash — saving an estimated <span className="text-emerald-400 font-medium">{timeSavedHrs} hours</span> of manual work.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Canceled */}
          {planStatus === "canceled" && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-red-500/10 p-2">
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">Plan Canceled</div>
                    <div className="text-sm text-white/40 mt-0.5">Subscribe to continue scheduling posts</div>
                  </div>
                </div>
                <button
                  onClick={() => { setPlan("none"); setPlanStatus("inactive"); setIsResubscribe(true); }}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 transition-colors"
                >
                  Re-subscribe
                </button>
              </div>
            </div>
          )}
        </section>
        )}

        {activeTab === "connected" && (
        <section className="mt-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">Connected Accounts</h2>
            <button onClick={loadConnectedAccounts} className="text-xs text-white/40 hover:text-white/70 transition-colors">
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="space-y-2">
            {visiblePlatforms.map((platform) => {
              const accts = accounts[platform.key];
              const isConnected = accts.length > 0;
              const connectFns: Partial<Record<ProviderKey, () => void>> = {
                youtube: connectYouTube,
                tiktok: connectTikTok,
                facebook: connectFacebook,
                instagram: connectInstagram,
                linkedin: connectLinkedIn,
                threads: connectThreads,
                x: connectX,
              };
              const connectFn = connectFns[platform.key];
              const canManage = teamRole === "owner" || teamRole === "admin";
              return (
                <div key={platform.key} className={`rounded-2xl border transition-colors ${isConnected ? "border-white/[0.09] bg-white/[0.025]" : "border-white/[0.06] bg-white/[0.015]"}`}>
                  {/* Platform header row */}
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-xl p-2 ${isConnected ? "bg-white/[0.08] text-white" : "bg-white/[0.04] text-white/35"}`}>
                        {platform.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isConnected ? "text-white/90" : "text-white/50"}`}>{platform.name}</span>
                          <a
                            href={`/platforms/${platform.key}`}
                            title={`Learn more about ${platform.name}`}
                            className="text-white/20 hover:text-white/60 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                          {isConnected && (
                            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                              {accts.length > 1 ? `${accts.length} accounts` : "Connected"}
                            </span>
                          )}
                        </div>
                        {!isConnected && (
                          <p className="text-xs text-white/30 mt-0.5">{platform.description}</p>
                        )}
                      </div>
                    </div>
                    {canManage && platform.key !== "bluesky" && connectFn && (
                      <button
                        onClick={connectFn}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white/55 hover:bg-white/[0.08] hover:text-white/80 transition-colors"
                      >
                        {isConnected ? "+ Add account" : "Connect"}
                      </button>
                    )}
                  </div>

                  {/* Connected account rows */}
                  {accts.length > 0 && (
                    <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                      {accts.map((acct) => (
                        <div key={acct.id} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className="relative w-8 h-8 shrink-0">
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white/50">
                                {(acct.profileName || acct.label || "?")[0].toUpperCase()}
                              </div>
                              {proxiedAvatar(acct.avatarUrl) && (
                                <img
                                  src={proxiedAvatar(acct.avatarUrl)!}
                                  alt=""
                                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                                  className="absolute inset-0 w-8 h-8 rounded-full object-cover"
                                />
                              )}
                            </div>
                            {/* Name / edit */}
                            {editingName?.id === acct.id ? (
                              <form onSubmit={(e) => { e.preventDefault(); saveAccountName(acct.id, editingName.value); }} className="flex items-center gap-2">
                                <input
                                  autoFocus
                                  value={editingName.value}
                                  onChange={(e) => setEditingName({ id: acct.id, value: e.target.value })}
                                  onBlur={() => { if (editingName.value.trim()) saveAccountName(acct.id, editingName.value); else setEditingName(null); }}
                                  placeholder="Display name"
                                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-sm text-white placeholder-white/30 outline-none focus:border-blue-400/40 w-40"
                                />
                                <button type="submit" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Save</button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingName({ id: acct.id, value: acct.label || acct.profileName || "" })}
                                className="group flex items-center gap-1.5 text-sm text-white/70 hover:text-white/90 transition-colors text-left"
                              >
                                {acct.label || acct.profileName || <span className="text-white/25 italic text-xs">Add display name</span>}
                                <svg className="w-3 h-3 text-white/20 group-hover:text-white/40 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            )}
                          </div>
                          {canManage && (
                            <button
                              onClick={() => disconnectAccount(platform.key, acct.id)}
                              className="rounded-full border border-white/[0.08] bg-transparent px-3 py-1 text-xs text-white/35 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                            >
                              Disconnect
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bluesky form */}
                  {platform.key === "bluesky" && canManage && (
                    <div className={`${isConnected ? "border-t border-white/[0.06]" : ""} px-4 py-3`}>
                      {isConnected ? (
                        <details className="group">
                          <summary className="cursor-pointer text-xs text-white/35 hover:text-white/60 transition-colors list-none flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Add another Bluesky account
                          </summary>
                          <div className="mt-3 space-y-2">
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input type="text" placeholder="@you.bsky.social" value={blueskyHandle} onChange={(e) => setBlueskyHandle(e.target.value)} className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20" />
                              <input type="password" placeholder="App password" value={blueskyPassword} onChange={(e) => setBlueskyPassword(e.target.value)} className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20" />
                              <button onClick={connectBluesky} disabled={blueskyConnecting} className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/15 transition-colors disabled:opacity-50 whitespace-nowrap">{blueskyConnecting ? "Connecting…" : "Connect"}</button>
                            </div>
                            {blueskyError && <p className="text-xs text-red-400">{blueskyError}</p>}
                          </div>
                        </details>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-white/35">
                            Create an app password at{" "}
                            <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener noreferrer" className="text-white/55 underline underline-offset-2">bsky.app → Settings → App Passwords</a>
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input type="text" placeholder="@you.bsky.social" value={blueskyHandle} onChange={(e) => setBlueskyHandle(e.target.value)} className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20" />
                            <input type="password" placeholder="App password" value={blueskyPassword} onChange={(e) => setBlueskyPassword(e.target.value)} className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20" />
                            <button onClick={connectBluesky} disabled={blueskyConnecting} className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/15 transition-colors disabled:opacity-50 whitespace-nowrap">{blueskyConnecting ? "Connecting…" : "Connect"}</button>
                          </div>
                          {blueskyError && <p className="text-xs text-red-400">{blueskyError}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        )}

        {activeTab === "team" && (
        <section className="mt-0 space-y-5">
          {/* Section header */}
          <div>
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">Team Members</h2>
            <p className="text-xs text-white/30 mt-1">
              {teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""}
              {teamInvites.length > 0 && ` · ${teamInvites.length} pending invite${teamInvites.length !== 1 ? "s" : ""}`}
              {plan === "team" ? " · Team plan (up to 5)" : ""}
            </p>
          </div>

          {/* Members */}
          <div className="space-y-2">
            {teamMembers.map((member) => (
              <div key={member.userId} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-white/10 flex items-center justify-center text-sm font-semibold text-white/60 shrink-0">
                  {(member.email ?? "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/85 truncate">{member.email ?? "Unknown"}</p>
                  <p className="text-xs text-white/30 mt-0.5">
                    Joined {new Date(member.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${
                  member.role === "owner"
                    ? "border-white/20 bg-white/[0.07] text-white/60"
                    : member.role === "admin"
                    ? "border-blue-400/30 bg-blue-400/10 text-blue-300"
                    : "border-white/10 bg-white/[0.04] text-white/35"
                }`}>
                  {member.role === "owner" ? "Owner" : member.role === "admin" ? "Admin" : "Member"}
                </span>
                {teamRole === "owner" && member.role !== "owner" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleRoleToggle(member.userId, member.role)}
                      className="text-xs text-white/40 hover:text-white/70 border border-white/10 bg-white/[0.04] hover:bg-white/10 rounded-full px-2.5 py-1 transition-colors"
                    >
                      {member.role === "admin" ? "Demote" : "Promote"}
                    </button>
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      className="text-xs text-red-400/60 hover:text-red-400 border border-red-500/10 bg-red-500/[0.04] hover:bg-red-500/10 rounded-full px-2.5 py-1 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pending invites */}
          {teamInvites.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/25 px-1">Pending Invites</p>
              {teamInvites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-3 rounded-2xl border border-amber-400/[0.12] bg-amber-400/[0.03] px-4 py-3">
                  <div className="w-8 h-8 rounded-full border border-dashed border-white/15 bg-white/[0.02] flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-white/20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 0 1-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 0 0 1.183 1.981l6.478 3.488m8.839 2.51-4.66-2.51m0 0-1.023-.55a2.25 2.25 0 0 0-2.134 0l-1.022.55m0 0-4.661 2.51m16.5 1.615a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V8.844a2.25 2.25 0 0 1 1.183-1.981l7.5-4.039a2.25 2.25 0 0 1 2.134 0l7.5 4.039a2.25 2.25 0 0 1 1.183 1.98V19.5Z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/55 truncate">{invite.email}</p>
                    <p className="text-xs text-amber-400/50 mt-0.5">
                      Sent {new Date(invite.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <span className="text-[11px] border border-amber-400/20 bg-amber-400/[0.08] text-amber-300/60 rounded-full px-2 py-0.5 shrink-0">
                    Pending
                  </span>
                  {teamRole === "owner" && (
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      className="text-xs text-white/30 hover:text-white/55 border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] rounded-full px-2.5 py-1 transition-colors shrink-0"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Invite form (owner only) */}
          {teamRole === "owner" && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-4">
              <p className="text-xs font-medium text-white/35 uppercase tracking-wider mb-3">Invite a teammate</p>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setInviteError(null);
                    setInviteSuccess(null);
                  }}
                  placeholder="colleague@example.com"
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-white/20 transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
                <button
                  onClick={handleInvite}
                  disabled={inviteLoading || !inviteEmail.trim()}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors disabled:opacity-40 shrink-0"
                >
                  {inviteLoading ? "Sending…" : "Invite"}
                </button>
              </div>
              {inviteError && <p className="text-xs text-red-400 mt-2">{inviteError}</p>}
              {inviteSuccess && <p className="text-xs text-emerald-400 mt-2">{inviteSuccess}</p>}
            </div>
          )}
        </section>
        )}

        {activeTab === "notifications" && (
        <section className="mt-0">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Notifications</h2>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] divide-y divide-white/5">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Background hover spotlight</div>
                  <div className="text-sm text-white/40 mt-0.5">Light up the dark background as your mouse moves</div>
                </div>
                <button
                  onClick={() => updateHoverSpotlightPref(!hoverSpotlightEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${hoverSpotlightEnabled ? "bg-emerald-500" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${hoverSpotlightEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Post uploaded successfully</div>
                  <div className="text-sm text-white/40 mt-0.5">Get emailed when your post goes live</div>
                </div>
                <button
                  onClick={() => updateNotifPref("notify_post_success", !notifPrefs.notify_post_success)}
                  disabled={notifLoading}
                  className={`relative w-11 h-6 rounded-full transition-colors ${notifPrefs.notify_post_success ? "bg-emerald-500" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${notifPrefs.notify_post_success ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Post failed to upload</div>
                  <div className="text-sm text-white/40 mt-0.5">Get emailed when an upload fails</div>
                </div>
                <button
                  onClick={() => updateNotifPref("notify_post_failed", !notifPrefs.notify_post_failed)}
                  disabled={notifLoading}
                  className={`relative w-11 h-6 rounded-full transition-colors ${notifPrefs.notify_post_failed ? "bg-emerald-500" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${notifPrefs.notify_post_failed ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Platform needs reconnection</div>
                  <div className="text-sm text-white/40 mt-0.5">Get emailed when a platform account expires</div>
                </div>
                <button
                  onClick={() => updateNotifPref("notify_reconnect", !notifPrefs.notify_reconnect)}
                  disabled={notifLoading}
                  className={`relative w-11 h-6 rounded-full transition-colors ${notifPrefs.notify_reconnect ? "bg-emerald-500" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${notifPrefs.notify_reconnect ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            </div>
          </div>
        </section>
        )}

        {activeTab === "defaults" && (
        <section className="mt-0">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Upload Defaults</h2>
          <p className="text-sm text-white/40 mb-4">Set default settings per platform. These will auto-fill when you create a new upload.</p>

          {/* Platform tabs */}
          <div className="flex gap-2 mb-4">
            {(["youtube", "tiktok", "instagram"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setDefaultsTab(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  defaultsTab === p
                    ? "bg-white/10 border border-white/20 text-white"
                    : "bg-white/[0.03] border border-white/10 text-white/50 hover:text-white/70"
                }`}
              >
                {p === "youtube" ? "YouTube" : p === "tiktok" ? "TikTok" : "Instagram"}
              </button>
            ))}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-5">
            {/* YouTube defaults */}
            {defaultsTab === "youtube" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Category</label>
                  <select
                    value={getDefault("youtube", "category", "gaming")}
                    onChange={(e) => setDefaultField("youtube", "category", e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                  >
                    <option value="gaming" className="bg-neutral-900">Gaming</option>
                    <option value="entertainment" className="bg-neutral-900">Entertainment</option>
                    <option value="education" className="bg-neutral-900">Education</option>
                    <option value="music" className="bg-neutral-900">Music</option>
                    <option value="sports" className="bg-neutral-900">Sports</option>
                    <option value="news" className="bg-neutral-900">News & Politics</option>
                    <option value="howto" className="bg-neutral-900">How-to & Style</option>
                    <option value="travel" className="bg-neutral-900">Travel & Events</option>
                    <option value="autos" className="bg-neutral-900">Autos & Vehicles</option>
                    <option value="pets" className="bg-neutral-900">Pets & Animals</option>
                    <option value="comedy" className="bg-neutral-900">Comedy</option>
                    <option value="film" className="bg-neutral-900">Film & Animation</option>
                    <option value="science" className="bg-neutral-900">Science & Technology</option>
                    <option value="nonprofit" className="bg-neutral-900">Nonprofits & Activism</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Visibility</label>
                  <select
                    value={getDefault("youtube", "visibility", "private")}
                    onChange={(e) => setDefaultField("youtube", "visibility", e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                  >
                    <option value="private" className="bg-neutral-900">Private</option>
                    <option value="unlisted" className="bg-neutral-900">Unlisted</option>
                    <option value="public" className="bg-neutral-900">Public</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Notify subscribers</span>
                  <button
                    onClick={() => setDefaultField("youtube", "notifySubscribers", !getDefault("youtube", "notifySubscribers", true))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${getDefault("youtube", "notifySubscribers", true) ? "bg-emerald-500" : "bg-white/10"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${getDefault("youtube", "notifySubscribers", true) ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Allow comments</span>
                  <button
                    onClick={() => setDefaultField("youtube", "allowComments", !getDefault("youtube", "allowComments", true))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${getDefault("youtube", "allowComments", true) ? "bg-emerald-500" : "bg-white/10"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${getDefault("youtube", "allowComments", true) ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Allow embedding</span>
                  <button
                    onClick={() => setDefaultField("youtube", "allowEmbedding", !getDefault("youtube", "allowEmbedding", true))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${getDefault("youtube", "allowEmbedding", true) ? "bg-emerald-500" : "bg-white/10"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${getDefault("youtube", "allowEmbedding", true) ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Made for kids</span>
                  <button
                    onClick={() => setDefaultField("youtube", "madeForKids", !getDefault("youtube", "madeForKids", false))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${getDefault("youtube", "madeForKids", false) ? "bg-emerald-500" : "bg-white/10"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${getDefault("youtube", "madeForKids", false) ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
              </div>
            )}

            {/* TikTok defaults */}
            {defaultsTab === "tiktok" && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-5">
                <p className="text-sm text-white/60">TikTok requires creators to manually choose privacy, comments, duet, stitch, and music usage settings on every upload. These cannot be saved as defaults per TikTok&apos;s platform policy.</p>
                <p className="text-xs text-white/30 mt-2">All interaction settings default to off. You&apos;ll be prompted to configure each setting when you schedule a TikTok post.</p>
              </div>
            )}

            {/* Instagram defaults */}
            {defaultsTab === "instagram" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Default type</label>
                  <div className="flex gap-2">
                    {(["post", "reel", "story"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setDefaultField("instagram", "igType", type)}
                        className={`flex-1 rounded-lg py-2 text-sm capitalize ${
                          getDefault("instagram", "igType", "reel") === type
                            ? "bg-white/10 border border-white/20"
                            : "bg-white/5 border border-white/10"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Default first comment</label>
                  <input
                    type="text"
                    value={getDefault("instagram", "firstComment", "")}
                    onChange={(e) => setDefaultField("instagram", "firstComment", e.target.value)}
                    placeholder="Auto-posted as first comment..."
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20 placeholder:text-white/30"
                  />
                </div>
              </div>
            )}

            {/* Save button */}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => savePlatformDefault(defaultsTab)}
                disabled={defaultsSaving}
                className="rounded-lg bg-white/10 border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/15 transition-colors disabled:opacity-50"
              >
                {defaultsSaving ? "Saving..." : "Save defaults"}
              </button>
              {defaultsSaved && (
                <span className="text-sm text-emerald-400">Saved!</span>
              )}
            </div>
          </div>
        </section>
        )}

        {activeTab === "queue" && (
          <section className="mt-0 space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-1 text-base font-semibold text-white">Queue Schedule</div>
              {queueSchedule.slots.length > 0 ? (
                <p className="mb-1 text-sm text-white/50">
                  You have{" "}<span className="font-medium text-white">{queueSchedule.slots.reduce((n, s) => n + s.days.filter(Boolean).length, 0)}</span>{" "}slots per week.
                </p>
              ) : (
                <p className="mb-1 text-sm text-white/50">No slots configured yet. Add a time below to get started.</p>
              )}
              <p className="mb-4 text-xs text-white/30">Editing your schedule won&apos;t affect posts that are already scheduled.</p>
              <p className="mb-5 text-xs text-white/40">Timezone: <span className="text-white/60">{queueSchedule.timezone}</span></p>

              {queueSchedule.slots.length > 0 && (
                <div className="mb-5 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr>
                        <th className="w-32 pb-3 pr-6 text-left text-xs font-medium text-white/40">Time</th>
                        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
                          <th key={d} className="w-10 pb-3 text-center text-xs font-medium text-white/40">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {queueSchedule.slots.map(slot => (
                        <tr key={slot.id}>
                          <td className="py-3 pr-6">
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => removeQueueSlot(slot.id)} className="flex h-5 w-5 items-center justify-center rounded-full text-lg leading-none text-white/20 transition-colors hover:bg-red-500/10 hover:text-red-400" title="Remove">×</button>
                              <span className="tabular-nums font-medium text-white/80">{formatQueueTime(slot.time)}</span>
                            </div>
                          </td>
                          {slot.days.map((active, i) => (
                            <td key={i} className="py-3 text-center">
                              <button type="button" onClick={() => toggleQueueDay(slot.id, i)} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/5 transition-colors">
                                {active ? (
                                  <svg className="h-6 w-6 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                  </svg>
                                ) : (
                                  <span className="block h-5 w-5 rounded-full border border-white/15" />
                                )}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <input type="time" value={newSlotTime} onChange={e => setNewSlotTime(e.target.value)} className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-blue-300/40" />
                <button type="button" onClick={addQueueSlot} className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add time
                </button>
                {queueSaving && <span className="animate-pulse text-xs text-white/30">Saving…</span>}
              </div>

              {/* Suggested times */}
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <p className="mb-2.5 text-xs text-white/30">Suggested times — based on peak engagement across platforms</p>
                <div className="flex flex-wrap gap-2">
                  {RECOMMENDED_TIMES.map(r => {
                    const alreadyAdded = queueSchedule.slots.some(s => s.time === r.time);
                    return (
                      <button
                        key={r.time}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => {
                          if (alreadyAdded) return;
                          const updated: QueueScheduleConfig = { ...queueSchedule, slots: [...queueSchedule.slots, { id: crypto.randomUUID(), time: r.time, days: r.days }].sort((a, b) => a.time.localeCompare(b.time)) };
                          setQueueSchedule(updated); saveQueueSchedule(updated);
                        }}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${alreadyAdded ? "border-white/[0.06] bg-white/[0.02] text-white/20 cursor-default" : "border-white/10 bg-white/[0.03] text-white/50 hover:border-blue-400/30 hover:bg-blue-400/[0.06] hover:text-blue-300"}`}
                      >
                        {alreadyAdded ? (
                          <svg className="w-3 h-3 text-emerald-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m4.5 12.75 6 6 9-13.5" /></svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        )}
                        <span className="font-medium">{r.label}</span>
                        <span className="text-white/25">{r.note}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <div className="text-sm font-semibold text-white">Randomize posting time</div>
                  <div className="mt-1 text-xs text-white/50">Vary each post by up to 10 minutes so they don&apos;t always go out at the exact same time.</div>
                </div>
                <button type="button" role="switch" aria-checked={queueSchedule.randomize} onClick={toggleQueueRandomize} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${queueSchedule.randomize ? "bg-blue-500" : "bg-white/15"}`}>
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${queueSchedule.randomize ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === "danger" && (
        <section className="mt-0">
          <h2 className="text-sm font-medium text-red-400/60 uppercase tracking-wider mb-4">Danger Zone</h2>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] divide-y divide-white/5">
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
                  onClick={() => { setDeleteConfirmText(""); setDeleteError(null); setShowDeleteModal(true); }}
                  className="rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </section>
        )}

          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-xs text-white/30">
            Clip Dash v0.1.0
          </p>
        </div>
      </div>

      {/* Delete account modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-red-500/20 bg-[#0e0e0e] p-6 shadow-2xl">
            {/* Icon */}
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>

            <h2 className="text-lg font-semibold text-white text-center">Delete your account</h2>
            <p className="mt-2 text-sm text-white/50 text-center">
              This will permanently delete your account, all scheduled posts, uploaded videos, team, and billing data. <span className="text-white/70 font-medium">This cannot be undone.</span>
            </p>

            <div className="mt-5 rounded-xl border border-white/5 bg-white/[0.03] p-4 space-y-1 text-sm text-white/40">
              <div className="flex items-center gap-2"><span className="text-red-400">✕</span> All scheduled and posted content</div>
              <div className="flex items-center gap-2"><span className="text-red-400">✕</span> All connected platform accounts</div>
              <div className="flex items-center gap-2"><span className="text-red-400">✕</span> Your team and all members</div>
              <div className="flex items-center gap-2"><span className="text-red-400">✕</span> Your subscription (not refunded)</div>
            </div>

            <div className="mt-5">
              <label className="block text-sm text-white/50 mb-2">
                Type <span className="font-mono font-semibold text-white/80">DELETE MY ACCOUNT</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteError(null); }}
                placeholder="DELETE MY ACCOUNT"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-red-500/40 transition-colors font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              {deleteError && (
                <p className="mt-2 text-sm text-red-400">{deleteError}</p>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
                className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={deleteConfirmText !== "DELETE MY ACCOUNT" || deleteLoading}
                onClick={async () => {
                  setDeleteLoading(true);
                  setDeleteError(null);
                  try {
                    const { data: sess } = await supabase.auth.getSession();
                    const token = sess.session?.access_token;
                    if (!token) { setDeleteError("Session expired. Please refresh and try again."); setDeleteLoading(false); return; }
                    const res = await fetch("/api/account/delete", {
                      method: "DELETE",
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    const json = await res.json();
                    if (res.ok && json.ok) {
                      await supabase.auth.signOut();
                      window.location.href = "/login";
                    } else {
                      setDeleteError(json.error || "Failed to delete account. Please try again.");
                      setDeleteLoading(false);
                    }
                  } catch (e: any) {
                    setDeleteError(e?.message || "Failed to delete account. Please try again.");
                    setDeleteLoading(false);
                  }
                }}
                className="flex-1 rounded-full bg-red-500/80 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {deleteLoading ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}




