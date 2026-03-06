"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/app/login/supabaseClient";
import { useTeam } from "@/lib/useTeam";

function proxiedAvatar(url: string | null | undefined): string | null {
  if (!url) return null;
  // Local API endpoints (e.g. /api/avatar-live) — return directly, no double-wrapping
  if (url.startsWith("/")) return url;
  return `/api/avatar-proxy?url=${encodeURIComponent(url)}`;
}
import { isThreadsEnabledForUserIdClient } from "@/lib/platformAccess";
import Link from "next/link";
import PostPreviewPanel from "./PostPreviewPanel";

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
  publicStats?: boolean;
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
  {
    key: "threads",
    name: "Threads",
    available: true,
    charLimit: 500,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.5 12.068V12c.05-4.073 1.364-7.298 3.905-9.58C7.628.302 10.594-.06 12.186 0c2.64.065 4.955.942 6.681 2.534.94.861 1.696 1.957 2.25 3.258l-2.145.9c-.427-1.012-1.03-1.881-1.793-2.582-1.33-1.218-3.15-1.872-5.053-1.915-1.275-.032-3.6.239-5.392 1.913C4.899 5.69 3.884 8.26 3.84 11.998c.038 3.733 1.053 6.3 3.014 7.847 1.782 1.374 4.107 1.662 5.367 1.682 1.254-.005 3.424-.237 5.25-1.624.926-.71 1.63-1.63 2.09-2.73-1.208-.226-2.457-.285-3.73-.147-2.02.217-3.717-.185-5.04-1.196-.959-.728-1.505-1.833-1.514-2.949-.013-1.208.496-2.372 1.389-3.191 1.083-.994 2.67-1.487 4.712-1.487a11.91 11.91 0 0 1 1.96.164c-.143-.49-.38-.882-.714-1.165-.522-.442-1.329-.667-2.396-.667l-.118.001c-.899.01-2.094.317-2.823 1.218l-1.617-1.38C9.5 7.067 11.083 6.5 12.72 6.5l.156-.001c1.597-.007 2.936.388 3.88 1.168.99.815 1.534 2.016 1.617 3.578.1 1.828-.265 3.382-1.086 4.624-.821 1.241-2.071 2.097-3.617 2.475a10.6 10.6 0 0 1-2.52.296c-2.01-.003-3.41-.55-4.165-1.636-.48-.687-.636-1.504-.49-2.413.215-1.326 1.1-2.477 2.482-3.235 1.028-.565 2.2-.808 3.468-.72.447.03.883.084 1.303.161-.12-.857-.477-1.423-.979-1.694-.545-.292-1.245-.355-1.78-.16-.617.224-1.126.747-1.516 1.555l-1.972-.906c.568-1.24 1.46-2.154 2.643-2.72 1.002-.476 2.123-.616 3.237-.405 1.4.267 2.483 1.038 3.13 2.233.551 1.014.787 2.285.696 3.78a11.72 11.72 0 0 1-.1.99c-.11.762-.286 1.46-.52 2.083 1.58.048 3.121.386 4.573.996-.015.14-.03.278-.046.414-.257 2.155-1.023 3.932-2.278 5.282C17.236 22.803 14.85 23.975 12.186 24z"/>
      </svg>
    ),
  },
  {
    key: "bluesky",
    name: "Bluesky",
    available: true,
    charLimit: 300,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 600 530" fill="currentColor">
        <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.106 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/>
      </svg>
    ),
  },
  {
    key: "x",
    name: "X",
    available: true,
    charLimit: 280,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.259 5.632L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
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

function splitLocalDateTime(value: string) {
  const [datePart = "", timePart = "12:00"] = value.split("T");
  return { datePart, timePart: timePart.slice(0, 5) || "12:00" };
}

function combineLocalDateTime(datePart: string, timePart: string) {
  const safeDate = datePart || new Date().toISOString().slice(0, 10);
  const safeTime = timePart || "12:00";
  return `${safeDate}T${safeTime}`;
}

function parseDatePart(datePart: string) {
  const [rawY, rawM, rawD] = datePart.split("-");
  const y = Number(rawY);
  const m = Number(rawM);
  const d = Number(rawD);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function toDatePart(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatScheduleSummary(datePart: string, timePart: string) {
  const date = parseDatePart(datePart);
  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(`${datePart}T${timePart || "12:00"}`)
  );
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  return `${dateLabel} at ${timeLabel}`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function buildCalendarDays(monthCursor: Date) {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + index);
    return {
      key: d.toISOString(),
      date: d,
      inCurrentMonth: d.getMonth() === month,
    };
  });
}

function toTimePart(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getNextHourLocalDateTimeValue() {
  const d = new Date();
  if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) {
    d.setHours(d.getHours() + 1);
  }
  d.setMinutes(0, 0, 0);
  return combineLocalDateTime(toDatePart(d), toTimePart(d));
}

