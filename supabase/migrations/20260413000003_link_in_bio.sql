-- Link-in-bio pages
CREATE TABLE IF NOT EXISTS bio_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT DEFAULT '',
  avatar_url TEXT,
  theme TEXT NOT NULL DEFAULT 'dark',
  accent_color TEXT NOT NULL DEFAULT '#8b5cf6',
  show_recent_posts BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Custom links on bio page
CREATE TABLE IF NOT EXISTS bio_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bio_page_id UUID NOT NULL REFERENCES bio_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Click tracking
CREATE TABLE IF NOT EXISTS bio_link_clicks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bio_link_id UUID NOT NULL REFERENCES bio_links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referrer TEXT,
  country TEXT
);

CREATE INDEX IF NOT EXISTS idx_bio_pages_slug ON bio_pages(slug);
CREATE INDEX IF NOT EXISTS idx_bio_pages_team ON bio_pages(team_id);
CREATE INDEX IF NOT EXISTS idx_bio_links_page ON bio_links(bio_page_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_bio_clicks_link ON bio_link_clicks(bio_link_id, clicked_at DESC);
