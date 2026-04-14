-- Competitor tracking
CREATE TABLE IF NOT EXISTS competitor_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  follower_count BIGINT DEFAULT 0,
  following_count BIGINT DEFAULT 0,
  post_count BIGINT DEFAULT 0,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, platform, handle)
);

CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  follower_count BIGINT NOT NULL DEFAULT 0,
  post_count BIGINT DEFAULT 0,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(competitor_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_competitor_profiles_team ON competitor_profiles(team_id);
CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_id ON competitor_snapshots(competitor_id, snapshot_date DESC);
