-- Migration: Add text post support
-- Allows scheduling text-only posts (no video) to LinkedIn, Facebook, Threads, Bluesky

-- 1. Make upload_id optional so text posts don't need a video file
ALTER TABLE scheduled_posts ALTER COLUMN upload_id DROP NOT NULL;

-- 2. Discriminate post type (default 'video' keeps all existing rows valid)
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'video'
  CHECK (post_type IN ('video', 'text'));

-- 3. Store text post body, hashtags, and link preview data as JSONB
--    Shape: { body, hashtags, link_url, link_title, link_description, link_image, link_domain }
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS text_post_content JSONB;

-- 4. Index to speed up worker queries for text posts
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_post_type
  ON scheduled_posts(post_type)
  WHERE post_type = 'text';

-- 5. Hashtag groups table for the hashtag manager (team-scoped, named sets of tags)
CREATE TABLE IF NOT EXISTS saved_hashtag_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  hashtags   TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_hashtag_groups_team
  ON saved_hashtag_groups(team_id);
