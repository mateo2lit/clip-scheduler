"use client";

import {
  useEffect,
  useState,
  ChangeEvent,
  FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../login/supabaseClient";

type User = {
  id: string;
  email?: string;
};

type UploadRow = {
  id: string;
  file_name: string | null;
  file_path: string | null;
  public_url: string | null;
  title: string | null;
  description: string | null;
  created_at: string;
};

type ScheduledPost = {
  id: string;
  upload_id: string | null;
  upload_title: string | null;
  upload_file_name: string | null;
  scheduled_for: string;
  platforms: string | null;
  status: string | null;
  created_at: string;
};

export default function DashboardPage() {
  const router = useRouter();

  // auth
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // upload form
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // uploads list
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);

  // editing clip info
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // scheduling
  const [selectedUpload, setSelectedUpload] = useState<UploadRow | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [platformYouTube, setPlatformYouTube] = useState(true);
  const [platformTikTok, setPlatformTikTok] = useState(false);
  const [platformShorts, setPlatformShorts] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(true);

  // 1) Check logged-in user
  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.push("/login");
      } else {
        setUser({ id: user.id, email: user.email || undefined });
      }
      setLoadingUser(false);
    };

    checkUser();
  }, [router]);

  // 2) Load uploads
  useEffect(() => {
    const loadUploads = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("uploads")
        .select(
          "id, file_name, file_path, public_url, title, description, created_at",
        )
        .order("created_at", { ascending: false });

      if (!error && data) {
        setUploads(data as UploadRow[]);
      }

      setLoadingUploads(false);
    };

    loadUploads();
  }, [user]);

  // 3) Load scheduled posts
  useEffect(() => {
    const loadScheduled = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("scheduled_posts")
        .select(
          "id, upload_id, upload_title, upload_file_name, scheduled_for, platforms, status, created_at",
        )
        .order("scheduled_for", { ascending: true });

      if (!error && data) {
        setScheduledPosts(data as ScheduledPost[]);
      }

      setLoadingScheduled(false);
    };

    loadScheduled();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setUploadError(null);
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      setUploadError("You must be logged in.");
      return;
    }
    if (!file) {
      setUploadError("Please choose a file first.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("clips")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("clips")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData?.publicUrl ?? null;

      const { data, error: insertError } = await supabase
        .from("uploads")
        .insert({
          user_id: user.id,
          user_email: user.email,
          file_name: file.name,
          file_path: filePath,
          public_url: publicUrl,
          title: title || file.name,
          description: description || null,
        })
        .select(
          "id, file_name, file_path, public_url, title, description, created_at",
        )
        .single();

      if (insertError) throw insertError;

      setUploads((prev) => (data ? [data as UploadRow, ...prev] : prev));
      setFile(null);
      setTitle("");
      setDescription("");
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteUpload = async (upload: UploadRow) => {
    if (!window.confirm("Delete this clip? This cannot be undone.")) return;

    try {
      if (upload.file_path) {
        await supabase.storage.from("clips").remove([upload.file_path]);
      }

      const { error } = await supabase
        .from("uploads")
        .delete()
        .eq("id", upload.id);

      if (error) throw error;

      setUploads((prev) => prev.filter((u) => u.id !== upload.id));
      setSelectedUpload((prev) => (prev?.id === upload.id ? null : prev));
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to delete clip.");
    }
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const { error } = await supabase
        .from("uploads")
        .update({
          title: editTitle || null,
          description: editDescription || null,
        })
        .eq("id", id);

      if (error) throw error;

      setUploads((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                title: editTitle || u.title,
                description: editDescription || u.description,
              }
            : u,
        ),
      );

      setEditingId(null);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to save changes.");
    }
  };

  const handleSelectForSchedule = (upload: UploadRow) => {
    setSelectedUpload(upload);
    setScheduleError(null);

    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    const localISO = new Date(
      oneHourFromNow.getTime() - oneHourFromNow.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);

    setScheduleTime(localISO);
  };

  const handleCreateSchedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !selectedUpload) {
      setScheduleError("Select a clip first.");
      return;
    }
    if (!scheduleTime) {
      setScheduleError("Pick a date and time.");
      return;
    }

    const platforms: string[] = [];
    if (platformYouTube) platforms.push("YouTube");
    if (platformTikTok) platforms.push("TikTok");
    if (platformShorts) platforms.push("Shorts");

    if (platforms.length === 0) {
      setScheduleError("Select at least one platform.");
      return;
    }

    setScheduling(true);
    setScheduleError(null);

    try {
      const scheduledFor = new Date(scheduleTime).toISOString();
      const platformsString = platforms.join(", ");

      const { data, error } = await supabase
        .from("scheduled_posts")
        .insert({
          user_id: user.id,
          upload_id: selectedUpload.id,
          upload_title: selectedUpload.title || selectedUpload.file_name,
          upload_file_name: selectedUpload.file_name,
          scheduled_for: scheduledFor,
          platforms: platformsString,
          status: "scheduled",
        })
        .select(
          "id, upload_id, upload_title, upload_file_name, scheduled_for, platforms, status, created_at",
        )
        .single();

      if (error) throw error;

      setScheduledPosts((prev) =>
        data ? [...prev, data as ScheduledPost] : prev,
      );
    } catch (err: any) {
      console.error(err);
      setScheduleError(err.message || "Failed to schedule post.");
    } finally {
      setScheduling(false);
    }
  };

  const handleDeleteScheduled = async (post: ScheduledPost) => {
    if (!window.confirm("Cancel this scheduled post?")) return;

    try {
      const { error } = await supabase
        .from("scheduled_posts")
        .delete()
        .eq("id", post.id);

      if (error) throw error;

      setScheduledPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to cancel scheduled post.");
    }
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-300">Loading dashboard...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Clip Scheduler Dashboard</h1>
          <p className="text-xs text-slate-400">
            Logged in as {user.email || "unknown"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/settings"
            className="text-xs px-3 py-1 rounded-md border border-slate-600 hover:bg-slate-800"
          >
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1 rounded-md border border-slate-600 hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="p-6 space-y-8">
        {/* Upload box */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 max-w-xl">
          <h2 className="text-sm font-semibold mb-2">Upload a new clip</h2>
          <p className="text-xs text-slate-400 mb-3">
            Choose a video file and give it a title/description. This will be
            used when organizing and scheduling your content.
          </p>

          <form onSubmit={handleUpload} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs text-slate-300">
                Clip title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Example: Crazy clutch in ranked"
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-slate-300">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional notes about the clip, context, etc."
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-slate-300">
                Video file
              </label>
              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="text-xs"
              />
            </div>

            {uploadError && (
              <p className="text-xs text-red-400 bg-red-900/40 border border-red-700 rounded-md px-3 py-2">
                {uploadError}
              </p>
            )}

            <button
              type="submit"
              disabled={uploading}
              className="text-xs px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload clip"}
            </button>
          </form>
        </section>

        {/* Upload list */}
        <section>
          <h2 className="text-sm font-semibold mb-2">Your uploads</h2>

          {loadingUploads ? (
            <p className="text-xs text-slate-400">Loading uploads...</p>
          ) : uploads.length === 0 ? (
            <p className="text-xs text-slate-500">
              No uploads yet. Upload a clip to see it here.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {uploads.map((u) => (
                <div
                  key={u.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs flex flex-col gap-2"
                >
                  <div className="aspect-video bg-slate-800 rounded-md flex items-center justify-center overflow-hidden">
                    {u.public_url ? (
                      <video
                        src={u.public_url}
                        controls
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        No preview available
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    {editingId === u.id ? (
                      <>
                        <input
                          className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px]"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Title"
                        />
                        <textarea
                          className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px]"
                          rows={2}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Description"
                        />
                      </>
                    ) : (
                      <>
                        <p className="font-medium truncate">
                          {u.title || u.file_name || "Unnamed file"}
                        </p>
                        {u.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-2">
                            {u.description}
                          </p>
                        )}
                      </>
                    )}

                    <p className="text-slate-500 text-[11px]">
                      {new Date(u.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-1">
                    {u.public_url && (
                      <a
                        href={u.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-400 hover:underline"
                      >
                        Open in new tab
                      </a>
                    )}
                    <div className="flex gap-2">
                      {editingId === u.id ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(u.id)}
                            className="text-[11px] px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-500"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-[11px] px-2 py-1 rounded-md border border-slate-600"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleSelectForSchedule(u)}
                            className="text-[11px] px-2 py-1 rounded-md border border-slate-600 hover:bg-slate-800"
                          >
                            Schedule
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(u.id);
                              setEditTitle(u.title || u.file_name || "");
                              setEditDescription(u.description || "");
                            }}
                            className="text-[11px] px-2 py-1 rounded-md border border-slate-600 hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteUpload(u)}
                            className="text-[11px] px-2 py-1 rounded-md border border-red-700 text-red-300 hover:bg-red-900/30"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Scheduling panel */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 max-w-xl">
          <h2 className="text-sm font-semibold mb-2">Schedule a clip</h2>

          {!selectedUpload ? (
            <p className="text-xs text-slate-500">
              Select a clip above and click{" "}
              <span className="font-semibold">Schedule</span> to begin.
            </p>
          ) : (
            <form onSubmit={handleCreateSchedule} className="space-y-3">
              <div className="text-xs text-slate-300 mb-1">
                Scheduling:
                <span className="font-semibold ml-1">
                  {selectedUpload.title ||
                    selectedUpload.file_name ||
                    "Unnamed clip"}
                </span>
              </div>

              <div className="space-y-1">
                <label className="block text-xs text-slate-300">
                  Date &amp; time
                </label>
                <input
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs text-slate-300">
                  Platforms
                </label>
                <div className="flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={platformYouTube}
                      onChange={(e) => setPlatformYouTube(e.target.checked)}
                    />
                    YouTube
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={platformTikTok}
                      onChange={(e) => setPlatformTikTok(e.target.checked)}
                    />
                    TikTok
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={platformShorts}
                      onChange={(e) => setPlatformShorts(e.target.checked)}
                    />
                    Shorts
                  </label>
                </div>
              </div>

              {scheduleError && (
                <p className="text-xs text-red-400 bg-red-900/40 border border-red-700 rounded-md px-3 py-2">
                  {scheduleError}
                </p>
              )}

              <button
                type="submit"
                disabled={scheduling}
                className="text-xs px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {scheduling ? "Saving schedule..." : "Save schedule"}
              </button>
            </form>
          )}
        </section>

        {/* Scheduled posts list */}
        <section>
          <h2 className="text-sm font-semibold mb-2">Scheduled posts</h2>
          {loadingScheduled ? (
            <p className="text-xs text-slate-400">Loading scheduled posts...</p>
          ) : scheduledPosts.length === 0 ? (
            <p className="text-xs text-slate-500">
              No scheduled posts yet. Schedule a clip to see it here.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {scheduledPosts.map((s) => {
                const now = new Date();
                const scheduledDate = new Date(s.scheduled_for);
                const isPast = scheduledDate.getTime() <= now.getTime();

                const displayStatus = isPast ? "Due" : "Scheduled";
                const statusClass = isPast
                  ? "text-yellow-400"
                  : "text-emerald-400";

                return (
                  <div
                    key={s.id}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-medium">
                        {s.upload_title || s.upload_file_name || "Unnamed clip"}
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        Scheduled for:{" "}
                        {new Date(s.scheduled_for).toLocaleString()}
                      </p>
                      {s.platforms && (
                        <p className="text-slate-400 text-[11px]">
                          Platforms: {s.platforms}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[11px] ${statusClass}`}>
                        {displayStatus}
                      </span>
                      <button
                        onClick={() => handleDeleteScheduled(s)}
                        className="text-[11px] px-2 py-1 rounded-md border border-red-700 text-red-300 hover:bg-red-900/30"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
