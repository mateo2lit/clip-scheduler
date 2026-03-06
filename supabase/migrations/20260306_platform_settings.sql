ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS facebook_settings JSONB;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS linkedin_settings JSONB;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS bluesky_settings JSONB;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS threads_settings JSONB;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS x_settings JSONB;
