-- Multi-Channel Per Platform Migration
-- Run these statements in order in the Supabase SQL editor.
-- Each step is safe to re-run (idempotent where possible).

-- ── Step 1: Add label column to platform_accounts ────────────────────────────
ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS label text;

-- ── Step 2: Add platform_account_id to scheduled_posts (nullable) ─────────────
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS platform_account_id uuid;

-- ── Step 3: Backfill platform_account_id on existing scheduled posts ───────────
-- Links each post to the matching platform account for its team+provider.
UPDATE scheduled_posts sp
SET platform_account_id = pa.id
FROM platform_accounts pa
WHERE pa.team_id = sp.team_id
  AND pa.provider = sp.provider
  AND sp.platform_account_id IS NULL;

-- Verify backfill: this should return 0. If not, investigate before proceeding.
-- SELECT COUNT(*) FROM scheduled_posts WHERE platform_account_id IS NULL AND status != 'draft';

-- ── Step 4: Add FK (after backfill is verified) ────────────────────────────────
-- ON DELETE SET NULL: disconnecting an account never cascades to delete post history.
ALTER TABLE scheduled_posts
  ADD CONSTRAINT IF NOT EXISTS fk_scheduled_posts_platform_account
  FOREIGN KEY (platform_account_id) REFERENCES platform_accounts(id) ON DELETE SET NULL;

-- ── Step 5: Check for any platform_accounts rows with NULL platform_user_id ────
-- The new unique constraint requires platform_user_id to be non-null.
-- Run this to see if any need fixing before adding the constraint:
-- SELECT id, provider, team_id, platform_user_id FROM platform_accounts WHERE platform_user_id IS NULL;
--
-- If rows exist, have users reconnect those accounts, or set a placeholder:
-- UPDATE platform_accounts SET platform_user_id = id::text WHERE platform_user_id IS NULL;

-- ── Step 6: Add new unique constraint (replaces the old team_id+provider one) ──
-- Do this ONLY after all OAuth callbacks have been deployed with the new onConflict key.
-- Otherwise new connections will fail.

-- First, add the new constraint:
ALTER TABLE platform_accounts
  ADD CONSTRAINT IF NOT EXISTS platform_accounts_team_provider_user_key
  UNIQUE (team_id, provider, platform_user_id);

-- Then drop the old one:
ALTER TABLE platform_accounts
  DROP CONSTRAINT IF EXISTS platform_accounts_team_id_provider_key;

-- ── Done ─────────────────────────────────────────────────────────────────────
-- After this migration:
-- 1. Existing posts continue to work via the platform_account_id FK
-- 2. New posts from updated UI will include platform_account_id directly
-- 3. OAuth callbacks use the new conflict key, enabling multiple accounts per platform
