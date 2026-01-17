"use client";

import { useEffect, useMemo, useState } from "react";

type ScheduledPost = {
  id: string;
  platform: string;
  title: string;
  description: string;
  tags: string[];
  asset_url: string;
  scheduled_for: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export default function SchedulerPage() {
  const [rows, setRows] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [workerResult, setWorkerResult] = useState<any>(null);

  const [platform, setPlatform] = useState("youtube");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("test");
  const [tags, setTags] = useState("scheduler, test");
  const [assetUrl, setAssetUrl] = useState("https://example.com/video.mp4");
  const [scheduledFor, setScheduledFor] = useState(() => {
    // default to now (local)
    const d = new Date();
    d.setMinutes(d.getMinutes() + 1);
    return d.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
  });

  const tagsArr = useMemo(
    () =>
      tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tags]
  );

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/scheduled-posts", { cache: "no-store" });
      const json = await res.json();
      setRows(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function createPost() {
    setLoading(true);
    try {
      // Convert local datetime-local to ISO
      const iso = new Date(scheduledFor).toISOString();

      const res = await fetch("/api/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          title,
          description,
          tags: tagsArr,
          assetUrl,
          scheduledFor: iso,
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        alert(json.error ?? "Failed to create post");
        return;
      }

      setTitle("");
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function runWorker() {
    setLoading(true);
    try {
      const res = await fetch("/api/cron/run-worker", { cache: "no-store" });
      const json = await res.json();
      setWorkerResult(json);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
        Scheduler
      </h1>

      <section
        style={{
          padding: 16,
          border: "1px solid #333",
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Create scheduled post
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            Platform
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 6 }}
            >
              <option value="youtube">YouTube</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="x">X</option>
            </select>
          </label>

          <label>
            Scheduled For (local)
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My clip title"
              style={{ width: "100%", padding: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Asset URL (stub)
            <input
              value={assetUrl}
              onChange={(e) => setAssetUrl(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Tags (comma-separated)
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 6 }}
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 6 }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={createPost} disabled={loading} style={{ padding: "8px 12px" }}>
            Create
          </button>
          <button onClick={refresh} disabled={loading} style={{ padding: "8px 12px" }}>
            Refresh
          </button>
          <button onClick={runWorker} disabled={loading} style={{ padding: "8px 12px" }}>
            Run worker
          </button>
        </div>

        {workerResult && (
          <pre style={{ marginTop: 12, background: "#111", padding: 12, borderRadius: 8 }}>
            {JSON.stringify(workerResult, null, 2)}
          </pre>
        )}
      </section>

      <section
        style={{
          padding: 16,
          border: "1px solid #333",
          borderRadius: 12,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Scheduled posts
        </h2>

        {loading && <div>Loading…</div>}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["status", "platform", "title", "scheduled_for", "asset_url", "error"].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{r.status}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{r.platform}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{r.title}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    {new Date(r.scheduled_for).toLocaleString()}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{r.asset_url}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{r.error ?? ""}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, opacity: 0.8 }}>
                    No scheduled posts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
