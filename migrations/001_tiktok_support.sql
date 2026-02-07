-- Add platform_user_id for storing TikTok open_id
ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS platform_user_id TEXT;

-- Add TikTok settings column
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS tiktok_settings JSONB;
