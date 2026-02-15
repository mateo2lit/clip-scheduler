-- Platform default settings per user+platform
create table platform_defaults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid,
  platform text not null,  -- youtube | tiktok | instagram | linkedin | facebook
  settings jsonb not null default '{}',
  updated_at timestamptz default now(),
  unique(user_id, platform)
);

alter table platform_defaults enable row level security;

create policy "Users manage own defaults"
  on platform_defaults for all
  using (auth.uid() = user_id);
