"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type PlatformKey = "youtube" | "tiktok" | "instagram";

const PLATFORM_OPTIONS: { key: PlatformKey; label: string }[] = [
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
];

// IMPORTANT: must match your Supabase Storage bucket name
const STORAGE_BUCKET = "uploads";

type UploadRow = {
  id: string;
  file_name: string;
  file_path: string;
  public_url: string;
  title: string | null;
  description: string | null;
  created_at: string | null;
};

type ScheduledRow = {
  id: string;
  upload_id: string | null;
  status: string | null;
  scheduled_for: string;
  platforms: any;
  created_at: string | null;
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normalizePlatforms(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

function fmtWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function toIsoFromDatetimeLocal(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function statusPill(status: "draft" | "scheduled" | "posted") {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]";
  if (status === "draft")
    return `${base} bg-slate-500/15 text-slate-300 border-slate-500/30`;
  if (status === "scheduled")
    return `${base} bg-sky-500/15 text-sky-300 border-sky-500/30`;
  return `${base} bg-emerald-500/15 text-emerald-300 border-emerald-500/30`;
}

export default function UploadsPage() {
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [statusByUploadId, setStatusByUploadId] = useState<Record<string, "draft" | "scheduled" | "posted">>({});
  const [metaByUploadId, setMetaByUploadId] = useState<Record<string, { when?: string; platforms?: string[] }>>({});

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<UploadRow | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [platforms, setPlatforms] = useState<Record<PlatformKey, boolean>>({
    youtube: true,
    tiktok: false,
    instagram: false,
  });
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // deletion
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectedPlatforms = useMemo(() => {
    return (Object.keys(platforms) as PlatformKey[]).filter((k) => platforms[k]);
  }, [platforms]);

  async function loadData() {
    setLoading(true);
    setDeleteError(null);

    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) {
      window.location.href = "/login";
      return;
    }

    // 1) uploads
    const up = await supabase
      .from("uploads")
      .select("id, file_name, file_path, public_url, title, description, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (up.error) {
      setLoading(false);
      setDeleteError(up.error.message);
      return;
    }

    const upRows = (up.data ?? []) as UploadRow[];
    setUploads(upRows);

    // 2) scheduled_posts for status mapping (latest per upload_id)
    const sp = await supabase
      .from("scheduled_posts")
      .select("id, upload_id, status, scheduled_for, platforms, created_at")
      .not("upload_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    const statusMap: Record<string, "draft" | "scheduled" | "posted"> = {};
    const metaMap: Record<string, { when?: string; platforms?: string[] }> = {};

    // default all uploads to draft
    for (const u of upRows) statusMap[u.id] = "draft";

    if (!sp.error && sp.data) {
      const rows = sp.data as ScheduledRow[];
      for (const r of rows) {
        const uid = r.upload_id;
        if (!uid) continue;

        // Only set if we haven't set a stronger state yet.
        // Priority: posted > scheduled > draft
        const current = statusMap[uid] ?? "draft";
        const incoming =
          r.status === "posted" ? "posted" : r.status === "scheduled" ? "scheduled" : current;

        if (incoming === "posted") {
          statusMap[uid] = "posted";
        } else if (incoming === "scheduled" && current !== "posted") {
          statusMap[uid] = "scheduled";
        }

        if (!metaMap[uid]) {
          metaMap[uid] = {
            when: r.scheduled_for,
            platforms: normalizePlatforms(r.platforms),
          };
        }
      }
    }

    setStatusByUploadId(statusMap);
    setMetaByUploadId(metaMap);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openSchedule(u: UploadRow) {
    setSelected(u);
    setScheduleTime("");
    setPlatforms({ youtube: true, tiktok: false, instagram: false });
    setScheduleError(null);
    setModalOpen(true);
  }

  async function scheduleSelected() {
    setScheduleError(null);
    if (!selected) return;

    const whenIso = toIsoFromDatetimeLocal(scheduleTime);
    if (!whenIso) {
      setScheduleError("Pick a date/time.");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setScheduleError("Pick at least one platform.");
      return;
    }

    setScheduling(true);
    try {
      const insert = await supabase
        .from("scheduled_posts")
        .insert({
          upload_id: selected.id,
          upload_title: (selected.title || selected.file_name || "Untitled").trim(),
          upload_file_name: selected.file_name,
          scheduled_for: whenIso,
          platforms: selectedPlatforms,
          status: "scheduled",
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insert.error) throw new Error(insert.error.message);

      setModalOpen(false);
      setSelected(null);
      await loadData();
    } catch (e: any) {
      setScheduleError(String(e?.message ?? e));
    } finally {
      setScheduling(false);
    }
  }

  async function deleteUpload(u: UploadRow) {
    const ok = window.confirm(
      "Delete this upload?\n\nThis will remove the file from Storage and delete the upload record."
    );
    if (!ok) return;

    setDeleteError(null);
    setDeletingId(u.id);

    try {
      // 1) delete from storage (best-effort)
      const rm = await supabase.storage.from(STORAGE_BUCKET).remove([u.file_path]);
      if (rm.error) {
        // If bucket name is wrong or file missing, this will error.
        // We'll show it so you know what's wrong.
        throw new Error(rm.error.message);
      }

      // 2) delete row from uploads table
      const del = await supabase.from("uploads").delete().eq("id", u.id);
      if (del.error) throw new Error(del.error.message);

      // 3) refresh
      await loadData();
    } catch (e: any) {
      setDeleteError(String(e?.message ?? e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* subtle glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-140px] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute left-[12%] top-[320px] h-[320px] w-[520px] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400">Clip Scheduler</div>
            <h1 className="text-2xl font-semibold tracking-tight">Upload library</h1>
            <p className="mt-1 text-sm text-slate-400">
              View uploads, schedule later, or delete.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm hover:bg-slate-900"
            >
              Dashboard
            </Link>
            <Link
              href="/upload"
              className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
            >
              + Upload new video
            </Link>
          </div>
        </div>

        {deleteError ? (
          <div className="mt-6 rounded-2xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {deleteError}
          </div>
        ) : null}

        {/* List */}
        <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/60">
          {loading ? (
            <div className="px-5 py-6 text-sm text-slate-400">Loading…</div>
          ) : uploads.length === 0 ? (
            <div className="px-5 py-8">
              <div className="text-sm font-medium text-slate-200">No uploads yet</div>
              <div className="text-sm text-slate-400 mt-1">
                Upload a video to start building your library.
              </div>
              <div className="mt-4">
                <Link
                  href="/upload"
                  className="inline-flex rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                >
                  + Upload
                </Link>
              </div>
            </div>
          ) : (
            <div>
              {uploads.map((u, idx) => {
                const st = statusByUploadId[u.id] ?? "draft";
                const meta = metaByUploadId[u.id];
                const pillClass = statusPill(st);

                return (
                  <div
                    key={u.id}
                    className={clsx(
                      "px-5 py-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between",
                      idx === 0 ? "" : "border-t border-slate-800"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-slate-100 truncate">
                          {u.title || u.file_name || "Untitled"}
                        </div>
                        <span className={pillClass}>
                          {st === "draft" ? "Draft" : st === "scheduled" ? "Scheduled" : "Posted"}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        Uploaded:{" "}
                        <span className="text-slate-200">
                          {u.created_at ? fmtWhen(u.created_at) : "—"}
                        </span>
                      </div>

                      {meta?.when ? (
                        <div className="mt-1 text-xs text-slate-500">
                          Latest activity:{" "}
                          <span className="text-slate-300">{fmtWhen(meta.when)}</span>
                          {meta.platforms?.length ? (
                            <>
                              {" "}
                              ·{" "}
                              <span className="text-slate-400">
                                {meta.platforms.join(", ")}
                              </span>
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-slate-500">
                          Not scheduled yet.
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-3 text-xs">
                        <a
                          href={u.public_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-300 hover:text-emerald-200"
                        >
                          Preview
                        </a>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-500 truncate">{u.file_name}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openSchedule(u)}
                        className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                      >
                        Schedule
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteUpload(u)}
                        disabled={deletingId === u.id}
                        className={clsx(
                          "rounded-xl border border-slate-800 px-4 py-2 text-sm font-semibold",
                          deletingId === u.id
                            ? "bg-slate-900/40 text-slate-500 cursor-not-allowed"
                            : "bg-slate-900/70 text-slate-100 hover:bg-slate-900"
                        )}
                      >
                        {deletingId === u.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Modal */}
      {modalOpen && selected ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => (!scheduling ? setModalOpen(false) : null)}
          />
          <div className="absolute left-1/2 top-1/2 w-[92%] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Schedule</div>
                <div className="text-xs text-slate-400 mt-1">
                  {selected.title || selected.file_name || "Untitled"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={scheduling}
                className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs text-slate-400">Scheduled time</label>
                <input
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm outline-none focus:border-slate-600"
                />
                <div className="mt-2 text-xs text-slate-500">
                  Stored as UTC ISO:{" "}
                  <span className="text-slate-300">
                    {scheduleTime ? toIsoFromDatetimeLocal(scheduleTime) : "—"}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-400 mb-2">Platforms</div>
                <div className="grid grid-cols-1 gap-2">
                  {PLATFORM_OPTIONS.map((p) => (
                    <label
                      key={p.key}
                      className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={platforms[p.key]}
                        onChange={(e) =>
                          setPlatforms((prev) => ({
                            ...prev,
                            [p.key]: e.target.checked,
                          }))
                        }
                      />
                      <span className="text-slate-100">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {scheduleError ? (
                <div className="rounded-2xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                  {scheduleError}
                </div>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={scheduling}
                  className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold hover:bg-slate-900 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={scheduleSelected}
                  disabled={scheduling}
                  className={clsx(
                    "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold",
                    scheduling
                      ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                      : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                  )}
                >
                  {scheduling ? "Scheduling…" : "Confirm schedule"}
                </button>
              </div>

              <div className="text-xs text-slate-500">
                This will show up on your Dashboard under “Upcoming scheduled”.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