function formatTimeOptionLabel(timePart: string) {
  const [rawH = "0", rawM = "0"] = timePart.split(":");
  const d = new Date();
  d.setHours(Number(rawH), Number(rawM), 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}

function buildTimeOptions(stepMinutes = 15) {
  const options: Array<{ value: string; label: string }> = [];
  for (let totalMinutes = 0; totalMinutes < 24 * 60; totalMinutes += stepMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    options.push({ value, label: formatTimeOptionLabel(value) });
  }
  return options;
}

export default function UploadsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const { teamId } = useTeam();
  const [step, setStep] = useState<Step>("upload");

  // Draft editing
  const [draftEditGroupId, setDraftEditGroupId] = useState<string | null>(null);

  // Connected platform accounts (for showing "posting as" info)
  const [platformAccounts, setPlatformAccounts] = useState<Record<string, { profileName: string | null; avatarUrl: string | null }>>({
    youtube: { profileName: null, avatarUrl: null },
    tiktok: { profileName: null, avatarUrl: null },
    instagram: { profileName: null, avatarUrl: null },
    facebook: { profileName: null, avatarUrl: null },
    linkedin: { profileName: null, avatarUrl: null },
    threads: { profileName: null, avatarUrl: null },
    bluesky: { profileName: null, avatarUrl: null },
    x: { profileName: null, avatarUrl: null },
  });
  // Full list of connected accounts per provider (for multi-account picker)
  const [platformAccountsList, setPlatformAccountsList] = useState<Record<string, Array<{ id: string; profileName: string | null; avatarUrl: string | null }>>>({});
  // Which account ids are selected per provider (supports multi-select)
  const [selectedAccountIds, setSelectedAccountIds] = useState<Record<string, string[]>>({});

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
  const threadsEnabled = isThreadsEnabledForUserIdClient(userId);
  const enabledPlatforms = useMemo(
    () => PLATFORMS.filter((p) => p.key !== "threads" || threadsEnabled),
    [threadsEnabled]
  );
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
  const [ytPublicStats, setYtPublicStats] = useState(true);

  // YouTube presets
  const [ytPresets, setYtPresets] = useState<YouTubePreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  // TikTok specific
  const [ttPrivacyLevel, setTtPrivacyLevel] = useState("");
  const [ttAllowComments, setTtAllowComments] = useState(false);
  const [ttAllowDuet, setTtAllowDuet] = useState(false);
  const [ttAllowStitch, setTtAllowStitch] = useState(false);

  // TikTok creator info
  type TtCreatorInfo = {
    nickname: string | null;
    privacy_level_options: string[];
    comment_disabled: boolean;
    duet_disabled: boolean;
    stitch_disabled: boolean;
    max_video_post_duration_sec: number;
    can_post: boolean;
  };
  const [ttCreatorInfo, setTtCreatorInfo] = useState<TtCreatorInfo | null>(null);
  const [ttCreatorLoading, setTtCreatorLoading] = useState(false);
  const [ttCreatorError, setTtCreatorError] = useState<string | null>(null);
  const [ttCommercialToggle, setTtCommercialToggle] = useState(false);
  const [ttBrandOrganic, setTtBrandOrganic] = useState(false);
  const [ttBrandContent, setTtBrandContent] = useState(false);
  const [ttConsentChecked, setTtConsentChecked] = useState(false);
  const [ttContentRightsChecked, setTtContentRightsChecked] = useState(false);
  const [ttAigcDisclosure, setTtAigcDisclosure] = useState(false);

  // Per-platform caption overrides
  const [platformTitleOverrides, setPlatformTitleOverrides] = useState<Record<string, string>>({});
  const [platformDescOverrides, setPlatformDescOverrides] = useState<Record<string, string>>({});
  const [openCaptionOverride, setOpenCaptionOverride] = useState<string | null>(null);
  const [linkedinVisibility, setLinkedinVisibility] = useState<"PUBLIC" | "CONNECTIONS">("PUBLIC");
  const [xReplySettings, setXReplySettings] = useState<"everyone" | "mentionedUsers" | "subscribers">("everyone");

  // Post templates (localStorage)
  const TEMPLATES_KEY = "clipdash_post_templates";
  type PostTemplate = { id: string; name: string; title: string; description: string; hashtags: string[]; platforms: string[] };
  const [templates, setTemplates] = useState<PostTemplate[]>([]);
  const [showTemplatesMenu, setShowTemplatesMenu] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [showSaveTemplateName, setShowSaveTemplateName] = useState(false);
  const templatesMenuRef = useRef<HTMLDivElement>(null);

  // Queue state
  const [queuePreview, setQueuePreview] = useState<string | null>(null);

  // Object URL for the in-browser video preview
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Video duration (seconds), read client-side when file is selected
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  // Instagram specific
  const [igType, setIgType] = useState<InstagramType>("reel");
  const [igFirstComment, setIgFirstComment] = useState("");
  const [igShopLink, setIgShopLink] = useState("");

  // Scheduling
  const defaultWhen = useMemo(() => {
    return getNextHourLocalDateTimeValue();
  }, []);
  const [scheduledForLocal, setScheduledForLocal] = useState(defaultWhen);
  const [scheduleType, setScheduleType] = useState<"now" | "scheduled">("scheduled");
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [showScheduleActions, setShowScheduleActions] = useState(false);
  const { datePart: scheduledDatePart, timePart: scheduledTimePart } = useMemo(
    () => splitLocalDateTime(scheduledForLocal),
    [scheduledForLocal]
  );
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const d = parseDatePart(splitLocalDateTime(defaultWhen).datePart);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const schedulePickerRef = useRef<HTMLDivElement>(null);

  const BUCKET = process.env.NEXT_PUBLIC_UPLOADS_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET || "clips";

  const maxCharLimit = useMemo(() => {
    const selected = enabledPlatforms.filter((p) => selectedPlatforms.includes(p.key));
    if (selected.length === 0) return 5000;
    return Math.min(...selected.map((p) => p.charLimit));
  }, [selectedPlatforms, enabledPlatforms]);
  const timezoneLabel = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Local timezone", []);
  const scheduleSummary = useMemo(
    () => formatScheduleSummary(scheduledDatePart, scheduledTimePart),
    [scheduledDatePart, scheduledTimePart]
  );
  const calendarDays = useMemo(() => buildCalendarDays(calendarCursor), [calendarCursor]);
  const timeOptions = useMemo(() => buildTimeOptions(15), []);

  // Load presets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_YT_PRESETS);
    if (saved) {
      try {
        setYtPresets(JSON.parse(saved));
      } catch {}
    }
    const savedTemplates = localStorage.getItem(TEMPLATES_KEY);
    if (savedTemplates) {
      try {
        setTemplates(JSON.parse(savedTemplates));
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

  // Close templates menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (templatesMenuRef.current && !templatesMenuRef.current.contains(e.target as Node)) {
        setShowTemplatesMenu(false);
      }
    }
    if (showTemplatesMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTemplatesMenu]);

  useEffect(() => {
    const d = parseDatePart(scheduledDatePart);
    setCalendarCursor((prev) => {
      if (prev.getFullYear() === d.getFullYear() && prev.getMonth() === d.getMonth()) return prev;
      return new Date(d.getFullYear(), d.getMonth(), 1);
    });
  }, [scheduledDatePart]);

  useEffect(() => {
    if (!showSchedulePicker && !showScheduleActions) return;
    function handleClickOutside(e: MouseEvent) {
      if (schedulePickerRef.current && !schedulePickerRef.current.contains(e.target as Node)) {
        setShowSchedulePicker(false);
        setShowScheduleActions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSchedulePicker, showScheduleActions]);

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

      // Load connected platform accounts
      try {
        const paRes = await fetch("/api/platform-accounts", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const paJson = await paRes.json();
        if (paJson.ok) {
          const lists: Record<string, Array<{ id: string; profileName: string | null; avatarUrl: string | null }>> = {};
          const autoSelect: Record<string, string[]> = {};
          const accts: Record<string, { profileName: string | null; avatarUrl: string | null }> = {};
          for (const row of paJson.data || []) {
            if (!row.provider || !row.id) continue;
            if (!lists[row.provider]) lists[row.provider] = [];
            lists[row.provider].push({ id: row.id, profileName: row.profile_name || null, avatarUrl: row.avatar_url || null });
          }
          for (const [provider, provAccts] of Object.entries(lists)) {
            if (provAccts.length > 0) {
              autoSelect[provider] = provAccts.map((a) => a.id);
              accts[provider] = { profileName: provAccts[0].profileName, avatarUrl: provAccts[0].avatarUrl };
            }
          }
          setPlatformAccountsList(lists);
          setSelectedAccountIds(autoSelect);
          setPlatformAccounts(accts);
        }
      } catch {}

      // Load platform defaults
      try {
        const res = await fetch("/api/platform-defaults", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const json = await res.json();
        if (json.ok && json.defaults) {
          for (const row of json.defaults) {
            const s = row.settings || {};
            if (row.platform === "youtube") {
              if (s.category) setYtCategory(s.category);
              if (s.visibility) setYtVisibility(s.visibility);
              if (typeof s.notifySubscribers === "boolean") setYtNotifySubscribers(s.notifySubscribers);
              if (typeof s.allowComments === "boolean") setYtAllowComments(s.allowComments);
              if (typeof s.allowEmbedding === "boolean") setYtAllowEmbedding(s.allowEmbedding);
              if (typeof s.madeForKids === "boolean") setYtMadeForKids(s.madeForKids);
              if (typeof s.publicStats === "boolean") setYtPublicStats(s.publicStats);
            } else if (row.platform === "tiktok") {
              // TikTok privacy, comments, duet, and stitch settings must be chosen
              // manually on each upload per TikTok UX requirements — never pre-fill.
              // Reset creator info cache so it re-fetches fresh.
              setTtCreatorInfo(null);
            } else if (row.platform === "instagram") {
              if (s.igType) setIgType(s.igType);
              if (typeof s.firstComment === "string") setIgFirstComment(s.firstComment);
            }
          }
        }
      } catch {}

      // Load draft for editing if ?draft=GROUP_ID is in the URL
      const draftGroupId = new URLSearchParams(window.location.search).get("draft");
      if (draftGroupId) {
        try {
          const { data: draftPosts } = await supabase
            .from("scheduled_posts")
            .select("id, upload_id, title, description, provider, scheduled_for, privacy_status, youtube_settings, tiktok_settings, instagram_settings, thumbnail_path, group_id")
            .eq("status", "draft")
            .or(`group_id.eq.${draftGroupId},id.eq.${draftGroupId}`);

          if (draftPosts && draftPosts.length > 0) {
            const first = draftPosts[0];
            setTitle(first.title || "");
            setDescription(first.description || "");
            setLastUploadId(first.upload_id);
            setSelectedPlatforms(
              draftPosts
                .map((p: any) => p.provider)
                .filter((p: string) => Boolean(p) && (p !== "threads" || threadsEnabled))
            );
            if (first.thumbnail_path) setLastThumbnailPath(first.thumbnail_path);
            if (first.scheduled_for) {
              const d = new Date(first.scheduled_for);
              const localISO = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
              setScheduledForLocal(localISO);
            }

            const ytPost = draftPosts.find((p: any) => p.provider === "youtube");
            if (ytPost?.youtube_settings) {
              const s = ytPost.youtube_settings;
              if (s.is_short !== undefined) setYtIsShort(s.is_short);
              if (s.category) setYtCategory(s.category);
              if (s.notify_subscribers !== undefined) setYtNotifySubscribers(s.notify_subscribers);
              if (s.allow_comments !== undefined) setYtAllowComments(s.allow_comments);
              if (s.allow_embedding !== undefined) setYtAllowEmbedding(s.allow_embedding);
              if (s.made_for_kids !== undefined) setYtMadeForKids(s.made_for_kids);
              if (s.public_stats_viewable !== undefined) setYtPublicStats(s.public_stats_viewable);
            }
            if (ytPost?.privacy_status) setYtVisibility(ytPost.privacy_status);

            const ttPost = draftPosts.find((p: any) => p.provider === "tiktok");
            if (ttPost?.tiktok_settings) {
              const s = ttPost.tiktok_settings;
              if (s.privacy_level) setTtPrivacyLevel(s.privacy_level);
              if (s.allow_comments !== undefined) setTtAllowComments(s.allow_comments);
              if (s.allow_duet !== undefined) setTtAllowDuet(s.allow_duet);
              if (s.allow_stitch !== undefined) setTtAllowStitch(s.allow_stitch);
            }

            const igPost = draftPosts.find((p: any) => p.provider === "instagram");
            if (igPost?.instagram_settings) {
              const s = igPost.instagram_settings;
              if (s.ig_type) setIgType(s.ig_type);
              if (s.first_comment !== undefined) setIgFirstComment(s.first_comment);
            }

            setDraftEditGroupId(draftGroupId);
            setStep("details");
          }
        } catch {}
      }
    }
    loadSession();
  }, []);

  useEffect(() => {
    if (threadsEnabled) return;
    setSelectedPlatforms((prev) => prev.filter((p) => p !== "threads"));
  }, [threadsEnabled]);

  // Fetch TikTok creator info when TikTok is selected
  useEffect(() => {
    if (!selectedPlatforms.includes("tiktok") || ttCreatorInfo) return;
    let cancelled = false;

    async function fetchCreatorInfo() {
      setTtCreatorLoading(true);
      setTtCreatorError(null);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return;

        const res = await fetch("/api/tiktok/creator-info", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (cancelled) return;

        if (!json.ok) {
          setTtCreatorError(json.error || "Failed to load TikTok creator info");
          return;
        }

        setTtCreatorInfo(json.creator_info);
      } catch (e: any) {
        if (!cancelled) setTtCreatorError(e?.message || "Failed to load TikTok creator info");
      } finally {
        if (!cancelled) setTtCreatorLoading(false);
      }
    }

    fetchCreatorInfo();
    return () => { cancelled = true; };
  }, [selectedPlatforms, ttCreatorInfo]);

  // Enforce branded content constraint: if branded content selected, SELF_ONLY not allowed
  useEffect(() => {
    if (ttBrandContent && ttPrivacyLevel === "SELF_ONLY") {
      setTtPrivacyLevel("");
    }
  }, [ttBrandContent, ttPrivacyLevel]);

  // Read video duration from file metadata
  useEffect(() => {
    if (!file) { setVideoDuration(null); return; }
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      setVideoDuration(video.duration);
      URL.revokeObjectURL(url);
    };
    video.onerror = () => URL.revokeObjectURL(url);
  }, [file]);

  // Object URL for the live post preview panel
  useEffect(() => {
    if (!file) { setVideoPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Compute TikTok validation
  const ttValidationError = useMemo(() => {
    if (!selectedPlatforms.includes("tiktok")) return null;
    if (ttCreatorError) return ttCreatorError;
    if (ttCreatorInfo && !ttCreatorInfo.can_post) return "Your TikTok account is not currently eligible to post. Please try again later.";
    if (!ttPrivacyLevel) return "Please select a privacy level for TikTok";
    if (ttCommercialToggle && !ttBrandOrganic && !ttBrandContent) return "Please select at least one commercial content type";
    if (ttCreatorInfo && ttCreatorInfo.max_video_post_duration_sec > 0 && videoDuration !== null && videoDuration > ttCreatorInfo.max_video_post_duration_sec) {
      return `Video exceeds TikTok's maximum duration of ${ttCreatorInfo.max_video_post_duration_sec}s for your account (video is ${Math.round(videoDuration)}s).`;
    }
    if (!ttConsentChecked) return "Agree to TikTok's Music Usage Confirmation to continue";
    if (!ttContentRightsChecked) return "Confirm your content rights to continue";
    return null;
  }, [selectedPlatforms, ttCreatorError, ttCreatorInfo, ttPrivacyLevel, ttCommercialToggle, ttBrandOrganic, ttBrandContent, videoDuration, ttConsentChecked, ttContentRightsChecked]);

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

  function toggleAccountSelection(provider: string, accountId: string) {
    setSelectedAccountIds((prev) => {
      const current = prev[provider] || [];
      if (current.includes(accountId)) {
        return { ...prev, [provider]: current.filter((id) => id !== accountId) };
      }
      return { ...prev, [provider]: [...current, accountId] };
    });
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
      publicStats: ytPublicStats,
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
    setYtPublicStats(preset.publicStats ?? true);
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
        body: JSON.stringify({ bucket: BUCKET, file_path: objectKey, file_size: file.size }),
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

      // Delete old draft posts if we're editing an existing draft
      if (draftEditGroupId) {
        await fetch(`/api/scheduled-posts?groupId=${encodeURIComponent(draftEditGroupId)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      // Create a separate scheduled post for each selected platform × selected account
      const errors: string[] = [];
      const groupId = crypto.randomUUID();
      const platformsToSchedule = selectedPlatforms.filter((p) => p !== "threads" || threadsEnabled);

      // Count total posts to create (for error threshold check)
      let totalPostsToCreate = 0;
      for (const platform of platformsToSchedule) {
        const acctIds = (selectedAccountIds[platform] || []).filter(Boolean);
        totalPostsToCreate += Math.max(acctIds.length, 1);
      }

      for (const platform of platformsToSchedule) {
        const acctIds = (selectedAccountIds[platform] || []).filter(Boolean);
        const idsToPost: Array<string | null> = acctIds.length > 0 ? acctIds : [null];

        for (const accountId of idsToPost) {
        const body: any = {
          group_id: groupId,
          upload_id: lastUploadId,
          provider: platform,
          platform_account_id: accountId,
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

        // Apply per-platform caption overrides
        if (platformTitleOverrides[platform]) body.title = platformTitleOverrides[platform];
        if (platformDescOverrides[platform]) body.description = platformDescOverrides[platform];

        if (platform === "youtube") {
          body.youtube_settings = {
            is_short: ytIsShort,
            category: ytCategory,
            notify_subscribers: ytNotifySubscribers,
            allow_comments: ytAllowComments,
            allow_embedding: ytAllowEmbedding,
            made_for_kids: ytMadeForKids,
            public_stats_viewable: ytPublicStats,
            title_override: platformTitleOverrides.youtube || undefined,
            description_override: platformDescOverrides.youtube || undefined,
          };
        }

        if (platform === "tiktok") {
          body.tiktok_settings = {
            privacy_level: ttPrivacyLevel,
            allow_comments: ttAllowComments,
            allow_duet: ttAllowDuet,
            allow_stitch: ttAllowStitch,
            brand_organic_toggle: ttBrandOrganic,
            brand_content_toggle: ttBrandContent,
            aigc_disclosure: ttAigcDisclosure,
            title_override: platformTitleOverrides.tiktok || undefined,
            description_override: platformDescOverrides.tiktok || undefined,
          };
        }

        if (platform === "facebook") {
          body.facebook_settings = {
            title_override: platformTitleOverrides.facebook || undefined,
            description_override: platformDescOverrides.facebook || undefined,
          };
        }

        if (platform === "instagram") {
          body.instagram_settings = {
            ig_type: igType,
            first_comment: igFirstComment || undefined,
            title_override: platformTitleOverrides.instagram || undefined,
            description_override: platformDescOverrides.instagram || undefined,
          };
        }

        if (platform === "linkedin") {
          body.linkedin_settings = {
            title_override: platformTitleOverrides.linkedin || undefined,
            description_override: platformDescOverrides.linkedin || undefined,
            visibility: linkedinVisibility !== "PUBLIC" ? linkedinVisibility : undefined,
          };
        }

        if (platform === "threads") {
          body.threads_settings = {
            title_override: platformTitleOverrides.threads || undefined,
            description_override: platformDescOverrides.threads || undefined,
          };
        }

        if (platform === "bluesky") {
          body.bluesky_settings = {
            title_override: platformTitleOverrides.bluesky || undefined,
            description_override: platformDescOverrides.bluesky || undefined,
          };
        }

        if (platform === "x") {
          body.x_settings = {
            description_override: platformDescOverrides.x || undefined,
            reply_settings: xReplySettings !== "everyone" ? xReplySettings : undefined,
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
        } // end accountId loop
      } // end platform loop

      if (errors.length === totalPostsToCreate) {
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

  function computeNextQueueSlot(posts: Array<{ status: string; scheduled_for?: string | null }>): Date {
    const future = posts.filter((p) => p.status === "scheduled" && p.scheduled_for);
    if (future.length === 0) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    const latest = new Date(Math.max(...future.map((p) => new Date(p.scheduled_for!).getTime())));
    latest.setTime(latest.getTime() + 24 * 60 * 60 * 1000);
    return latest;
  }

  async function handleSelectQueue() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/scheduled-posts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      const posts = json?.data || [];
      const slot = computeNextQueueSlot(posts);
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${slot.getFullYear()}-${pad(slot.getMonth() + 1)}-${pad(slot.getDate())}T${pad(slot.getHours())}:${pad(slot.getMinutes())}`;
      setScheduledForLocal(local);
      setScheduleType("scheduled");
      setShowScheduleActions(false);
      setShowSchedulePicker(false);
      const preview = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(slot);
      setQueuePreview(preview);
    } catch {}
  }

  function loadTemplate(t: PostTemplate) {
    setTitle(t.title);
    setDescription(t.description);
    setHashtags(t.hashtags);
    setSelectedPlatforms(
      t.platforms.filter(
        (p) => enabledPlatforms.some((pl) => pl.key === p) && (p !== "threads" || threadsEnabled)
      )
    );
    setShowTemplatesMenu(false);
  }

  function saveCurrentTemplate(name: string) {
    const newTemplate: PostTemplate = {
      id: crypto.randomUUID(),
      name,
      title,
      description,
      hashtags,
      platforms: selectedPlatforms,
    };
    const updated = [...templates, newTemplate];
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
    setShowSaveTemplateName(false);
    setNewTemplateName("");
    setShowTemplatesMenu(false);
  }

  function deleteTemplate(id: string) {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
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
    setDraftEditGroupId(null);
    setPlatformTitleOverrides({});
    setPlatformDescOverrides({});
    setOpenCaptionOverride(null);
    setQueuePreview(null);
    // Reset all TikTok state — privacy, consent, and interaction toggles must
    // be chosen fresh on every upload per TikTok's UX requirements.
    setTtPrivacyLevel("");
    setTtConsentChecked(false);
    setTtContentRightsChecked(false);
    setTtAigcDisclosure(false);
    setTtAllowComments(false);
    setTtAllowDuet(false);
    setTtAllowStitch(false);
    setTtCommercialToggle(false);
    setTtBrandOrganic(false);
    setTtBrandContent(false);
    setTtCreatorInfo(null);
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-blue-500/[0.08] via-purple-500/[0.06] to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-gradient-to-t from-purple-500/[0.06] to-transparent blur-3xl" />
        <div className="absolute -top-20 left-[-6rem] h-64 w-64 rounded-full bg-pink-500/[0.05] blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <Link href="/dashboard" className="mb-8 inline-flex items-center gap-1 text-sm text-white/40 transition-colors hover:text-white/70">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 font-medium text-blue-300">Uploads</span>
            <span className={`rounded-full border px-3 py-1 font-medium ${step === "upload" ? "border-blue-400/30 bg-blue-400/10 text-blue-300" : "border-white/10 bg-white/5 text-white/40"}`}>1. Upload</span>
            <span className={`rounded-full border px-3 py-1 font-medium ${step === "details" ? "border-blue-400/30 bg-blue-400/10 text-blue-300" : "border-white/10 bg-white/5 text-white/40"}`}>2. Configure</span>
          </div>

          <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{step === "upload" ? "Upload your next video" : draftEditGroupId ? "Edit draft" : "Configure your post"}</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70 sm:text-base">{step === "upload" ? "Drop in your video and move into platform setup in one smooth flow." : draftEditGroupId ? "Update your draft settings and schedule or save it again." : "Tune copy, hashtags, media details, and schedule for each connected platform."}</p>
          </div>
          {step === "details" && (
            <button onClick={resetUpload} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white">
              Upload different video
            </button>
          )}
        </div>
        </div>

        {/* Subscribe banner */}
        {planActive === false && (
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-amber-400/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100 shadow-[0_10px_30px_rgba(245,158,11,0.16)]">
            <span>You need an active subscription to upload and schedule posts.</span>
            <Link href="/settings" className="rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-black transition-colors hover:bg-amber-200">
              Subscribe
            </Link>
          </div>
        )}

        {/* Upload Step */}
        {step === "upload" && (
          <div className="mt-8">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`relative rounded-3xl border-2 border-dashed px-6 py-16 text-center shadow-[0_24px_90px_rgba(2,6,23,0.5)] transition-all backdrop-blur-xl ${dragOver ? "border-blue-400/50 bg-blue-400/10" : file ? "border-emerald-300/40 bg-emerald-300/10" : "border-white/15 bg-white/[0.03] hover:border-blue-300/35 hover:bg-white/[0.05]"}`}
            >
              {uploading ? (
                <div className="space-y-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                    <svg className="h-8 w-8 animate-pulse text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div><p className="font-medium text-white">Uploading...</p><p className="mt-1 text-sm text-white/70">{uploadProgress}%</p></div>
                  <div className="w-full max-w-xs mx-auto h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : file ? (
                <div className="space-y-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-300/15">
                    <svg className="h-8 w-8 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div><p className="font-medium text-white">{file.name}</p><p className="mt-1 text-sm text-white/70">{(file.size / (1024 * 1024)).toFixed(2)} MB</p></div>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setFile(null)} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10">Remove</button>
                    <button onClick={doUpload} disabled={planActive === false} className="rounded-full bg-gradient-to-r from-blue-400 to-purple-400 px-6 py-2 text-sm font-semibold text-black transition-colors hover:from-blue-300 hover:to-purple-300 disabled:cursor-not-allowed disabled:opacity-50">Upload</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                    <svg className="h-8 w-8 text-blue-300/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div><p className="font-medium text-white">Drop your video here</p><p className="mt-1 text-sm text-white/70">or click to browse</p></div>
                  <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              )}
            </div>
            <p className="mt-4 text-center text-xs text-white/40">Supported formats: MP4, MOV, AVI, WebM</p>
          </div>
        )}

        {/* Details Step */}
        {step === "details" && (
          <div className="mt-8 grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 items-start">
          <div className="space-y-6">
            {/* Platform Selector */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
              <div className="mb-3 text-sm text-white/70">Post to</div>
              <div className="flex items-center gap-2 flex-wrap">
                {enabledPlatforms.map((platform) => (
                  <button
                    key={platform.key}
                    onClick={() => platform.available && togglePlatform(platform.key)}
                    disabled={!platform.available}
                    className={`relative flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${selectedPlatforms.includes(platform.key) ? "border-blue-400/50 bg-blue-400/20 text-blue-200" : platform.available ? "border-white/10 bg-white/5 text-white/70 hover:border-blue-300/30 hover:bg-white/10" : "border-white/5 bg-white/[0.02] text-white/20 cursor-not-allowed"}`}
                  >
                    <span>{platform.icon}</span>
                    <span>{platform.name}</span>
                    {!platform.available && <span className="ml-1 text-[10px] text-white/20">Soon</span>}
                  </button>
                ))}
              </div>
              {/* Account selection for selected platforms */}
              {selectedPlatforms.some((p) => (platformAccountsList[p]?.length ?? 0) > 0) && (
                <div className="mt-3 space-y-2">
                  {selectedPlatforms.map((p) => {
                    const accts = platformAccountsList[p] || [];
                    if (accts.length === 0) return null;
                    const platform = PLATFORMS.find((pl) => pl.key === p);
                    const selectedIds = selectedAccountIds[p] || [];

                    if (accts.length === 1) {
                      const acct = accts[0];
                      return (
                        <div key={p} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
                          {acct.avatarUrl && <img src={proxiedAvatar(acct.avatarUrl) ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-4 w-4 rounded-full object-cover" />}
                          <span className="text-white/40">{platform?.name}:</span>
                          <span className="text-white/80 font-medium">{acct.profileName || "Account"}</span>
                        </div>
                      );
                    }

                    return (
                      <div key={p} className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-white/50">{platform?.icon}</span>
                          <span className="text-xs font-medium text-white/60">{platform?.name}</span>
                          <span className="text-xs text-white/30">— select accounts to post to</span>
                          {selectedIds.length < accts.length ? (
                            <button type="button" onClick={() => setSelectedAccountIds((prev) => ({ ...prev, [p]: accts.map((a) => a.id) }))} className="ml-auto text-xs text-blue-400/70 hover:text-blue-300 transition-colors">
                              Select all
                            </button>
                          ) : (
                            <button type="button" onClick={() => setSelectedAccountIds((prev) => ({ ...prev, [p]: [] }))} className="ml-auto text-xs text-white/40 hover:text-white/70 transition-colors">
                              Deselect all
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {accts.map((acct) => {
                            const checked = selectedIds.includes(acct.id);
                            return (
                              <button
                                key={acct.id}
                                type="button"
                                onClick={() => toggleAccountSelection(p, acct.id)}
                                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all ${checked ? "border-blue-400/50 bg-blue-400/15 text-blue-200" : "border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white/60"}`}
                              >
                                {acct.avatarUrl && <img src={proxiedAvatar(acct.avatarUrl) ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-4 w-4 rounded-full object-cover" />}
                                <span>{acct.profileName || "Account"}</span>
                                <span className={`ml-0.5 h-1.5 w-1.5 rounded-full ${checked ? "bg-blue-400" : "bg-white/20"}`} />
                              </button>
                            );
                          })}
                        </div>
                        {selectedIds.length === 0 && (
                          <p className="mt-2 text-xs text-amber-400/70">Select at least one account to post to {platform?.name}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Main Content Area */}
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
              {/* Templates */}
              <div className="border-b border-white/10 px-5 py-3 flex items-center gap-2">
                <div className="relative" ref={templatesMenuRef}>
                  <button
                    type="button"
                    onClick={() => { setShowTemplatesMenu((v) => !v); setShowSaveTemplateName(false); }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/70 hover:bg-white/[0.07] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Templates
                    <svg className={`w-3.5 h-3.5 text-white/40 transition-transform ${showTemplatesMenu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showTemplatesMenu && (
                    <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-72 overflow-hidden rounded-2xl border border-white/12 bg-[#0e1118] shadow-[0_24px_60px_rgba(2,6,23,0.6)]">
                      {templates.length === 0 && (
                        <p className="px-4 py-3 text-xs text-white/40">No saved templates yet.</p>
                      )}
                      {templates.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2 last:border-0 hover:bg-white/[0.05]">
                          <button onClick={() => loadTemplate(t)} className="flex-1 text-left text-sm text-white/80 hover:text-white">
                            {t.name}
                          </button>
                          <button onClick={() => deleteTemplate(t.id)} className="shrink-0 rounded p-1 text-white/30 hover:bg-white/10 hover:text-red-400">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <div className="border-t border-white/10">
                        {showSaveTemplateName ? (
                          <div className="flex items-center gap-2 p-3">
                            <input
                              type="text"
                              value={newTemplateName}
                              onChange={(e) => setNewTemplateName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter" && newTemplateName.trim()) saveCurrentTemplate(newTemplateName.trim()); }}
                              placeholder="Template name..."
                              autoFocus
                              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40"
                            />
                            <button
                              onClick={() => { if (newTemplateName.trim()) saveCurrentTemplate(newTemplateName.trim()); }}
                              disabled={!newTemplateName.trim()}
                              className="rounded-lg bg-blue-400 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                            >Save</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowSaveTemplateName(true)}
                            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Save current as template...
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Title */}
              <div className="border-b border-white/10 p-5">
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter a title for your video" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-lg font-medium text-white placeholder-white/30 outline-none focus:border-blue-300/40 focus:bg-white/10" />
              </div>

              {/* Description */}
              <div className="border-b border-white/10 p-5">
                <textarea ref={descriptionRef} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What would you like to share?" rows={4} className="w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40 focus:bg-white/10" />

                {/* Toolbar */}
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                  <div className="relative" ref={emojiPickerRef}>
                    <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`rounded-lg p-2 transition-colors ${showEmojiPicker ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/10 hover:text-white"}`} title="Add emoji">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    {/* Emoji Picker */}
                    {showEmojiPicker && (
                      <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 shadow-xl backdrop-blur">
                        {/* Category Tabs */}
                        <div className="flex border-b border-white/5">
                          {Object.keys(EMOJI_CATEGORIES).map((cat) => (
                            <button key={cat} onClick={() => setSelectedEmojiCategory(cat)} className={`flex-1 px-3 py-2 text-xs transition-colors ${selectedEmojiCategory === cat ? "bg-white/10 text-white" : "text-white/40 hover:text-white"}`}>
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
                  <div className="text-xs text-white/40">{description.length} / {maxCharLimit}</div>
                </div>
              </div>

              {/* Hashtags */}
              <div className="border-b border-white/10 p-5">
                <label className="mb-2 block text-xs text-white/70">Hashtags</label>
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5 min-h-[44px]" onClick={() => hashtagInputRef.current?.focus()}>
                  {hashtags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-blue-400/20 bg-blue-400/15 py-1 pl-3 pr-1.5 text-sm text-blue-200">
                      <span className="text-blue-400/70">#</span>
                      <span>{tag}</span>
                      <button onClick={() => removeHashtag(tag)} className="ml-1 rounded-full p-0.5 text-blue-300/70 transition-colors hover:bg-white/10 hover:text-white">
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
                  <p className="text-xs text-white/40">Press Enter or comma to add a tag</p>
                  {!showAiPrompt && (
                    <button
                      onClick={startAiSuggest}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-gradient-to-r from-blue-400/20 to-purple-400/20 px-3 py-1.5 text-xs text-blue-300 transition-all hover:from-blue-400/30 hover:to-purple-400/30 disabled:opacity-50"
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
                  <div className="mt-3 rounded-xl border border-blue-400/30 bg-blue-400/[0.08] p-4">
                    <label className="mb-2 block text-xs font-medium text-blue-300">What's this video about?</label>
                    <input
                      type="text"
                      value={aiContext}
                      onChange={(e) => setAiContext(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && aiContext.trim() && handleAiSuggest()}
                      placeholder="e.g. Warzone gameplay highlights with funny moments"
                      className="w-full rounded-lg border border-blue-400/30 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/60"
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-2 mt-3">
                      <button
                        onClick={() => { setShowAiPrompt(false); setAiContext(""); }}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAiSuggest}
                        disabled={!aiContext.trim()}
                        className="rounded-full bg-gradient-to-r from-blue-400 to-purple-400 px-4 py-1.5 text-xs font-semibold text-black transition-all hover:from-blue-300 hover:to-purple-300 disabled:opacity-50"
                      >
                        Generate Tags
                      </button>
                    </div>
                  </div>
                )}

                {/* AI Suggestions Panel */}
                {aiSuggestions.length > 0 && (
                  <div className="mt-3 rounded-xl border border-blue-400/30 bg-blue-400/[0.08] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-blue-300">Suggested tags</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={addAllSuggestedTags}
                          className="text-xs text-blue-300 transition-colors hover:text-blue-200"
                        >
                          Add all
                        </button>
                        <button
                          onClick={() => setAiSuggestions([])}
                          className="text-xs text-white/40 transition-colors hover:text-white/70"
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
                          className="group relative inline-flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-400/15 py-1.5 pl-3 pr-2.5 text-sm text-blue-200 transition-all hover:border-blue-300/40 hover:bg-blue-400/20"
                          title={s.reason}
                        >
                          <span className="text-blue-400/70">#</span>
                          <span>{s.tag}</span>
                          <svg className="h-3.5 w-3.5 text-blue-300/50 group-hover:text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] text-white/40">Click a tag to add it. Hover for why it was suggested.</p>
                  </div>
                )}
              </div>

              {/* Thumbnail */}
              <div className="border-b border-white/10 p-5">
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
                    <p className="text-sm text-white">Thumbnail</p>
                    <p className="mt-0.5 text-xs text-white/40">1280x720 recommended</p>
                    <label className="mt-2 inline-flex cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10">
                      {thumbnail ? "Change" : "Upload"}
                      <input type="file" accept="image/*" onChange={handleThumbnailChange} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Scheduling */}
              <div className="p-5">
                <div className="space-y-4" ref={schedulePickerRef}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45">Publishing</p>
                      <p className="mt-1 text-sm text-white/65">Set when this post goes live.</p>
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowScheduleActions((v) => !v)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white/85 transition-colors hover:bg-white/[0.08]"
                      >
                        <span>{queuePreview ? "Add to Queue" : scheduleType === "now" ? "Now" : "Set Date and Time"}</span>
                        <svg className={`h-4 w-4 text-white/60 transition-transform ${showScheduleActions ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {showScheduleActions && (
                        <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-72 overflow-hidden rounded-2xl border border-white/12 bg-[#0e1118] shadow-[0_24px_60px_rgba(2,6,23,0.6)]">
                          <button
                            type="button"
                            onClick={() => {
                              setScheduleType("scheduled");
                              setShowScheduleActions(false);
                              setShowSchedulePicker(true);
                              setQueuePreview(null);
                            }}
                            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${scheduleType === "scheduled" && !queuePreview ? "bg-white/[0.08]" : "hover:bg-white/[0.06]"}`}
                          >
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-300" />
                            <span>
                              <span className="block text-sm font-semibold text-white">Set Date and Time</span>
                              <span className="mt-0.5 block text-xs text-white/55">Choose a specific time to publish.</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setScheduleType("now");
                              setShowScheduleActions(false);
                              setShowSchedulePicker(false);
                              setQueuePreview(null);
                            }}
                            className={`flex w-full items-start gap-3 border-t border-white/10 px-4 py-3 text-left transition-colors ${scheduleType === "now" ? "bg-white/[0.08]" : "hover:bg-white/[0.06]"}`}
                          >
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-emerald-300" />
                            <span>
                              <span className="block text-sm font-semibold text-white">Now</span>
                              <span className="mt-0.5 block text-xs text-white/55">Publish immediately after confirmation.</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={handleSelectQueue}
                            className={`flex w-full items-start gap-3 border-t border-white/10 px-4 py-3 text-left transition-colors ${queuePreview ? "bg-white/[0.08]" : "hover:bg-white/[0.06]"}`}
                          >
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-purple-300" />
                            <span>
                              <span className="block text-sm font-semibold text-white">Add to Queue</span>
                              <span className="mt-0.5 block text-xs text-white/55">Schedule after your last queued post.</span>
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {scheduleType === "now" && !queuePreview && (
                    <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.06] p-4">
                      <p className="text-sm text-emerald-100">This post will publish immediately when you click the main action.</p>
                    </div>
                  )}

                  {queuePreview && (
                    <div className="rounded-2xl border border-purple-300/20 bg-purple-400/[0.06] p-4">
                      <p className="text-sm text-purple-100">Will be queued for: <span className="font-semibold">{queuePreview}</span></p>
                    </div>
                  )}

                  {scheduleType === "scheduled" && (
                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={() => setShowSchedulePicker((v) => !v)}
                        className="group w-full rounded-2xl border border-white/12 bg-gradient-to-r from-[#121722] to-[#0d111a] px-4 py-3 text-left transition-all hover:border-blue-300/35"
                      >
                        <span className="block text-[11px] uppercase tracking-[0.2em] text-white/45">Scheduled For</span>
                        <span className="mt-1 block text-xl font-semibold text-white">{scheduleSummary}</span>
                        <span className="mt-1 inline-flex items-center gap-2 text-xs text-white/55">
                          <span>{timezoneLabel}</span>
                          <span className="h-1 w-1 rounded-full bg-white/35" />
                          <span>{showSchedulePicker ? "Hide calendar" : "Click to change"}</span>
                        </span>
                      </button>

                      {showSchedulePicker && (
                        <div className="rounded-2xl border border-white/12 bg-[#0d1118]/95 p-4 shadow-[0_28px_60px_rgba(2,6,23,0.7)]">
                          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.9fr]">
                            <div>
                              <div className="mb-3 flex items-center justify-between">
                                <p className="text-sm font-semibold text-white">{formatMonthLabel(calendarCursor)}</p>
                                <div className="inline-flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                                    aria-label="Previous month"
                                  >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                                    aria-label="Next month"
                                  >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              <div className="mb-2 grid grid-cols-7 gap-1">
                                {["S", "M", "T", "W", "T", "F", "S"].map((label, idx) => (
                                  <span key={`${label}-${idx}`} className="py-1 text-center text-[11px] font-medium text-white/40">
                                    {label}
                                  </span>
                                ))}
                              </div>

                              <div className="grid grid-cols-7 gap-1">
                                {calendarDays.map(({ key, date, inCurrentMonth }) => {
                                  const dateKey = toDatePart(date);
                                  const isSelected = dateKey === scheduledDatePart;
                                  const isToday = dateKey === toDatePart(new Date());
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={() => setScheduledForLocal(combineLocalDateTime(dateKey, scheduledTimePart))}
                                      className={`rounded-lg py-2 text-center text-sm transition-all ${
                                        isSelected
                                          ? "bg-blue-500 font-semibold text-white shadow-[0_10px_25px_rgba(59,130,246,0.45)]"
                                          : inCurrentMonth
                                            ? "text-white/85 hover:bg-white/10"
                                            : "text-white/35 hover:bg-white/5"
                                      } ${!isSelected && isToday ? "ring-1 ring-white/30" : ""}`}
                                    >
                                      {date.getDate()}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                              <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/45">Select Time</p>
                              <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-300/35 bg-blue-400/[0.14] px-3 py-2 text-blue-100">
                                <svg className="h-4 w-4 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-semibold text-blue-50">{formatTimeOptionLabel(scheduledTimePart)}</span>
                              </div>
                              <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-1.5">
                                {timeOptions.map((option) => {
                                  const isSelected = option.value === scheduledTimePart;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => setScheduledForLocal(combineLocalDateTime(scheduledDatePart, option.value))}
                                      className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                                        isSelected
                                          ? "bg-blue-500 text-white"
                                          : "text-white/75 hover:bg-white/10 hover:text-white"
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="mt-3 text-xs text-white/45">{timezoneLabel}</p>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                            <button
                              type="button"
                              onClick={() => setShowScheduleActions(true)}
                              className="inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                              </svg>
                              More posting actions
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowSchedulePicker(false)}
                              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/85 transition-colors hover:bg-white/10"
                            >
                              Done
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* YouTube Settings */}
            {selectedPlatforms.includes("youtube") && (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] p-4">
                  <div className="text-red-500">{PLATFORMS.find(p => p.key === "youtube")?.icon}</div>
                  <span className="font-medium">YouTube Settings</span>
                  {(platformAccountsList.youtube?.length ?? 0) > 1 ? (
                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-xs text-white/40">Posting to:</span>
                      <span className="text-xs text-white/70">
                        {(selectedAccountIds.youtube || []).map((id) => platformAccountsList.youtube?.find((a) => a.id === id)?.profileName || "Account").join(", ") || <span className="text-amber-400/70">none selected</span>}
                      </span>
                    </div>
                  ) : platformAccounts.youtube?.profileName ? (
                    <div className="flex items-center gap-1.5 ml-2">
                      {platformAccounts.youtube.avatarUrl && (
                        <img src={proxiedAvatar(platformAccounts.youtube.avatarUrl) ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />
                      )}
                      <span className="text-xs text-white/50">Posting as <span className="text-white/80 font-medium">{platformAccounts.youtube.profileName}</span></span>
                    </div>
                  ) : null}
                  <button onClick={() => setYtIsShort(!ytIsShort)} className={`ml-auto flex items-center gap-2 rounded-full px-3 py-1 text-xs transition-all ${ytIsShort ? "bg-blue-400 text-black" : "border border-white/10 bg-white/5 text-white/70"}`}>
                    <span className={`w-2 h-2 rounded-full ${ytIsShort ? "bg-black" : "bg-white/40"}`} />Short
                  </button>
                </div>

                {/* Presets */}
                {ytPresets.length > 0 && (
                  <div className="border-b border-white/10 bg-white/[0.01] p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white/40">Load preset:</span>
                      {ytPresets.map((preset) => (
                        <div key={preset.name} className="flex items-center gap-1">
                          <button onClick={() => loadYtPreset(preset)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 transition-colors hover:bg-white/10">
                            {preset.name}
                          </button>
                          <button onClick={() => deleteYtPreset(preset.name)} className="rounded-full p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white">
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
                      <select value={ytCategory} onChange={(e) => setYtCategory(e.target.value as YouTubeCategory)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-300/40">
                        {YOUTUBE_CATEGORIES.map((cat) => (<option key={cat.value} value={cat.value} className="bg-neutral-900">{cat.label}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-white/40 mb-1.5">Visibility</label>
                      <select value={ytVisibility} onChange={(e) => setYtVisibility(e.target.value as Privacy)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-300/40">
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
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={ytPublicStats} onChange={(e) => setYtPublicStats(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 accent-white" />
                      <span className="text-sm text-white/70">Show Like Count</span>
                    </label>
                  </div>

                  {/* Per-platform caption override */}
                  <div className="pt-4 border-t border-white/10">
                    <button type="button" onClick={() => setOpenCaptionOverride(openCaptionOverride === "youtube" ? null : "youtube")} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                      <svg className={`w-3 h-3 transition-transform ${openCaptionOverride === "youtube" ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      Customize caption for YouTube
                    </button>
                    {openCaptionOverride === "youtube" && (
                      <div className="mt-3 space-y-2">
                        <input type="text" value={platformTitleOverrides.youtube || ""} onChange={(e) => setPlatformTitleOverrides((p) => ({ ...p, youtube: e.target.value }))} placeholder="Title (optional — uses global title)" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                        <textarea value={platformDescOverrides.youtube || ""} onChange={(e) => setPlatformDescOverrides((p) => ({ ...p, youtube: e.target.value }))} placeholder="Description (optional — uses global description)" rows={2} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                      </div>
                    )}
                  </div>

                  {/* Save Preset */}
                  <div className="pt-4 border-t border-white/10">
                    {showSavePreset ? (
                      <div className="flex items-center gap-2">
                        <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Preset name..." className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" autoFocus />
                        <button onClick={saveYtPreset} disabled={!newPresetName.trim()} className="rounded-lg bg-blue-400 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-blue-300 disabled:opacity-50">Save</button>
                        <button onClick={() => { setShowSavePreset(false); setNewPresetName(""); }} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowSavePreset(true)} className="flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white">
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
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] p-4">
                  <div className="text-white">{PLATFORMS.find(p => p.key === "tiktok")?.icon}</div>
                  <span className="font-medium">TikTok Settings</span>
                  {ttCreatorLoading && <span className="ml-auto text-xs text-white/40">Loading creator info...</span>}
                  {(platformAccountsList.tiktok?.length ?? 0) > 1 ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-xs text-white/40">Posting to:</span>
                      <span className="text-xs text-white/70">
                        {(selectedAccountIds.tiktok || []).map((id) => platformAccountsList.tiktok?.find((a) => a.id === id)?.profileName || "Account").join(", ") || <span className="text-amber-400/70">none selected</span>}
                      </span>
                    </div>
                  ) : (ttCreatorInfo?.nickname || platformAccounts.tiktok?.profileName) ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      {platformAccounts.tiktok?.avatarUrl && (
                        <img src={proxiedAvatar(platformAccounts.tiktok.avatarUrl) ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />
                      )}
                      <span className="text-xs text-white/50">Posting as <span className="text-white/80 font-medium">{ttCreatorInfo?.nickname || platformAccounts.tiktok?.profileName}</span></span>
                    </div>
                  ) : null}
                </div>

                {ttCreatorError && (
                  <div className="mx-5 mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {ttCreatorError}
                  </div>
                )}

                <div className="p-5 space-y-5">
                  {/* ── Point 1: Who can watch this video ── */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                    <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Who can watch this video</p>
                    <select
                      value={ttPrivacyLevel}
                      onChange={(e) => setTtPrivacyLevel(e.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-white outline-none focus:border-blue-300/40 ${!ttPrivacyLevel ? "border-amber-500/30 bg-amber-500/5" : "border-white/10 bg-white/5"}`}
                    >
                      <option value="" className="bg-neutral-900">Select who can watch...</option>
                      {ttCreatorInfo ? (
                        ttCreatorInfo.privacy_level_options.map((opt) => (
                          <option
                            key={opt}
                            value={opt}
                            disabled={ttBrandContent && opt === "SELF_ONLY"}
                            title={ttBrandContent && opt === "SELF_ONLY" ? "Branded content visibility cannot be set to private" : undefined}
                            className="bg-neutral-900 disabled:text-white/30"
                          >
                            {opt === "SELF_ONLY"
                              ? `Private${ttBrandContent ? " — unavailable for branded content" : ""}`
                              : opt === "MUTUAL_FOLLOW_FRIENDS" ? "Friends"
                              : opt === "FOLLOWER_OF_CREATOR" ? "Followers"
                              : opt === "PUBLIC_TO_EVERYONE" ? "Everyone"
                              : opt}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="PUBLIC_TO_EVERYONE" className="bg-neutral-900">Everyone</option>
                          <option value="MUTUAL_FOLLOW_FRIENDS" className="bg-neutral-900">Friends</option>
                          <option value="FOLLOWER_OF_CREATOR" className="bg-neutral-900">Followers</option>
                          <option value="SELF_ONLY" disabled={ttBrandContent} className="bg-neutral-900">
                            {`Private${ttBrandContent ? " — unavailable for branded content" : ""}`}
                          </option>
                        </>
                      )}
                    </select>
                    {!ttPrivacyLevel && <p className="text-xs text-amber-400/70">Required: select who can watch this video</p>}
                    {ttBrandContent && <p className="text-xs text-amber-400/70">Branded content cannot be set to &quot;Private&quot;</p>}
                  </div>

                  {/* ── Points 2–4: Interaction settings ── */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                    <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Interaction settings</p>

                    {/* Point 2: Allow Comments */}
                    <div className={`flex items-center justify-between ${ttCreatorInfo?.comment_disabled ? "opacity-40" : ""}`}>
                      <div>
                        <p className="text-sm text-white/80">Allow comments</p>
                        {ttCreatorInfo?.comment_disabled && <p className="text-xs text-white/30">Disabled on your TikTok account</p>}
                      </div>
                      <button
                        type="button"
                        disabled={!!ttCreatorInfo?.comment_disabled}
                        onClick={() => setTtAllowComments((v) => !v)}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${ttAllowComments ? "bg-blue-500" : "bg-white/10"} disabled:cursor-not-allowed`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${ttAllowComments ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>

                    {/* Point 3: Allow Duet */}
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-white/80">Allow Duet</p>
                        <button
                          type="button"
                          onClick={() => setTtAllowDuet((v) => !v)}
                          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${ttAllowDuet ? "bg-blue-500" : "bg-white/10"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${ttAllowDuet ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                      </div>
                      {ttAllowDuet && ttPrivacyLevel === "SELF_ONLY" && (
                        <p className="text-xs text-amber-400/70 mt-1">Duet is not available for private posts — this setting will apply when posting publicly.</p>
                      )}
                    </div>

                    {/* Point 4: Allow Stitch */}
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-white/80">Allow Stitch</p>
                        <button
                          type="button"
                          onClick={() => setTtAllowStitch((v) => !v)}
                          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${ttAllowStitch ? "bg-blue-500" : "bg-white/10"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${ttAllowStitch ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                      </div>
                      {ttAllowStitch && ttPrivacyLevel === "SELF_ONLY" && (
                        <p className="text-xs text-amber-400/70 mt-1">Stitch is not available for private posts — this setting will apply when posting publicly.</p>
                      )}
                    </div>
                  </div>

                  {/* ── Point 5: Content disclosure ── */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                    <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Content disclosure</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white/80">Disclose video content</p>
                        <p className="text-xs text-white/40 mt-0.5">Turn on if this video promotes a brand, product, or service</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !ttCommercialToggle;
                          setTtCommercialToggle(next);
                          if (!next) { setTtBrandOrganic(false); setTtBrandContent(false); }
                        }}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${ttCommercialToggle ? "bg-blue-500" : "bg-white/10"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${ttCommercialToggle ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>

                    {ttCommercialToggle && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ttBrandOrganic}
                            onChange={(e) => setTtBrandOrganic(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 accent-blue-400 shrink-0"
                          />
                          <div>
                            <p className="text-sm text-white/80">Your Brand</p>
                            <p className="text-xs text-white/40">You are promoting yourself or your own business</p>
                            <p className="text-xs text-blue-400/70 mt-0.5">Your post will be labeled &quot;Promotional content&quot;</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ttBrandContent}
                            onChange={(e) => setTtBrandContent(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 accent-blue-400 shrink-0"
                          />
                          <div>
                            <p className="text-sm text-white/80">Branded Content</p>
                            <p className="text-xs text-white/40">You are promoting another brand or a third party (paid partnership)</p>
                            <p className="text-xs text-blue-400/70 mt-0.5">Your post will be labeled &quot;Paid partnership&quot;</p>
                          </div>
                        </label>
                        {!ttBrandOrganic && !ttBrandContent && (
                          <p className="text-xs text-amber-400/70">Select at least one option above to continue</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* AI-generated content disclosure */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                    <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">AI-generated content</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white/80">Label as AI-generated</p>
                        <p className="text-xs text-white/40 mt-0.5">This video was created or significantly assisted by AI</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTtAigcDisclosure((v) => !v)}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${ttAigcDisclosure ? "bg-blue-500" : "bg-white/10"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${ttAigcDisclosure ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>
                    {ttAigcDisclosure && (
                      <p className="text-xs text-blue-400/70">TikTok will label this post as AI-generated content.</p>
                    )}
                  </div>

                  {/* can_post warning */}
                  {ttCreatorInfo && !ttCreatorInfo.can_post && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                      <p className="text-sm text-amber-300">Your TikTok account is not currently eligible to post. Please try again later.</p>
                    </div>
                  )}

                  {/* Duration warning */}
                  {ttCreatorInfo && ttCreatorInfo.max_video_post_duration_sec > 0 && videoDuration !== null && videoDuration > ttCreatorInfo.max_video_post_duration_sec && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                      <p className="text-sm text-red-300">Video is {Math.round(videoDuration)}s — exceeds your TikTok account&apos;s maximum of {ttCreatorInfo.max_video_post_duration_sec}s.</p>
                    </div>
                  )}

                  {/* Consent checkboxes — required before scheduling */}
                  <div className="space-y-3">
                    {/* Checkbox 1: TikTok's required Music Usage Confirmation (exact wording) */}
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ttConsentChecked}
                        onChange={(e) => setTtConsentChecked(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 accent-white shrink-0"
                      />
                      <span className="text-sm text-white/75">
                        By posting, I agree to TikTok&apos;s{" "}
                        <a href="https://www.tiktok.com/legal/music-usage-confirmation" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline underline-offset-2 hover:text-blue-300">Music Usage Confirmation</a>
                        {ttBrandContent && (
                          <>{" "}and{" "}
                            <a href="https://www.tiktok.com/legal/branded-content-policy" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline underline-offset-2 hover:text-blue-300">Branded Content Policy</a>
                          </>
                        )}.
                      </span>
                    </label>

                    {/* Checkbox 2: Content rights confirmation */}
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ttContentRightsChecked}
                        onChange={(e) => setTtContentRightsChecked(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 accent-white shrink-0"
                      />
                      <span className="text-sm text-white/75">
                        I confirm I am the creator or authorized rights holder of this content and consent to it being published on TikTok on my behalf.
                      </span>
                    </label>
                  </div>

                  {/* Processing notice */}
                  <p className="text-xs text-white/30 pt-1">
                    Content may take a few minutes to appear on your TikTok profile after publishing.
                  </p>

                  {/* Per-platform caption override */}
                  <div className="pt-4 border-t border-white/10">
                    <button type="button" onClick={() => setOpenCaptionOverride(openCaptionOverride === "tiktok" ? null : "tiktok")} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                      <svg className={`w-3 h-3 transition-transform ${openCaptionOverride === "tiktok" ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      Customize caption for TikTok
                    </button>
                    {openCaptionOverride === "tiktok" && (
                      <div className="mt-3 space-y-2">
                        <input type="text" value={platformTitleOverrides.tiktok || ""} onChange={(e) => setPlatformTitleOverrides((p) => ({ ...p, tiktok: e.target.value }))} placeholder="Title (optional — uses global title)" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                        <textarea value={platformDescOverrides.tiktok || ""} onChange={(e) => setPlatformDescOverrides((p) => ({ ...p, tiktok: e.target.value }))} placeholder="Description (optional — uses global description)" rows={2} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Instagram Settings */}
            {selectedPlatforms.includes("instagram") && (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] p-4">
                  <div className="text-pink-500">{PLATFORMS.find(p => p.key === "instagram")?.icon}</div>
                  <span className="font-medium">Instagram Settings</span>
                  {(platformAccountsList.instagram?.length ?? 0) > 1 ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-xs text-white/40">Posting to:</span>
                      <span className="text-xs text-white/70">{(selectedAccountIds.instagram || []).map((id) => platformAccountsList.instagram?.find((a) => a.id === id)?.profileName || "Account").join(", ") || <span className="text-amber-400/70">none selected</span>}</span>
                    </div>
                  ) : platformAccounts.instagram?.profileName ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      {platformAccounts.instagram.avatarUrl && (
                        <img src={proxiedAvatar(platformAccounts.instagram.avatarUrl) ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />
                      )}
                      <span className="text-xs text-white/50">Posting as <span className="text-white/80 font-medium">{platformAccounts.instagram.profileName}</span></span>
                    </div>
                  ) : null}
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">Post Type</label>
                    <div className="flex gap-2">
                      {(["post", "reel", "story"] as InstagramType[]).map((type) => (
                        <button key={type} onClick={() => setIgType(type)} className={`flex-1 rounded-lg py-2 text-sm capitalize ${igType === type ? "border border-blue-300/40 bg-blue-400 text-black" : "border border-white/10 bg-white/5 text-white/70"}`}>{type}</button>
                      ))}
                    </div>
                    <p className="text-xs text-white/30 mt-1.5">
                      {igType === "story" ? "Video will be posted as a Story (24hr, no caption)" : "Video will be published as a Reel"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">First Comment</label>
                    <input type="text" value={igFirstComment} onChange={(e) => setIgFirstComment(e.target.value)} placeholder="Add hashtags or a comment..." className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                  </div>

                  {/* Per-platform caption override */}
                  <div className="pt-4 border-t border-white/10">
                    <button type="button" onClick={() => setOpenCaptionOverride(openCaptionOverride === "instagram" ? null : "instagram")} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                      <svg className={`w-3 h-3 transition-transform ${openCaptionOverride === "instagram" ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      Customize caption for Instagram
                    </button>
                    {openCaptionOverride === "instagram" && (
                      <div className="mt-3 space-y-2">
                        <input type="text" value={platformTitleOverrides.instagram || ""} onChange={(e) => setPlatformTitleOverrides((p) => ({ ...p, instagram: e.target.value }))} placeholder="Title (optional — uses global title)" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                        <textarea value={platformDescOverrides.instagram || ""} onChange={(e) => setPlatformDescOverrides((p) => ({ ...p, instagram: e.target.value }))} placeholder="Description (optional — uses global description)" rows={2} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Facebook caption override */}
            {selectedPlatforms.includes("facebook") && (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] p-4">
                  <div className="text-blue-500">{PLATFORMS.find(p => p.key === "facebook")?.icon}</div>
                  <span className="font-medium">Facebook Settings</span>
                  {(platformAccountsList.facebook?.length ?? 0) > 1 ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-xs text-white/40">Posting to:</span>
                      <span className="text-xs text-white/70">{(selectedAccountIds.facebook || []).map((id) => platformAccountsList.facebook?.find((a) => a.id === id)?.profileName || "Page").join(", ") || <span className="text-amber-400/70">none selected</span>}</span>
                    </div>
                  ) : platformAccounts.facebook?.profileName ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      {platformAccounts.facebook.avatarUrl && <img src={proxiedAvatar(platformAccounts.facebook.avatarUrl) ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />}
                      <span className="text-xs text-white/50">Posting as <span className="text-white/80 font-medium">{platformAccounts.facebook.profileName}</span></span>
                    </div>
                  ) : null}
                </div>
                <div className="p-5">
                  <button type="button" onClick={() => setOpenCaptionOverride(openCaptionOverride === "facebook" ? null : "facebook")} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                    <svg className={`w-3 h-3 transition-transform ${openCaptionOverride === "facebook" ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    Customize caption for Facebook
                  </button>
                  {openCaptionOverride === "facebook" && (
                    <div className="mt-3 space-y-2">
                      <input type="text" value={platformTitleOverrides.facebook || ""} onChange={(e) => setPlatformTitleOverrides((p) => ({ ...p, facebook: e.target.value }))} placeholder="Title (optional)" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                      <textarea value={platformDescOverrides.facebook || ""} onChange={(e) => setPlatformDescOverrides((p) => ({ ...p, facebook: e.target.value }))} placeholder="Description (optional)" rows={2} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LinkedIn caption override */}
            {selectedPlatforms.includes("linkedin") && (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] p-4">
                  <div className="text-blue-400">{PLATFORMS.find(p => p.key === "linkedin")?.icon}</div>
                  <span className="font-medium">LinkedIn Settings</span>
                  {(platformAccountsList.linkedin?.length ?? 0) > 1 ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-xs text-white/40">Posting to:</span>
                      <span className="text-xs text-white/70">{(selectedAccountIds.linkedin || []).map((id) => platformAccountsList.linkedin?.find((a) => a.id === id)?.profileName || "Profile").join(", ") || <span className="text-amber-400/70">none selected</span>}</span>
                    </div>
                  ) : platformAccounts.linkedin?.profileName ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      {platformAccounts.linkedin.avatarUrl && <img src={proxiedAvatar(platformAccounts.linkedin.avatarUrl) ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />}
                      <span className="text-xs text-white/50">Posting as <span className="text-white/80 font-medium">{platformAccounts.linkedin.profileName}</span></span>
                    </div>
                  ) : null}
                </div>
                <div className="p-5">
                  <div className="mb-4">
                    <label className="block text-xs text-white/40 mb-1.5">Audience visibility</label>
                    <select value={linkedinVisibility} onChange={(e) => setLinkedinVisibility(e.target.value as "PUBLIC" | "CONNECTIONS")} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-300/40">
                      <option value="PUBLIC">Anyone on LinkedIn</option>
                      <option value="CONNECTIONS">Connections only</option>
                    </select>
                  </div>
                  <button type="button" onClick={() => setOpenCaptionOverride(openCaptionOverride === "linkedin" ? null : "linkedin")} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                    <svg className={`w-3 h-3 transition-transform ${openCaptionOverride === "linkedin" ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    Customize caption for LinkedIn
                  </button>
                  {openCaptionOverride === "linkedin" && (
                    <div className="mt-3 space-y-2">
                      <input type="text" value={platformTitleOverrides.linkedin || ""} onChange={(e) => setPlatformTitleOverrides((p) => ({ ...p, linkedin: e.target.value }))} placeholder="Title (optional)" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                      <textarea value={platformDescOverrides.linkedin || ""} onChange={(e) => setPlatformDescOverrides((p) => ({ ...p, linkedin: e.target.value }))} placeholder="Description (optional)" rows={2} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Threads Settings */}
            {selectedPlatforms.includes("threads") && (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] p-4">
                  <div className="text-white/80">{PLATFORMS.find(p => p.key === "threads")?.icon}</div>
                  <span className="font-medium">Threads Settings</span>
                  {(platformAccountsList.threads?.length ?? 0) > 1 ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-xs text-white/40">Posting to:</span>
                      <span className="text-xs text-white/70">{(selectedAccountIds.threads || []).map((id) => platformAccountsList.threads?.find((a) => a.id === id)?.profileName || "Account").join(", ") || <span className="text-amber-400/70">none selected</span>}</span>
                    </div>
                  ) : platformAccounts.threads?.profileName ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      {platformAccounts.threads.avatarUrl && <img src={proxiedAvatar(platformAccounts.threads.avatarUrl) ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />}
                      <span className="text-xs text-white/50">Posting as <span className="text-white/80 font-medium">{platformAccounts.threads.profileName}</span></span>
                    </div>
                  ) : null}
                </div>
                <div className="p-5">
                  <p className="text-xs text-white/40 mb-3">Video will be posted as a Threads video post. Async publishing — takes 1–5 minutes.</p>
                  <button type="button" onClick={() => setOpenCaptionOverride(openCaptionOverride === "threads" ? null : "threads")} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                    <svg className={`w-3 h-3 transition-transform ${openCaptionOverride === "threads" ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    Customize caption for Threads
                  </button>
                  {openCaptionOverride === "threads" && (
                    <div className="mt-3 space-y-2">
                      <input type="text" value={platformTitleOverrides.threads || ""} onChange={(e) => setPlatformTitleOverrides((p) => ({ ...p, threads: e.target.value }))} placeholder="Title (optional)" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                      <textarea value={platformDescOverrides.threads || ""} onChange={(e) => setPlatformDescOverrides((p) => ({ ...p, threads: e.target.value }))} placeholder="Description (optional)" rows={2} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bluesky Settings */}
            {selectedPlatforms.includes("bluesky") && (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] p-4">
                  <div className="text-sky-400">{PLATFORMS.find(p => p.key === "bluesky")?.icon}</div>
                  <span className="font-medium">Bluesky Settings</span>
                  {(platformAccountsList.bluesky?.length ?? 0) > 1 ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-xs text-white/40">Posting to:</span>
                      <span className="text-xs text-white/70">{(selectedAccountIds.bluesky || []).map((id) => platformAccountsList.bluesky?.find((a) => a.id === id)?.profileName || "Account").join(", ") || <span className="text-amber-400/70">none selected</span>}</span>
                    </div>
                  ) : platformAccounts.bluesky?.profileName ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      {platformAccounts.bluesky.avatarUrl && <img src={proxiedAvatar(platformAccounts.bluesky.avatarUrl) ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />}
                      <span className="text-xs text-white/50">Posting as <span className="text-white/80 font-medium">{platformAccounts.bluesky.profileName}</span></span>
                    </div>
                  ) : null}
                </div>
                <div className="p-5">
                  <p className="text-xs text-white/40 mb-3">Video will be posted as a Bluesky video post. Caption is limited to 300 characters.</p>
                  <button type="button" onClick={() => setOpenCaptionOverride(openCaptionOverride === "bluesky" ? null : "bluesky")} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                    <svg className={`w-3 h-3 transition-transform ${openCaptionOverride === "bluesky" ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    Customize caption for Bluesky
                  </button>
                  {openCaptionOverride === "bluesky" && (
                    <div className="mt-3 space-y-2">
                      <textarea value={platformDescOverrides.bluesky || ""} onChange={(e) => setPlatformDescOverrides((p) => ({ ...p, bluesky: e.target.value }))} placeholder="Caption (optional, max 300 chars)" rows={3} maxLength={300} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                      <p className="text-xs text-white/30 text-right">{(platformDescOverrides.bluesky || "").length}/300</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* X Settings */}
            {selectedPlatforms.includes("x") && (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] p-4">
                  <div className="text-white/80">{PLATFORMS.find(p => p.key === "x")?.icon}</div>
                  <span className="font-medium">X Settings</span>
                  {(platformAccountsList.x?.length ?? 0) > 1 ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-xs text-white/40">Posting to:</span>
                      <span className="text-xs text-white/70">{(selectedAccountIds.x || []).map((id) => platformAccountsList.x?.find((a) => a.id === id)?.profileName || "Account").join(", ") || <span className="text-amber-400/70">none selected</span>}</span>
                    </div>
                  ) : platformAccounts.x?.profileName ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      {platformAccounts.x.avatarUrl && <img src={proxiedAvatar(platformAccounts.x.avatarUrl) ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />}
                      <span className="text-xs text-white/50">Posting as <span className="text-white/80 font-medium">{platformAccounts.x.profileName}</span></span>
                    </div>
                  ) : null}
                </div>
                <div className="p-5">
                  <p className="text-xs text-white/40 mb-3">Video will be posted as an X tweet. Tweet text is limited to 280 characters.</p>
                  <div className="mb-4">
                    <label className="block text-xs text-white/40 mb-1.5">Who can reply</label>
                    <select value={xReplySettings} onChange={(e) => setXReplySettings(e.target.value as "everyone" | "mentionedUsers" | "subscribers")} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-300/40">
                      <option value="everyone">Everyone</option>
                      <option value="mentionedUsers">Mentioned users only</option>
                      <option value="subscribers">Subscribers only</option>
                    </select>
                  </div>
                  <button type="button" onClick={() => setOpenCaptionOverride(openCaptionOverride === "x" ? null : "x")} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                    <svg className={`w-3 h-3 transition-transform ${openCaptionOverride === "x" ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    Customize tweet text for X
                  </button>
                  {openCaptionOverride === "x" && (
                    <div className="mt-3 space-y-2">
                      <textarea value={platformDescOverrides.x || ""} onChange={(e) => setPlatformDescOverrides((p) => ({ ...p, x: e.target.value }))} placeholder="Tweet text (optional, max 280 chars)" rows={3} maxLength={280} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40" />
                      <p className="text-xs text-white/30 text-right">{(platformDescOverrides.x || "").length}/280</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="sticky bottom-4 z-20 flex items-center justify-between rounded-2xl border border-white/10 bg-neutral-950/85 p-3 backdrop-blur-xl">
              <button onClick={() => handleSchedule(true)} disabled={scheduling} className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm text-white/70 transition-colors hover:bg-white/10 disabled:opacity-50">Save as draft</button>
              <button onClick={() => handleSchedule(false)} disabled={scheduling || selectedPlatforms.length === 0 || !!ttValidationError} className="rounded-full bg-gradient-to-r from-blue-400 to-purple-400 px-8 py-3 text-sm font-semibold text-black transition-colors hover:from-blue-300 hover:to-purple-300 disabled:opacity-50">
                {scheduling ? "Scheduling..." : scheduleType === "now" ? "Publish now" : "Schedule"}
              </button>
            </div>
          </div>

          {/* Right column — live post preview panel */}
          <div className="hidden xl:block sticky top-6 self-start">
            <PostPreviewPanel
              selectedPlatforms={selectedPlatforms}
              title={title}
              description={description}
              hashtags={hashtags}
              videoPreviewUrl={videoPreviewUrl}
              thumbnailPreview={thumbnailPreview}
              platformAccounts={platformAccounts}
              ttNickname={ttCreatorInfo?.nickname || null}
            />
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

