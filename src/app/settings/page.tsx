// src/app/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/login/supabaseClient";
import Link from "next/link";

type ProviderKey = "youtube" | "tiktok" | "instagram" | "facebook";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

async function safeReadJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();

  // Try JSON only if content-type looks like JSON
  if (ct.includes("application/json")) {
    try {
      return { ok: true, json: JSON.parse(text), raw: text };
    } catch {
      return { ok: false, json: null, raw: text };
    }
  }

  // Not JSON: return raw HTML/text
  return { ok: false, json: null, raw: text };
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [debug, setDebug] = useState<string>("");

  const [connected, setConnected] = useState<Record<ProviderKey, boolean>>({
    youtube: false,
    tiktok: false,
    instagram: false,
    facebook: false,
  });

  const query = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const banner = useMemo(() => {
    const yt = query.get("youtube");
    const reason = query.get("reason");
    if (!yt) return null;
    if (yt === "connected") return { kind: "success" as const, text: "YouTube connected ✅" };
    if (yt === "error")
      return {
        kind: "error" as const,
        text: `YouTube connection failed: ${reason || "Unknown error"}`,
      };
    return null;
  }, [query]);

  async function loadConnectedAccounts() {
    setLoading(true);
    setDebug("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const email = sess.session?.user?.email ?? null;
      setSessionEmail(email);

      if (!token) {
        setConnected({ youtube: false, tiktok: false, instagram: false, facebook: false });
        setDebug("No session token found (not logged in).");
        return;
      }

      const res = await fetch("/api/platform-accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { ok, json, raw } = await safeReadJson(res);
      if (!res.ok) {
        setDebug(`GET /api/platform-accounts failed ${res.status}. Body: ${raw.slice(0, 200)}`);
        return;
      }
      if (!ok || !json?.ok) {
        setDebug(`GET /api/platform-accounts returned non-json or error. Body: ${raw.slice(0, 200)}`);
        return;
      }

      const rows = (json.data || []) as Array<{ provider?: string }>;
      const next: Record<ProviderKey, boolean> = {
        youtube: false,
        tiktok: false,
        instagram: false,
        facebook: false,
      };

      for (const r of rows) {
        const p = (r.provider || "").toLowerCase();
        if (p === "youtube") next.youtube = true;
        if (p === "tiktok") next.tiktok = true;
        if (p === "instagram") next.instagram = true;
        if (p === "facebook") next.facebook = true;
      }

      setConnected(next);
      setDebug(`Loaded ${rows.length} connected account rows.`);
    } catch (e: any) {
      console.error(e);
      setDebug(`Load error: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function connectYouTube() {
    setDebug("Connect clicked…");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      if (!token) {
        alert("Please log in first.");
        setDebug("No token: user not logged in.");
        return;
      }

      setDebug("Calling POST /api/auth/youtube/start …");

      const res = await fetch("/api/auth/youtube/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const { ok, json, raw } = await safeReadJson(res);

      if (!res.ok) {
        setDebug(`START failed ${res.status}. Body starts: ${raw.slice(0, 200)}`);
        alert(`YouTube connect failed (status ${res.status}). Check Debug box.`);
        return;
      }

      if (!ok || !json?.ok || !json?.url) {
        setDebug(`START returned non-json or missing url. Body starts: ${raw.slice(0, 200)}`);
        alert("YouTube connect start did not return a url. Check Debug box.");
        return;
      }

      setDebug("Redirecting to Google OAuth…");
      window.location.href = json.url;
    } catch (e: any) {
      console.error(e);
      setDebug(`Connect error: ${e?.message || e}`);
      alert(e?.message || "Connect failed");
    }
  }

  useEffect(() => {
    loadConnectedAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = [
    {
      key: "youtube" as const,
      name: "YouTube",
      desc: "Upload videos + Shorts to the user’s channel (OAuth).",
      connected: connected.youtube,
      onClick: connected.youtube ? undefined : connectYouTube,
      actionText: connected.youtube ? "Connected" : "Connect",
    },
    { key: "tiktok" as const, name: "TikTok", desc: "Connect TikTok account to schedule posts.", connected: false },
    { key: "instagram" as const, name: "Instagram", desc: "Connect IG to schedule Reels/posts.", connected: false },
    { key: "facebook" as const, name: "Facebook", desc: "Connect Facebook to schedule video posts.", connected: false },
  ];

  return (
    <div className="min-h-screen bg-[#050B18] text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-white/60 mt-1">
              Connect platforms so Clip Scheduler can upload to the user’s accounts.
            </p>
            {sessionEmail ? (
              <p className="text-xs text-white/40 mt-2">Signed in as {sessionEmail}</p>
            ) : (
              <p className="text-xs text-white/40 mt-2">
                Not signed in.{" "}
                <Link className="underline text-white/70" href="/login">
                  Go to login
                </Link>
              </p>
            )}
          </div>

          <button
            onClick={loadConnectedAccounts}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {banner && (
          <div
            className={cx(
              "mt-6 rounded-2xl border p-4 text-sm",
              banner.kind === "success" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
              banner.kind === "error" && "border-red-400/30 bg-red-400/10 text-red-100"
            )}
          >
            {banner.text}
          </div>
        )}

        {debug ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
            Debug: {debug}
          </div>
        ) : null}

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-white/80">Connected accounts</h2>
          <p className="text-xs text-white/45 mt-1">
            YouTube is first. TikTok/IG/Facebook will be added next.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {cards.map((c) => (
              <div key={c.key} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">{c.name}</h3>
                      <span
                        className={cx(
                          "rounded-full px-2 py-0.5 text-[11px] border",
                          c.connected
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                            : "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
                        )}
                      >
                        {c.connected ? "Connected" : "Not connected"}
                      </span>
                    </div>
                    <p className="text-sm text-white/60 mt-2">{c.desc}</p>
                  </div>

                  {c.key === "youtube" ? (
                    <button
                      onClick={c.onClick}
                      disabled={c.connected}
                      className={cx(
                        "rounded-xl px-4 py-2 text-sm font-medium border",
                        c.connected
                          ? "border-white/10 bg-white/5 text-white/50 cursor-not-allowed"
                          : "border-white/10 bg-white/10 hover:bg-white/15"
                      )}
                    >
                      {c.actionText}
                    </button>
                  ) : (
                    <button
                      disabled
                      className="rounded-xl px-4 py-2 text-sm font-medium border border-white/10 bg-white/5 text-white/50 cursor-not-allowed"
                    >
                      Coming soon
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
