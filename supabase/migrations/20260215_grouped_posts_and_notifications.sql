-- Grouped posts
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS group_id UUID;
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_group_id ON scheduled_posts(group_id);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  team_id UUID NOT NULL,
  notify_post_success BOOLEAN NOT NULL DEFAULT true,
  notify_post_failed BOOLEAN NOT NULL DEFAULT true,
  notify_reconnect BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);
