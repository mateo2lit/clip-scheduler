-- Throttle for admin alerts. /api/health/stuck-posts runs every 10 minutes and only emails
-- when it can move last_sent_at forward past the alert window, so a long outage sends one
-- email per window instead of one per run. RLS on with no policies: service role only.
CREATE TABLE IF NOT EXISTS system_alerts (
  key TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT 'epoch'
);

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

INSERT INTO system_alerts (key) VALUES ('stuck_posts') ON CONFLICT (key) DO NOTHING;
