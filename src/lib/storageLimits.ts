/**
 * Active storage allowed per plan (sum of `uploads.file_size` where `storage_deleted = false`).
 * The single source for every upload, import and conversion check; the Settings and Support
 * pages advertise these same numbers (25 GB Creator, 50 GB Team).
 */
const GB = 1024 * 1024 * 1024;

export const STORAGE_LIMIT_BYTES = {
  creator: 25 * GB,
  team: 50 * GB,
} as const;

export function storageLimitBytes(plan: string | null | undefined): number {
  return plan === "team" ? STORAGE_LIMIT_BYTES.team : STORAGE_LIMIT_BYTES.creator;
}
