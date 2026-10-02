"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/login/supabaseClient";
import YouTubeChannelIdentity from "@/components/YouTubeChannelIdentity";
import type { YouTubeIdentity } from "@/lib/youtubeIdentity";

type Preview = { identity: YouTubeIdentity; reconnect: boolean; returnPath: string; expiresAt: string };

export default function ConfirmYouTubePage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState("");

  async function request(path: string, body?: object) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Please sign in to the ClipDash account that started this connection, then return here.");
    const res = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store",
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Could not complete the YouTube connection.");
    return json;
  }

  async function load(id: string) {
    setError("");
    try {
      const result = await request(`/api/auth/youtube/pending?attempt=${encodeURIComponent(id)}`);
      if (result.status === "confirmed") { window.location.replace(result.redirectPath); return; }
      setPreview(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load connection."); }
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("attempt") || "";
    setAttempt(id);
    void load(id);
    // Loading once avoids consuming or changing the pending connection on rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(action: "confirm" | "cancel" | "choose") {
    setBusy(true); setError("");
    try {
      const result = await request(`/api/auth/youtube/${action === "confirm" ? "confirm" : "cancel"}`, { attemptId: attempt });
      if (action === "choose" && result.status !== "confirmed") {
        const next = await request("/api/auth/youtube/start", { returnPath: preview?.returnPath || "/settings" });
        window.location.assign(next.url);
      } else window.location.assign(result.redirectPath);
    } catch (e) { setError(e instanceof Error ? e.message : "Connection failed."); setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white px-5 py-16">
      <section className="max-w-lg mx-auto rounded-3xl border border-white/10 bg-white/[0.03] p-7">
        <h1 className="text-2xl font-semibold">Confirm your YouTube channel</h1>
        <p className="text-sm text-white/60 mt-3">Google may show an older Brand Account name. This is the current channel authorized by Google. Connecting it does not publish a video.</p>
        {error && <p role="alert" className="mt-5 text-sm text-red-300">{error}</p>}
        {!preview && !error && <p role="status" className="mt-5 text-white/60">Loading channel…</p>}
        {preview && <>
          <div className="flex items-center gap-4 my-7">
            {preview.identity.avatarUrl && <img src={preview.identity.avatarUrl} alt="" className="w-14 h-14 rounded-full" onError={e => { e.currentTarget.style.display = "none"; }} />}
            <div><h2 className="text-lg font-medium">{preview.identity.title}</h2><YouTubeChannelIdentity identity={{ ...preview.identity, verifiedAt: preview.expiresAt }} /></div>
          </div>
          <details className="text-xs text-white/50 mb-6"><summary className="cursor-pointer">Channel details</summary><p className="mt-2 break-all">{preview.identity.channelId}</p></details>
          <div className="flex flex-col gap-3">
            <button disabled={busy} onClick={() => act("confirm")} className="rounded-full bg-blue-600 hover:bg-blue-500 px-5 py-3 text-sm disabled:opacity-50">{busy ? "Working…" : preview.reconnect ? "Reconnect this channel" : "Connect this channel"}</button>
            <button disabled={busy} onClick={() => act("choose")} className="rounded-full border border-white/20 px-5 py-3 text-sm disabled:opacity-50">Choose another account</button>
            <button disabled={busy} onClick={() => act("cancel")} className="text-sm text-white/60 py-2 disabled:opacity-50">Cancel</button>
          </div>
        </>}
        {!preview && error && <div className="flex gap-5 mt-6 text-sm"><button onClick={() => load(attempt)} className="underline">Try again</button><a href="/login" className="underline">Sign in</a><a href="/settings" className="underline">Back to settings</a></div>}
      </section>
    </main>
  );
}
