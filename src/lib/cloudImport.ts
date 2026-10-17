/**
 * Google Drive and Dropbox import. The browser picks a file with the provider's own picker and
 * sends us a short-lived credential: a Drive access token (drive.file scope, so it only opens
 * the files the user picked) or a Dropbox direct link (expires after 4 hours). We check the file
 * with the provider, then the import-cloud workflow copies it into Supabase Storage as-is.
 *
 * The credential is stored in import_job_secrets and never passed as a workflow input: the repo
 * is public, so anything in the inputs or the logs is readable by any GitHub user.
 */

export type CloudSource = "gdrive" | "dropbox";

/** Same cap as the URL import workflow. */
export const CLOUD_IMPORT_MAX_BYTES = 2 * 1024 * 1024 * 1024;

const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "webm", "avi", "mkv"];

export type CloudImportRequest =
  | { source: "gdrive"; fileId: string; accessToken: string }
  | { source: "dropbox"; link: string; name: string; bytes: number };

export type VerifiedCloudFile = { name: string; size: number; fileId: string | null };

type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

const fail = (error: string, status = 400) => ({ ok: false as const, error, status });

export function parseCloudImportRequest(body: any): Result<CloudImportRequest> {
  const source = body?.source;
  if (source === "gdrive") {
    const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return fail("Pick a Google Drive file.");
    if (!accessToken) return fail("Google Drive sign-in is missing. Pick the file again.");
    return { ok: true, value: { source, fileId, accessToken } };
  }
  if (source === "dropbox") {
    const link = typeof body.link === "string" ? body.link.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const bytes = typeof body.bytes === "number" ? body.bytes : 0;
    if (!isDropboxDirectLink(link)) return fail("That isn't a Dropbox file link. Pick the file again.");
    return { ok: true, value: { source, link, name, bytes } };
  }
  return fail("Unknown import source.");
}

/**
 * Chooser direct links are served from dropboxusercontent.com. Anything else is refused so the
 * import worker can't be pointed at an arbitrary URL.
 */
export function isDropboxDirectLink(link: string): boolean {
  let u: URL;
  try { u = new URL(link); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return host === "dropboxusercontent.com" || host.endsWith(".dropboxusercontent.com");
}

export function isVideoFile(name: string, mimeType?: string | null): boolean {
  if (mimeType && mimeType.toLowerCase().startsWith("video/")) return true;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}

/** "My Clip_final.mp4" -> "My Clip_final" */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim();
  return (base || "Imported video").slice(0, 200);
}

/** Error to show, or null when the file fits. */
export function cloudImportSizeError(size: number, usedBytes: number, limitBytes: number): string | null {
  if (!(size > 0)) return "Couldn't read the file's size. Pick it again.";
  if (size > CLOUD_IMPORT_MAX_BYTES) return "That file is over 2 GB, the import limit.";
  if (usedBytes + size > limitBytes) {
    const limitGB = limitBytes / (1024 * 1024 * 1024);
    return `Storage limit reached (${limitGB} GB). Delete drafts or wait for posted videos to be cleaned up.`;
  }
  return null;
}

type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any>; headers: { get(name: string): string | null } }>;

/**
 * Ask the provider about the file so the size and name we store are real, not whatever the
 * browser said. For Drive this also proves the token can open the file.
 */
export async function verifyCloudFile(req: CloudImportRequest, fetchImpl: FetchLike = fetch as any): Promise<Result<VerifiedCloudFile>> {
  if (req.source === "gdrive") {
    let res;
    try {
      res = await fetchImpl(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(req.fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${req.accessToken}` }, signal: AbortSignal.timeout(10_000) }
      );
    } catch {
      return fail("Couldn't reach Google Drive. Try again.", 502);
    }
    if (res.status === 401) return fail("Google Drive sign-in expired. Pick the file again.");
    if (!res.ok) return fail("Clip Dash can't open that Google Drive file. Pick it again from the Drive picker.");
    const meta = await res.json().catch(() => null);
    const name = String(meta?.name ?? "");
    if (!isVideoFile(name, meta?.mimeType)) return fail("That file isn't a video.");
    return { ok: true, value: { name, size: Number(meta?.size ?? 0), fileId: req.fileId } };
  }

  if (!isVideoFile(req.name)) return fail("That file isn't a video.");
  // The Chooser gives us the size; a HEAD on the link confirms it when Dropbox answers.
  let size = req.bytes;
  try {
    const res = await fetchImpl(req.link, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8_000) });
    if (res.status === 404 || res.status === 410) return fail("The Dropbox link expired. Pick the file again.");
    const len = Number(res.headers.get("content-length") ?? 0);
    if (res.ok && len > 0) size = len;
  } catch {
    // Fall back to the Chooser's size; the workflow enforces the 2 GB cap on the real bytes.
  }
  return { ok: true, value: { name: req.name, size, fileId: null } };
}

/** The credential the workflow needs to download the file. */
export function secretFor(req: CloudImportRequest): string {
  return req.source === "gdrive" ? req.accessToken : req.link;
}

/**
 * Workflow inputs carry the job id and nothing else. The workflow reads everything else,
 * including the credential, from the database.
 */
export function cloudDispatchInputs(jobId: string): Record<string, string> {
  return { job_id: jobId };
}

export async function dispatchCloudImportWorkflow(jobId: string) {
  const pat = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO || "mateo2lit/clip-scheduler";
  if (!pat) throw new Error("GITHUB_PAT not set.");
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/import-cloud.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: cloudDispatchInputs(jobId) }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub dispatch failed (${res.status}): ${err.slice(0, 200)}`);
  }
}
