-- Throttle proactive reconnect emails so the daily refresh worker doesn't spam
-- the same user every 24 hours when a token is unrecoverable.
ALTER TABLE platform_accounts
  ADD COLUMN IF NOT EXISTS last_reconnect_email_at TIMESTAMPTZ;
