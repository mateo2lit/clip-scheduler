"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type UploadRow = {
  id: string;
  file_name: string;
  file_path: string;
  public_url: string;
  title: string | null;
  description: string | null;
  created_at: string | null;
};

type PlatformKey = "youtube" | "tiktok" | "instagram";

const PLATFORM_OPTIONS: { key: PlatformKey; label: string }[] = [
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
];

// IMPORTANT: must match your Supabase Storage bucket name.
const STORAGE_BUCKET = "uploads";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function toIsoFromDatetimeLocal(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function prettyFileSize(bytes: number) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function UploadPage() {
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [uploaded, setUploaded] = useState<UploadRow | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");

  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [platforms, setPlatforms] = useState<Record<PlatformKey, boolean>>({
    youtube: true,
    tiktok: false,
    instagram: false,
  });
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const tags = useMemo(() => {
    return tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 30);
  }, [tagsText]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setLoadingAuth(true);
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      if (!cancelled) setLoadingAuth(false);
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetAll() {
    setFile(null);
    setUploading(false);
    setUploadError(null);
    setUploaded(null);
    setTitle("");
    setDescription("");
    setTagsText("");
    setSavingDetails(false);
    setDetailsError(null);
    setScheduleOpen(false);
    setScheduleTime("");
    setPlatforms({ youtube: true, tiktok: false, instagram: false });
    setScheduling(false);
    setScheduleError(null);
  }

  async function handleUpload() {
    setUploadError(null);
    setDetailsError(null);
    setScheduleError(null);

    if (!file) {
      setUploadError("Choose a video file first.");
      return;
    }

    setUploading(true);

    try {
      const { data: authUser } = await supabase.auth.getUser();
      const userId = authUser.user?.id;
      if (!userId) throw new Error("Not logged in.");

      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${userId}/${Date.now()}_${safeName}`;

      const up = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (up.error) {
        throw new Error(
          up.error.message ||
            `Upload failed. Check that the "${STORAGE_BUCKET}" bucket exists.`
        );
      }

      const pub = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      const publicUrl = pub.data?.publicUrl;
      if (!publicUrl) throw new Error("Could not create a public URL.");

      const insert = await supabase
        .from("uploads")
        .insert({
          owner_id: userId, // ✅ REQUIRED for RLS policy
          file_name: file.name,
          file_path: path,
          public_url: publicUrl,
          title: file.name.replace(/\.[^/.]+$/, ""),
          description: "",
          created_at: new Date().toISOString(),
        })
        .select("id, file_name, file_path, public_url, title, description, created_at")
        .single();

      if (insert.error) throw new Error(insert.error.message);

      const row = insert.data as UploadRow;

      setUploaded(row);
      setTitle(row.title ?? "");
      setDescription(row.description ?? "");
      setTagsText("");
      setFile(null);
    } catch (e: any) {
      setUploadError(String(e?.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  async function saveDetailsOnly() {
    setDetailsError(null);
    setScheduleError(null);

    if (!uploaded) {
      setDetailsError("Upload a video first.");
      return false;
    }

    setSavingDetails(true);
    try {
      const update = await supabase
        .from("uploads")
        .update({
          title: title.trim() || uploaded.file_name,
          description: description ?? "",
        })
        .eq("id", uploaded.id);

      if (update.error) throw new Error(update.error.message);

      setUploaded((prev) =>
        prev
          ? {
              ...prev,
              title: title.trim() || prev.file_name,
              description: description ?? "",
            }
          : prev
      );

      return true;
    } catch (e: any) {
      setDetailsError(String(e?.message ?? e));
      return false;
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveForLater() {
    const ok = await saveDetailsOnly();
    if (!ok) return;
    window.location.href = "/uploads";
  }

  async function scheduleNow() {
    setScheduleError(null);

    if (!uploaded) {
      setScheduleError("Upload a video first.");
      return;
    }

    const scheduledForIso = toIsoFromDatetimeLocal(scheduleTime);
    if (!scheduledForIso) {
      setScheduleError("Pick a date/time to schedule.");
      return;
    }

    const chosen = (Object.keys(platforms) as PlatformKey[]).filter(
      (k) => platforms[k]
    );

    if (chosen.length === 0) {
      setScheduleError("Pick at least one platform.");
      return;
    }

    const detailsOk = await saveDetailsOnly();
    if (!detailsOk) return;

    setScheduling(true);
    try {
      const insert = await supabase
        .from("scheduled_posts")
        .insert({
          upload_id: uploaded.id,
          upload_title: title.trim() || uploaded.file_name,
          upload_file_name: uploaded.file_name,
          scheduled_for: scheduledForIso,
          platforms: chosen,
          status: "scheduled",
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insert.error) throw new Error(insert.error.message);

      window.location.href = "/dashboard";
    } catch (e: any) {
      setScheduleError(String(e?.message ?? e));
    } finally {
      setScheduling(false);
    }
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-400">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-140px] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute left-[12%] top-[320px] h-[320px] w-[520px] rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-400">Clip Scheduler</div>
            <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
            <p className="mt-1 text-sm text-slate-400">
              Upload a video, then schedule it — or save it for later.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm hover:bg-slate-900"
            >
              Dashboard
            </Link>
            <Link
              href="/uploads"
              className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm hover:bg-slate-900"
            >
              Upload library
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">1) Upload your video</div>
              <div className="text-xs text-slate-400 mt-1">
                MP4 recommended. Keep it short for Shorts/Reels/TikTok.
              </div>
            </div>

            <button
              onClick={resetAll}
              className="text-xs text-slate-400 hover:text-slate-200"
              type="button"
            >
              Reset
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-100 hover:file:bg-slate-700"
            />

            {file ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm">
                <div className="font-medium text-slate-100 truncate">{file.name}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {prettyFileSize(file.size)}
                </div>
              </div>
            ) : null}

            {uploadError ? (
              <div className="rounded-2xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                {uploadError}
              </div>
            ) : null}

            <button
              onClick={handleUpload}
              disabled={uploading || !file}
              className={clsx(
                "rounded-2xl px-4 py-3 text-sm font-semibold",
                uploading || !file
                  ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
              )}
              type="button"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-sm font-semibold">2) Add details</div>
          <div className="text-xs text-slate-400 mt-1">
            This is what will be used for the scheduled post metadata.
          </div>

          {!uploaded ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4 text-sm text-slate-400">
              Upload a video to unlock this step.
            </div>
          ) : (
            <>
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <div className="text-xs text-slate-400">Uploaded</div>
                <div className="text-sm font-medium text-slate-100 truncate">
                  {uploaded.file_name}
                </div>
                <a
                  className="mt-1 inline-block text-xs text-emerald-300 hover:text-emerald-200"
                  href={uploaded.public_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Preview file
                </a>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <label className="text-xs text-slate-400">Title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:border-slate-600"
                    placeholder="Enter a title…"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:border-slate-600 min-h-[110px]"
                    placeholder="Optional…"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400">Tags</label>
                  <input
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:border-slate-600"
                    placeholder="comma, separated, tags"
                  />
                </div>

                {detailsError ? (
                  <div className="rounded-2xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                    {detailsError}
                  </div>
                ) : null}

                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setScheduleOpen(true)}
                    className="flex-1 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                  >
                    Schedule now
                  </button>

                  <button
                    type="button"
                    onClick={saveForLater}
                    disabled={savingDetails}
                    className={clsx(
                      "flex-1 rounded-2xl border border-slate-800 px-4 py-3 text-sm font-semibold",
                      savingDetails
                        ? "bg-slate-900/40 text-slate-500 cursor-not-allowed"
                        : "bg-slate-900/70 text-slate-100 hover:bg-slate-900"
                    )}
                  >
                    {savingDetails ? "Saving…" : "Save for later"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* schedule modal (unchanged visually; only business logic above changed) */}
        {scheduleOpen ? (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => (!scheduling ? setScheduleOpen(false) : null)}
            />
            <div className="absolute left-1/2 top-1/2 w-[92%] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Schedule post</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Pick platforms and a time. The worker will process it when due.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
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
                    onClick={() => setScheduleOpen(false)}
                    disabled={scheduling}
                    className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold hover:bg-slate-900 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={scheduleNow}
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
              </div>

              <div className="mt-4 text-xs text-slate-500">
                Tip: If you don’t want to choose a time yet, close this and hit{" "}
                <span className="text-slate-200">Save for later</span>.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
