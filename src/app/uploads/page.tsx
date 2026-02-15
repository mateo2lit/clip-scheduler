"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/app/login/supabaseClient";
import { useTeam } from "@/lib/useTeam";
import Link from "next/link";

const EMOJI_CATEGORIES = {
  "Smileys": ["😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍", "🥰", "😘", "😎", "🤩"],
  "Gestures": ["👍", "👎", "👏", "🙌", "🤝", "💪", "✌️", "🤞", "🤟", "🤘", "👋", "🙏", "✨", "💫", "⭐", "🌟"],
  "Hearts": ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💕", "💖", "💗", "💘", "💝", "💯", "🔥", "💥"],
  "Objects": ["🎮", "🎬", "🎥", "📸", "🎵", "🎶", "🎤", "🎧", "📱", "💻", "🖥️", "⌨️", "🖱️", "🏆", "🥇", "🎯"],
};

type Privacy = "private" | "unlisted" | "public";
type Step = "upload" | "details";
type InstagramType = "post" | "reel" | "story";
type YouTubeCategory = "gaming" | "entertainment" | "education" | "music" | "sports" | "news" | "howto" | "travel" | "autos" | "pets" | "comedy" | "film" | "science" | "nonprofit";

type YouTubePreset = {
  name: string;
  category: YouTubeCategory;
  visibility: Privacy;
  notifySubscribers: boolean;
  allowComments: boolean;
  allowEmbedding: boolean;
  madeForKids: boolean;
};

type PlatformConfig = {
  key: string;
  name: string;
  icon: React.ReactNode;
  available: boolean;
  charLimit: number;
};

const PLATFORMS: PlatformConfig[] = [
  {
    key: "youtube",
    name: "YouTube",
    available: true,
    charLimit: 5000,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
  },
  {
    key: "tiktok",
    name: "TikTok",
    available: true,
    charLimit: 2200,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
      </svg>
    ),
  },
  {
    key: "instagram",
    name: "Instagram",
    available: true,
    charLimit: 2200,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    available: true,
    charLimit: 3000,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
  {
    key: "facebook",
    name: "Facebook",
    available: true,
    charLimit: 63206,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
];

const YOUTUBE_CATEGORIES: { value: YouTubeCategory; label: string }[] = [
  { value: "gaming", label: "Gaming" },
  { value: "entertainment", label: "Entertainment" },
  { value: "education", label: "Education" },
  { value: "music", label: "Music" },
  { value: "sports", label: "Sports" },
  { value: "news", label: "News & Politics" },
  { value: "howto", label: "How-to & Style" },
  { value: "travel", label: "Travel & Events" },
  { value: "autos", label: "Autos & Vehicles" },
  { value: "pets", label: "Pets & Animals" },
  { value: "comedy", label: "Comedy" },
  { value: "film", label: "Film & Animation" },
  { value: "science", label: "Science & Technology" },
  { value: "nonprofit", label: "Nonprofits & Activism" },
];

const STORAGE_KEY_YT_PRESETS = "clip-scheduler-yt-presets";

function toIsoFromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}

