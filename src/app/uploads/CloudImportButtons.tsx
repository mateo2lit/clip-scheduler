"use client";

import { useEffect, useRef, useState } from "react";
import { DropboxLogo, GoogleDriveLogo } from "@phosphor-icons/react/dist/ssr";

/**
 * "Google Drive" / "Dropbox" cards on the upload page, rendered as items of the parent's grid
 * beside "Import from URL". Each opens the provider's own file picker; the picked file is handed
 * to /api/imports/cloud, and the import-cloud workflow copies it into storage. A card only
 * appears when its env vars are set, so this ships dark.
 */

// Referenced literally so Next.js inlines them at build time.
const DROPBOX_APP_KEY = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY || "";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GOOGLE_PICKER_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY || "";
const GOOGLE_PROJECT_NUMBER = process.env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER || "";

const DRIVE_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_PICKER_API_KEY && GOOGLE_PROJECT_NUMBER);
const DROPBOX_ENABLED = !!DROPBOX_APP_KEY;

/** How many cards this renders, so the parent can size its grid. */
export const CLOUD_IMPORT_SOURCE_COUNT = Number(DRIVE_ENABLED) + Number(DROPBOX_ENABLED);

// Only the files the user picks; non-sensitive, so no Google security assessment.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export type CloudImportStarted = {
  jobId: string;
  source: "gdrive" | "dropbox";
  fileName: string;
  title: string;
};

declare global {
  interface Window {
    gapi?: any;
    google?: any;
    Dropbox?: any;
  }
}

function loadScript(src: string, id: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.id = id;
    s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => { s.dataset.loaded = "true"; resolve(); };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

interface Props {
  token: string;
  disabled?: boolean;
  onStarted: (job: CloudImportStarted) => void;
}

export default function CloudImportButtons({ token, disabled, onStarted }: Props) {
  const [dropboxReady, setDropboxReady] = useState(false);
  const [driveReady, setDriveReady] = useState(false);
  const [busy, setBusy] = useState<"gdrive" | "dropbox" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<any>(null);
  const driveTokenRef = useRef<{ value: string; expiresAt: number } | null>(null);

  // Load the picker scripts up front: both pickers open popups, which browsers only allow
  // straight from a click, so there's no time to load a script after the click.
  useEffect(() => {
    if (DROPBOX_ENABLED) {
      loadScript("https://www.dropbox.com/static/api/2/dropins.js", "dropboxjs", { "data-app-key": DROPBOX_APP_KEY })
        .then(() => setDropboxReady(true))
        .catch(() => {});
    }
    if (DRIVE_ENABLED) {
      Promise.all([
        loadScript("https://accounts.google.com/gsi/client", "google-gsi"),
        loadScript("https://apis.google.com/js/api.js", "google-gapi"),
      ])
        .then(() => new Promise<void>((resolve) => window.gapi.load("picker", { callback: resolve })))
        .then(() => setDriveReady(true))
        .catch(() => {});
    }
  }, []);

  if (!DRIVE_ENABLED && !DROPBOX_ENABLED) return null;

  async function startImport(body: Record<string, unknown>, source: "gdrive" | "dropbox", fileName: string) {
    setBusy(source);
    setError(null);
    try {
      const res = await fetch("/api/imports/cloud", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ source, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) {
        setError(json.error || "Couldn't start the import.");
        return;
      }
      onStarted({ jobId: json.jobId, source, fileName, title: json.title || fileName });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function chooseFromDropbox() {
    setError(null);
    if (!window.Dropbox) return;
    window.Dropbox.choose({
      linkType: "direct", // a download link that expires after 4 hours
      multiselect: false,
      folderselect: false,
      extensions: ["video"],
      sizeLimit: MAX_BYTES,
      success: (files: Array<{ link: string; name: string; bytes: number }>) => {
        const f = files?.[0];
        if (f) startImport({ link: f.link, name: f.name, bytes: f.bytes }, "dropbox", f.name);
      },
    });
  }

  function openDrivePicker(accessToken: string) {
    const g = window.google;
    const view = new g.picker.DocsView(g.picker.ViewId.DOCS_VIDEOS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    const picker = new g.picker.PickerBuilder()
      .addView(view)
      .enableFeature(g.picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_PICKER_API_KEY)
      // The app id is what grants drive.file access to the picked file.
      .setAppId(GOOGLE_PROJECT_NUMBER)
      .setTitle("Pick a video")
      .setCallback((data: any) => {
        if (data.action !== g.picker.Action.PICKED) return;
        const doc = data.docs?.[0];
        if (doc) startImport({ fileId: doc.id, accessToken }, "gdrive", doc.name || "Google Drive video");
      })
      .build();
    picker.setVisible(true);
  }

  function chooseFromDrive() {
    setError(null);
    const g = window.google;
    if (!g?.accounts?.oauth2 || !g?.picker) return;

    // Reuse a token that still has 5+ minutes left so a second pick doesn't pop Google again.
    const cached = driveTokenRef.current;
    if (cached && cached.expiresAt - Date.now() > 5 * 60_000) {
      openDrivePicker(cached.value);
      return;
    }

    if (!tokenClientRef.current) {
      tokenClientRef.current = g.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (resp: any) => {
          if (resp?.error || !resp?.access_token) {
            setError("Google Drive sign-in was cancelled.");
            return;
          }
          driveTokenRef.current = {
            value: resp.access_token,
            expiresAt: Date.now() + Number(resp.expires_in || 3600) * 1000,
          };
          openDrivePicker(resp.access_token);
        },
        error_callback: (err: any) => {
          // popup_closed is the user backing out; anything else is worth saying.
          if (err?.type !== "popup_closed") setError("Couldn't open Google sign-in. Allow pop-ups for this site and try again.");
        },
      });
    }
    tokenClientRef.current.requestAccessToken({ prompt: "" });
  }

  // Same card as "Import from URL" so the row reads as one set of choices.
  function card(opts: {
    source: "gdrive" | "dropbox";
    label: string;
    hint: string;
    icon: React.ReactNode;
    ready: boolean;
    onClick: () => void;
  }) {
    return (
      <button
        key={opts.source}
        type="button"
        onClick={opts.onClick}
        disabled={disabled || !opts.ready || busy !== null}
        className="group w-full rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-8 text-center backdrop-blur-xl transition-all hover:border-blue-400/30 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] transition-colors group-hover:border-blue-400/30 group-hover:bg-blue-400/10">
          {opts.icon}
        </div>
        <p className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">{opts.label}</p>
        <p className="mt-1 text-xs text-white/35">{busy === opts.source ? "Starting import…" : opts.hint}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-white/40">Up to 2 GB</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-white/40">MP4, MOV, WebM</span>
        </div>
      </button>
    );
  }

  const iconClass = "w-5 h-5 text-white/50 group-hover:text-blue-300 transition-colors";

  return (
    <>
      {DRIVE_ENABLED && card({
        source: "gdrive",
        label: "Import from Google Drive",
        hint: "Pick a video from your Drive",
        icon: <GoogleDriveLogo className={iconClass} weight="bold" />,
        ready: driveReady,
        onClick: chooseFromDrive,
      })}
      {DROPBOX_ENABLED && card({
        source: "dropbox",
        label: "Import from Dropbox",
        hint: "Pick a video from your Dropbox",
        icon: <DropboxLogo className={iconClass} weight="bold" />,
        ready: dropboxReady,
        onClick: chooseFromDropbox,
      })}
      {error && <p className="col-span-full px-1 text-xs text-red-400">{error}</p>}
    </>
  );
}
