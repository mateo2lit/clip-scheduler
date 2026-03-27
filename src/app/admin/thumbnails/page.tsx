"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/app/login/supabaseClient";

type UploadRow = {
  id: string;
  file_path: string;
  bucket: string;
  team_id: string | null;
  user_id: string;
  thumbnail_path: string | null;
};

type Result = {
  uploadId: string;
  title: string;
  status: "pending" | "processing" | "done" | "failed" | "skipped";
  error?: string;
};

export default function ThumbnailBackfillPage() {
  const [token, setToken] = useState("");
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [days, setDays] = useState(30);
  const abortRef = useRef(false);

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) { window.location.href = "/login"; return; }
      setToken(auth.session.access_token);
    }
    load();
  }, []);

  async function fetchUploads() {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data } = await supabase
      .from("uploads")
      .select("id, file_path, bucket, team_id, user_id, thumbnail_path")
      .is("thumbnail_path", null)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });
    return (data ?? []) as UploadRow[];
  }

  async function extractFrame(videoUrl: string): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.src = videoUrl;

      const timeout = setTimeout(() => {
        video.src = "";
        resolve(null);
      }, 20000);

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration * 0.1);
      };

      video.onseeked = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement("canvas");
          const maxDim = 640;
          const ratio = Math.min(maxDim / video.videoWidth, maxDim / video.videoHeight, 1);
          canvas.width = Math.round(video.videoWidth * ratio);
          canvas.height = Math.round(video.videoHeight * ratio);
          const ctx = canvas.getContext("2d");
          if (!ctx) { video.src = ""; resolve(null); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            video.src = "";
            resolve(blob);
          }, "image/jpeg", 0.82);
        } catch {
          video.src = "";
          resolve(null);
        }
      };

      video.onerror = () => {
        clearTimeout(timeout);
        video.src = "";
        resolve(null);
      };
    });
  }

  async function run() {
    abortRef.current = false;
    setRunning(true);
    setDone(false);

    const rows = await fetchUploads();
    setUploads(rows);

    if (rows.length === 0) {
      setRunning(false);
      setDone(true);
      return;
    }

    setResults(rows.map(r => ({ uploadId: r.id, title: r.file_path.split("/").pop() ?? r.id, status: "pending" })));

    for (let i = 0; i < rows.length; i++) {
      if (abortRef.current) break;
      const row = rows[i];
      const title = row.file_path.split("/").pop() ?? row.id;

      setResults(prev => prev.map(r => r.uploadId === row.id ? { ...r, status: "processing" } : r));

      try {
        // Get a signed URL for the video
        const { data: signed, error: signErr } = await supabase.storage
          .from(row.bucket || "clips")
          .createSignedUrl(row.file_path, 120);

        if (signErr || !signed?.signedUrl) throw new Error("Could not get signed URL");

        const blob = await extractFrame(signed.signedUrl);
        if (!blob) throw new Error("Frame extraction failed");

        // Upload thumbnail
        const prefix = row.team_id || row.user_id;
        const thumbKey = `${prefix}/thumbnails/${Date.now()}-backfill.jpg`;
        const { error: upErr } = await supabase.storage
          .from(row.bucket || "clips")
          .upload(thumbKey, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
        if (upErr) throw new Error(upErr.message);

        // Update DB via API route
        const res = await fetch("/api/admin/set-thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uploadId: row.id, thumbnailPath: thumbKey }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "DB update failed");
        }

        setResults(prev => prev.map(r => r.uploadId === row.id ? { ...r, status: "done" } : r));
      } catch (e: any) {
        setResults(prev => prev.map(r => r.uploadId === row.id ? { ...r, status: "failed", error: e?.message } : r));
      }
    }

    setRunning(false);
    setDone(true);
  }

  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const processed = (counts.done ?? 0) + (counts.failed ?? 0);

  return (
    <main className="min-h-screen bg-[#050505] text-white px-8 py-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Thumbnail Backfill</h1>
      <p className="text-white/40 text-sm mb-8">
        Generates thumbnails for existing uploads that don&apos;t have one. Processes videos in your browser — keep this tab open while it runs.
      </p>

      <div className="flex items-center gap-4 mb-8">
        <label className="text-sm text-white/60">
          Last{" "}
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="bg-white/10 border border-white/10 rounded px-2 py-0.5 text-white text-sm mx-1"
            disabled={running}
          >
            {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
          of uploads
        </label>
        {!running && (
          <button
            onClick={run}
            className="rounded-full bg-white text-black text-sm font-semibold px-5 py-2 hover:bg-white/90 transition-colors"
          >
            {done && results.length > 0 ? "Run again" : "Generate thumbnails"}
          </button>
        )}
        {running && (
          <button
            onClick={() => { abortRef.current = true; }}
            className="rounded-full border border-white/20 text-white/60 text-sm px-5 py-2 hover:border-white/40 transition-colors"
          >
            Stop
          </button>
        )}
      </div>

      {results.length > 0 && (
        <>
          {running && (
            <div className="mb-4">
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${results.length > 0 ? (processed / results.length) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-white/40 mt-1">{processed} / {results.length}</p>
            </div>
          )}

          {done && (
            <p className="text-sm text-white/60 mb-4">
              Done — {counts.done ?? 0} succeeded, {counts.failed ?? 0} failed
            </p>
          )}

          <div className="space-y-1">
            {results.map(r => (
              <div key={r.uploadId} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  r.status === "done" ? "bg-green-400" :
                  r.status === "failed" ? "bg-red-400" :
                  r.status === "processing" ? "bg-amber-400 animate-pulse" :
                  "bg-white/20"
                }`} />
                <span className="text-sm text-white/70 flex-1 truncate">{r.title}</span>
                {r.status === "failed" && r.error && (
                  <span className="text-[10px] text-red-400/70 truncate max-w-[200px]">{r.error}</span>
                )}
                <span className="text-[10px] text-white/30 shrink-0 capitalize">{r.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {done && results.length === 0 && (
        <p className="text-white/40 text-sm">No uploads found without thumbnails in the last {days} days.</p>
      )}
    </main>
  );
}
