-- supabase/migrations/20260406_overlay_burn.sql
-- Run manually in Supabase SQL editor

CREATE TABLE IF NOT EXISTS brand_assets (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  name        text not null,
  file_path   text not null,
  file_size   bigint not null default 0,
  created_at  timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS overlay_burn_jobs (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  user_id           uuid not null,
  source_upload_id  uuid references uploads(id) on delete cascade,
  status            text not null default 'pending',
  -- pending | transcribing | burning | done | failed
  error             text,
  overlay_config    jsonb not null default '{}',
  result_upload_id  uuid references uploads(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
