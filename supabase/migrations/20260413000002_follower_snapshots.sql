-- Follower growth tracking: stores daily snapshots of follower counts per platform account
CREATE TABLE IF NOT EXISTS follower_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  platform_account_id UUID NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  follower_count BIGINT NOT NULL DEFAULT 0,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform_account_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_follower_snapshots_team ON follower_snapshots(team_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_follower_snapshots_account ON follower_snapshots(platform_account_id, snapshot_date DESC);
