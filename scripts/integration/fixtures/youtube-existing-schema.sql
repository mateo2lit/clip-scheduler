-- Relevant live column/constraint shapes inspected read-only on 2026-10-01.
-- All rows in integration tests are synthetic. No live credentials or users are copied.
create schema auth;
create table auth.users(id uuid primary key);
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.teams (
 id uuid primary key default gen_random_uuid(), name text not null default 'My Team',
 owner_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), stripe_customer_id text, stripe_subscription_id text,
 plan text not null default 'none', plan_status text not null default 'inactive', trial_ends_at timestamptz,
 onboarding_completed_at timestamptz, onboarding_data jsonb, queue_schedule jsonb
);
create table public.team_members (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check (role in ('owner','member','admin')),
 joined_at timestamptz not null default now(), unique(team_id,user_id)
);
create table public.platform_accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null, access_token text, refresh_token text, expiry timestamptz, scope text, token_type text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 platform_user_id text, profile_name text, avatar_url text, page_id text, page_access_token text, ig_user_id text,
 team_id uuid references public.teams(id), label text, last_reconnect_email_at timestamptz, meta_user_id text,
 unique(team_id,provider,platform_user_id)
);
-- Only fields needed to assert scheduled destination preservation; not the entire post schema.
create table public.scheduled_posts (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id),
 platform_account_id uuid references public.platform_accounts(id) on delete set null,
 provider text not null, status text not null default 'scheduled', youtube_settings jsonb
);