export default function UploadsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const { teamId } = useTeam();
  const [step, setStep] = useState<Step>("upload");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastUploadId, setLastUploadId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [planActive, setPlanActive] = useState<boolean | null>(null);

  // Shared content
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["youtube"]);
  const [scheduling, setScheduling] = useState(false);

  // AI suggestions
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ tag: string; reason: string }>>([]);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiContext, setAiContext] = useState("");

  // Toolbar state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState<string>("Smileys");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const hashtagInputRef = useRef<HTMLInputElement>(null);

  // Thumbnail
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [lastThumbnailPath, setLastThumbnailPath] = useState<string | null>(null);

  // YouTube specific
  const [ytIsShort, setYtIsShort] = useState(false);
  const [ytCategory, setYtCategory] = useState<YouTubeCategory>("gaming");
  const [ytVisibility, setYtVisibility] = useState<Privacy>("private");
  const [ytNotifySubscribers, setYtNotifySubscribers] = useState(true);
  const [ytAllowComments, setYtAllowComments] = useState(true);
  const [ytAllowEmbedding, setYtAllowEmbedding] = useState(true);
  const [ytMadeForKids, setYtMadeForKids] = useState(false);

  // YouTube presets
  const [ytPresets, setYtPresets] = useState<YouTubePreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  // TikTok specific
  const [ttPrivacyLevel, setTtPrivacyLevel] = useState("SELF_ONLY");
  const [ttAllowComments, setTtAllowComments] = useState(true);
  const [ttAllowDuet, setTtAllowDuet] = useState(true);
  const [ttAllowStitch, setTtAllowStitch] = useState(true);

  // Instagram specific
  const [igType, setIgType] = useState<InstagramType>("reel");
  const [igFirstComment, setIgFirstComment] = useState("");
  const [igShopLink, setIgShopLink] = useState("");

  // Scheduling
  const defaultWhen = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);
  const [scheduledForLocal, setScheduledForLocal] = useState(defaultWhen);
  const [scheduleType, setScheduleType] = useState<"now" | "scheduled">("scheduled");

  const BUCKET = process.env.NEXT_PUBLIC_UPLOADS_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET || "clips";

  const maxCharLimit = useMemo(() => {
    const selected = PLATFORMS.filter((p) => selectedPlatforms.includes(p.key));
    if (selected.length === 0) return 5000;
    return Math.min(...selected.map((p) => p.charLimit));
  }, [selectedPlatforms]);

  // Load presets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_YT_PRESETS);
    if (saved) {
      try {
        setYtPresets(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // Close emoji picker when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showEmojiPicker]);

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setUserId(data.session.user.id);

      // Check plan status
      try {
        const res = await fetch("/api/team/plan", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const json = await res.json();
        if (json.ok) {
          setPlanActive(json.plan_status === "trialing" || json.plan_status === "active");
        }
      } catch {}
    }
    loadSession();
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith("video/")) {
      setFile(droppedFile);
    }
  }

  function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setThumbnail(f);
      const reader = new FileReader();
      reader.onload = () => setThumbnailPreview(reader.result as string);
      reader.readAsDataURL(f);
    }
  }

  function togglePlatform(key: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  function insertAtCursor(text: string) {
    const textarea = descriptionRef.current;
    if (!textarea) {
      setDescription((prev) => prev + text);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = description.substring(0, start);
    const after = description.substring(end);
    setDescription(before + text + after);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }, 0);
  }

  function handleEmojiSelect(emoji: string) {
    insertAtCursor(emoji);
    setShowEmojiPicker(false);
  }

  function handleHashtagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addHashtag();
    } else if (e.key === "Backspace" && hashtagInput === "" && hashtags.length > 0) {
      setHashtags((prev) => prev.slice(0, -1));
    }
  }

  function addHashtag() {
    const tag = hashtagInput.trim().replace(/^#/, "").replace(/,/g, "");
    if (tag && !hashtags.includes(tag)) {
      setHashtags((prev) => [...prev, tag]);
    }
    setHashtagInput("");
  }

  function removeHashtag(tag: string) {
    setHashtags((prev) => prev.filter((t) => t !== tag));
  }

  // YouTube preset functions
  function saveYtPreset() {
    if (!newPresetName.trim()) return;
    const preset: YouTubePreset = {
      name: newPresetName.trim(),
      category: ytCategory,
      visibility: ytVisibility,
      notifySubscribers: ytNotifySubscribers,
      allowComments: ytAllowComments,
      allowEmbedding: ytAllowEmbedding,
      madeForKids: ytMadeForKids,
    };
    const updated = [...ytPresets.filter((p) => p.name !== preset.name), preset];
    setYtPresets(updated);
    localStorage.setItem(STORAGE_KEY_YT_PRESETS, JSON.stringify(updated));
    setNewPresetName("");
    setShowSavePreset(false);
  }

  function loadYtPreset(preset: YouTubePreset) {
    setYtCategory(preset.category);
    setYtVisibility(preset.visibility);
    setYtNotifySubscribers(preset.notifySubscribers);
    setYtAllowComments(preset.allowComments);
    setYtAllowEmbedding(preset.allowEmbedding);
    setYtMadeForKids(preset.madeForKids);
  }

  function deleteYtPreset(name: string) {
    const updated = ytPresets.filter((p) => p.name !== name);
    setYtPresets(updated);
    localStorage.setItem(STORAGE_KEY_YT_PRESETS, JSON.stringify(updated));
  }

  function startAiSuggest() {
    setShowAiPrompt(true);
  }

  async function handleAiSuggest() {
    setAiLoading(true);
    setShowAiPrompt(false);
    setAiSuggestions([]);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          description,
          platforms: selectedPlatforms,
          filename: file?.name || "",
          existingHashtags: hashtags,
          context: aiContext,
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to get suggestions");

      setAiSuggestions(data.hashtags || []);
    } catch (e: any) {
      alert(e?.message || "AI suggestion failed");
    } finally {
      setAiLoading(false);
    }
  }

  function addSuggestedTag(tag: string) {
    if (!hashtags.includes(tag)) {
      setHashtags((prev) => [...prev, tag]);
    }
    setAiSuggestions((prev) => prev.filter((s) => s.tag !== tag));
  }

  function addAllSuggestedTags() {
    const newTags = aiSuggestions.map((s) => s.tag).filter((t) => !hashtags.includes(t));
    setHashtags((prev) => [...prev, ...newTags]);
    setAiSuggestions([]);
  }

  async function doUpload() {
    if (!userId || !file) return;
    setUploading(true);
    setUploadProgress(0);

    try {
      const pathPrefix = teamId || userId;
      const objectKey = `${pathPrefix}/${Date.now()}-${file.name}`.replace(/\s+/g, "_");
      const progressInterval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 10, 90));
      }, 200);

      const storage = await supabase.storage.from(BUCKET).upload(objectKey, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "video/mp4",
      });

      clearInterval(progressInterval);
      if (storage.error) throw new Error(storage.error.message);

      setUploadProgress(95);

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/uploads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bucket: BUCKET, file_path: objectKey }),
      });

      const out = await res.json().catch(() => null);
      if (!res.ok || !out?.ok) throw new Error(out?.error || "Upload failed");

      setUploadProgress(100);
      setLastUploadId(out.id);
      setTitle(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));

      setTimeout(() => setStep("details"), 500);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSchedule(asDraft: boolean = false) {
    if (!userId || !lastUploadId) return;
    setScheduling(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const scheduledForIso = scheduleType === "now" ? new Date().toISOString() : toIsoFromDatetimeLocal(scheduledForLocal);

      // Upload thumbnail to storage if one was selected
      let thumbnailPath = lastThumbnailPath;
      if (thumbnail && !thumbnailPath) {
        try {
          const pathPrefix = teamId || userId;
          const thumbKey = `${pathPrefix}/thumbnails/${Date.now()}-${thumbnail.name}`.replace(/\s+/g, "_");
          const thumbResult = await supabase.storage.from(BUCKET).upload(thumbKey, thumbnail, {
            cacheControl: "3600",
            upsert: false,
            contentType: thumbnail.type || "image/jpeg",
          });
          if (!thumbResult.error) {
            thumbnailPath = thumbKey;
            setLastThumbnailPath(thumbKey);
          }
        } catch {
          // Non-fatal
        }
      }

      // Create a separate scheduled post for each selected platform
      const errors: string[] = [];

      for (const platform of selectedPlatforms) {
        const body: any = {
          upload_id: lastUploadId,
          provider: platform,
          title: title || null,
          description: description || null,
          privacy_status: platform === "tiktok" ? ttPrivacyLevel : ytVisibility,
          scheduled_for: scheduledForIso,
          status: asDraft ? "draft" : "scheduled",
          hashtags,
        };

        if (["youtube", "facebook", "instagram", "linkedin"].includes(platform) && thumbnailPath) {
          body.thumbnail_path = thumbnailPath;
        }

        if (platform === "youtube") {
          body.youtube_settings = {
            is_short: ytIsShort,
            category: ytCategory,
            notify_subscribers: ytNotifySubscribers,
            allow_comments: ytAllowComments,
            allow_embedding: ytAllowEmbedding,
            made_for_kids: ytMadeForKids,
          };
        }

        if (platform === "tiktok") {
          body.tiktok_settings = {
            privacy_level: ttPrivacyLevel,
            allow_comments: ttAllowComments,
            allow_duet: ttAllowDuet,
            allow_stitch: ttAllowStitch,
          };
        }

        if (platform === "facebook") {
          body.facebook_settings = {};
        }

        if (platform === "instagram") {
          body.instagram_settings = {
            ig_type: igType,
            first_comment: igFirstComment || undefined,
          };
        }

        const res = await fetch("/api/scheduled-posts/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });

        const out = await res.json().catch(() => null);
        if (!res.ok || !out?.scheduledPost?.id) {
          errors.push(`${platform}: ${out?.error || "Scheduling failed"}`);
        }
      }

      if (errors.length === selectedPlatforms.length) {
        throw new Error(errors.join("\n"));
      }

      if (errors.length > 0) {
        alert(`Some platforms failed to schedule:\n${errors.join("\n")}`);
      }

      window.location.href = asDraft ? "/drafts" : "/scheduled";
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to schedule");
    } finally {
      setScheduling(false);
    }
  }

  function resetUpload() {
    setStep("upload");
    setFile(null);
    setLastUploadId(null);
    setTitle("");
    setDescription("");
    setHashtags([]);
    setThumbnail(null);
    setThumbnailPreview(null);
    setLastThumbnailPath(null);
    setUploadProgress(0);
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/50 via-transparent to-transparent" />
      </div>

      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-white/40 hover:text-white/70 transition-colors mb-8">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">{step === "upload" ? "Upload Video" : "Create Post"}</h1>
            <p className="text-white/40 mt-1">{step === "upload" ? "Upload your video to get started" : "Configure your post for each platform"}</p>
          </div>
          {step === "details" && (
            <button onClick={resetUpload} className="text-sm text-white/40 hover:text-white/70 transition-colors">
              Upload different video
            </button>
          )}
        </div>

        {/* Subscribe banner */}
        {planActive === false && (
          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400 flex items-center justify-between">
            <span>You need an active subscription to upload and schedule posts.</span>
            <Link href="/settings" className="rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-black hover:bg-amber-400 transition-colors">
              Subscribe
            </Link>
          </div>
        )}

        {/* Upload Step */}
        {step === "upload" && (
          <div className="mt-10">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`relative rounded-2xl border-2 border-dashed p-16 text-center transition-all ${dragOver ? "border-white/40 bg-white/5" : file ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"}`}
            >
              {uploading ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-white/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white/60 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div><p className="font-medium">Uploading...</p><p className="text-sm text-white/40 mt-1">{uploadProgress}%</p></div>
                  <div className="w-full max-w-xs mx-auto h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-white transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : file ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div><p className="font-medium">{file.name}</p><p className="text-sm text-white/40 mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</p></div>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setFile(null)} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors">Remove</button>
                    <button onClick={doUpload} disabled={planActive === false} className="rounded-full bg-white px-6 py-2 text-sm font-medium text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Upload</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-white/5 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div><p className="font-medium">Drop your video here</p><p className="text-sm text-white/40 mt-1">or click to browse</p></div>
                  <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              )}
            </div>
            <p className="text-center text-xs text-white/30 mt-4">Supported formats: MP4, MOV, AVI, WebM</p>
          </div>
        )}

        {/* Details Step */}
        {step === "details" && (
          <div className="mt-10 space-y-6">
            {/* Platform Selector */}
            <div className="flex items-center gap-2 pb-6 border-b border-white/5 flex-wrap">
              <span className="text-sm text-white/40 mr-2">Post to:</span>
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.key}
                  onClick={() => platform.available && togglePlatform(platform.key)}
                  disabled={!platform.available}
                  className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all ${selectedPlatforms.includes(platform.key) ? "bg-white text-black" : platform.available ? "bg-white/5 text-white/60 hover:bg-white/10" : "bg-white/[0.02] text-white/20 cursor-not-allowed"}`}
                >
                  <span className={selectedPlatforms.includes(platform.key) ? "text-black" : ""}>{platform.icon}</span>
                  <span>{platform.name}</span>
                  {!platform.available && <span className="text-[10px] text-white/30 ml-1">Soon</span>}
                </button>
              ))}
            </div>

            {/* Main Content Area */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              {/* Title */}
              <div className="p-5 border-b border-white/5">
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter a title for your video" className="w-full bg-transparent text-lg font-medium text-white placeholder-white/30 outline-none" />
              </div>

              {/* Description */}
              <div className="p-5 border-b border-white/5">
                <textarea ref={descriptionRef} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What would you like to share?" rows={4} className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none resize-none" />

                {/* Toolbar */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                  <div className="relative" ref={emojiPickerRef}>
                    <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-2 rounded-lg transition-colors ${showEmojiPicker ? "bg-white/10 text-white" : "hover:bg-white/5 text-white/40 hover:text-white/70"}`} title="Add emoji">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    {/* Emoji Picker */}
                    {showEmojiPicker && (
                      <div className="absolute bottom-full left-0 mb-2 w-80 rounded-xl border border-white/10 bg-neutral-900 shadow-xl z-50 overflow-hidden">
                        {/* Category Tabs */}
                        <div className="flex border-b border-white/5">
                          {Object.keys(EMOJI_CATEGORIES).map((cat) => (
                            <button key={cat} onClick={() => setSelectedEmojiCategory(cat)} className={`flex-1 px-3 py-2 text-xs transition-colors ${selectedEmojiCategory === cat ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>
                              {cat}
                            </button>
                          ))}
                        </div>
                        {/* Emoji Grid */}
                        <div className="p-3">
                          <div className="grid grid-cols-8 gap-1">
                            {EMOJI_CATEGORIES[selectedEmojiCategory as keyof typeof EMOJI_CATEGORIES].map((emoji) => (
                              <button key={emoji} onClick={() => handleEmojiSelect(emoji)} className="w-8 h-8 flex items-center justify-center text-xl hover:bg-white/10 rounded-lg transition-colors">
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-white/30">{description.length} / {maxCharLimit}</div>
                </div>
              </div>

              {/* Hashtags */}
              <div className="p-5 border-b border-white/5">
                <label className="block text-xs text-white/40 mb-2">Hashtags</label>
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5 min-h-[44px]" onClick={() => hashtagInputRef.current?.focus()}>
                  {hashtags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-white/10 pl-3 pr-1.5 py-1 text-sm">
                      <span className="text-white/50">#</span>
                      <span>{tag}</span>
                      <button onClick={() => removeHashtag(tag)} className="ml-1 p-0.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  <input
                    ref={hashtagInputRef}
                    type="text"
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    onKeyDown={handleHashtagKeyDown}
                    onBlur={addHashtag}
                    placeholder={hashtags.length === 0 ? "Type a tag and press Enter or comma" : "Add more..."}
                    className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder-white/30 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-white/30">Press Enter or comma to add a tag</p>
                  {!showAiPrompt && (
                    <button
                      onClick={startAiSuggest}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 px-3 py-1.5 text-xs text-purple-300 hover:from-purple-500/30 hover:to-blue-500/30 transition-all disabled:opacity-50"
                    >
                      <svg className={`w-3.5 h-3.5 ${aiLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                      </svg>
                      {aiLoading ? "Suggesting..." : "Suggest Tags"}
                    </button>
                  )}
                </div>

                {/* AI Context Prompt */}
                {showAiPrompt && (
                  <div className="mt-3 rounded-xl border border-purple-500/20 bg-purple-500/[0.05] p-4">
                    <label className="block text-xs font-medium text-purple-300 mb-2">What's this video about?</label>
                    <input
                      type="text"
                      value={aiContext}
                      onChange={(e) => setAiContext(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && aiContext.trim() && handleAiSuggest()}
                      placeholder="e.g. Warzone gameplay highlights with funny moments"
                      className="w-full rounded-lg border border-purple-500/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/40"
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-2 mt-3">
                      <button
                        onClick={() => { setShowAiPrompt(false); setAiContext(""); }}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 hover:bg-white/10 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAiSuggest}
                        disabled={!aiContext.trim()}
                        className="rounded-full bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:from-purple-400 hover:to-blue-400 transition-all disabled:opacity-50"
                      >
                        Generate Tags
                      </button>
                    </div>
                  </div>
                )}

                {/* AI Suggestions Panel */}
                {aiSuggestions.length > 0 && (
                  <div className="mt-3 rounded-xl border border-purple-500/20 bg-purple-500/[0.05] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-purple-300">Suggested tags</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={addAllSuggestedTags}
                          className="text-xs text-purple-300 hover:text-purple-200 transition-colors"
                        >
                          Add all
                        </button>
                        <button
                          onClick={() => setAiSuggestions([])}
                          className="text-xs text-white/30 hover:text-white/50 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {aiSuggestions.map((s) => (
                        <button
                          key={s.tag}
                          onClick={() => addSuggestedTag(s.tag)}
                          className="group relative inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 pl-3 pr-2.5 py-1.5 text-sm text-purple-200 hover:bg-purple-500/20 hover:border-purple-500/30 transition-all"
                          title={s.reason}
                        >
                          <span className="text-purple-400/60">#</span>
                          <span>{s.tag}</span>
                          <svg className="w-3.5 h-3.5 text-purple-400/40 group-hover:text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-white/30 mt-3">Click a tag to add it. Hover for why it was suggested.</p>
                  </div>
                )}
              </div>

              {/* Thumbnail */}
              <div className="p-5 border-b border-white/5">
                <div className="flex items-start gap-4">
                  <div className="relative w-32 h-20 rounded-lg border border-white/10 bg-white/5 overflow-hidden flex-shrink-0">
                    {thumbnailPreview ? (
                      <img src={thumbnailPreview} alt="Thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-white/70">Thumbnail</p>
                    <p className="text-xs text-white/40 mt-0.5">1280x720 recommended</p>
                    <label className="inline-flex mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors cursor-pointer">
                      {thumbnail ? "Change" : "Upload"}
                      <input type="file" accept="image/*" onChange={handleThumbnailChange} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Scheduling */}
              <div className="p-5">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 p-1 rounded-lg bg-white/5">
                    <button onClick={() => setScheduleType("now")} className={`px-3 py-1.5 rounded-md text-sm transition-all ${scheduleType === "now" ? "bg-white text-black" : "text-white/60 hover:text-white"}`}>Now</button>
                    <button onClick={() => setScheduleType("scheduled")} className={`px-3 py-1.5 rounded-md text-sm transition-all ${scheduleType === "scheduled" ? "bg-white text-black" : "text-white/60 hover:text-white"}`}>Schedule</button>
                  </div>
                  {scheduleType === "scheduled" && (
                    <input type="datetime-local" value={scheduledForLocal} onChange={(e) => setScheduledForLocal(e.target.value)} className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20" />
                  )}
                </div>
              </div>
            </div>

            {/* YouTube Settings */}
            {selectedPlatforms.includes("youtube") && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-white/[0.02]">
                  <div className="text-red-500">{PLATFORMS.find(p => p.key === "youtube")?.icon}</div>
                  <span className="font-medium">YouTube Settings</span>
                  <button onClick={() => setYtIsShort(!ytIsShort)} className={`ml-auto flex items-center gap-2 rounded-full px-3 py-1 text-xs transition-all ${ytIsShort ? "bg-white text-black" : "bg-white/5 text-white/60"}`}>
                    <span className={`w-2 h-2 rounded-full ${ytIsShort ? "bg-black" : "bg-white/40"}`} />Short
                  </button>
                </div>

                {/* Presets */}
                {ytPresets.length > 0 && (
                  <div className="p-4 border-b border-white/5 bg-white/[0.01]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white/40">Load preset:</span>
                      {ytPresets.map((preset) => (
                        <div key={preset.name} className="flex items-center gap-1">
                          <button onClick={() => loadYtPreset(preset)} className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10 transition-colors">
                            {preset.name}
                          </button>
                          <button onClick={() => deleteYtPreset(preset.name)} className="p-1 rounded-full hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-white/40 mb-1.5">Category</label>
                      <select value={ytCategory} onChange={(e) => setYtCategory(e.target.value as YouTubeCategory)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20">
                        {YOUTUBE_CATEGORIES.map((cat) => (<option key={cat.value} value={cat.value} className="bg-neutral-900">{cat.label}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-white/40 mb-1.5">Visibility</label>
                      <select value={ytVisibility} onChange={(e) => setYtVisibility(e.target.value as Privacy)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20">
                        <option value="public" className="bg-neutral-900">Public</option>
                        <option value="unlisted" className="bg-neutral-900">Unlisted</option>
                        <option value="private" className="bg-neutral-900">Private</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={ytNotifySubscribers} onChange={(e) => setYtNotifySubscribers(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 accent-white" />
                      <span className="text-sm text-white/70">Notify Subscribers</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={ytAllowComments} onChange={(e) => setYtAllowComments(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 accent-white" />
                      <span className="text-sm text-white/70">Allow Comments</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={ytAllowEmbedding} onChange={(e) => setYtAllowEmbedding(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 accent-white" />
                      <span className="text-sm text-white/70">Allow Embedding</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={ytMadeForKids} onChange={(e) => setYtMadeForKids(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 accent-white" />
                      <span className="text-sm text-white/70">Made for Kids</span>
                    </label>
                  </div>

                  {/* Save Preset */}
                  <div className="pt-4 border-t border-white/5">
                    {showSavePreset ? (
                      <div className="flex items-center gap-2">
                        <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Preset name..." className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none" autoFocus />
                        <button onClick={saveYtPreset} disabled={!newPresetName.trim()} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50 transition-colors">Save</button>
                        <button onClick={() => { setShowSavePreset(false); setNewPresetName(""); }} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowSavePreset(true)} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        Save current settings as preset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TikTok Settings */}
            {selectedPlatforms.includes("tiktok") && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-white/[0.02]">
                  <div className="text-white">{PLATFORMS.find(p => p.key === "tiktok")?.icon}</div>
                  <span className="font-medium">TikTok Settings</span>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">Privacy Level</label>
                    <select value={ttPrivacyLevel} onChange={(e) => setTtPrivacyLevel(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20">
                      <option value="SELF_ONLY" className="bg-neutral-900">Private (Self Only)</option>
                      <option value="MUTUAL_FOLLOW_FRIENDS" className="bg-neutral-900">Friends</option>
                      <option value="FOLLOWER_OF_CREATOR" className="bg-neutral-900">Followers</option>
                      <option value="PUBLIC_TO_EVERYONE" className="bg-neutral-900">Public</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={ttAllowComments} onChange={(e) => setTtAllowComments(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 accent-white" />
                      <span className="text-sm text-white/70">Allow Comments</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={ttAllowDuet} onChange={(e) => setTtAllowDuet(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 accent-white" />
                      <span className="text-sm text-white/70">Allow Duet</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={ttAllowStitch} onChange={(e) => setTtAllowStitch(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 accent-white" />
                      <span className="text-sm text-white/70">Allow Stitch</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Instagram Settings */}
            {selectedPlatforms.includes("instagram") && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-white/[0.02]">
                  <div className="text-pink-500">{PLATFORMS.find(p => p.key === "instagram")?.icon}</div>
                  <span className="font-medium">Instagram Settings</span>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">Post Type</label>
                    <div className="flex gap-2">
                      {(["post", "reel", "story"] as InstagramType[]).map((type) => (
                        <button key={type} onClick={() => setIgType(type)} className={`flex-1 rounded-lg py-2 text-sm capitalize ${igType === type ? "bg-white/10 border border-white/20" : "bg-white/5 border border-white/10"}`}>{type}</button>
                      ))}
                    </div>
                    <p className="text-xs text-white/30 mt-1.5">
                      {igType === "story" ? "Video will be posted as a Story (24hr, no caption)" : "Video will be published as a Reel"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">First Comment</label>
                    <input type="text" value={igFirstComment} onChange={(e) => setIgFirstComment(e.target.value)} placeholder="Add hashtags or a comment..." className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none" />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4">
              <button onClick={() => handleSchedule(true)} disabled={scheduling} className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50">Save as draft</button>
              <button onClick={() => handleSchedule(false)} disabled={scheduling || selectedPlatforms.length === 0} className="rounded-full bg-white px-8 py-3 text-sm font-medium text-black hover:bg-white/90 transition-colors disabled:opacity-50">
                {scheduling ? "Scheduling..." : scheduleType === "now" ? "Publish now" : "Schedule"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
