-- Additive, service-only pending connections. Apply separately before enabling flags.
begin;

create table public.youtube_connection_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  browser_hash text not null,
  expected_account_id uuid references public.platform_accounts(id) on delete cascade,
  previous_account_id uuid references public.platform_accounts(id) on delete cascade,
  expected_channel_id text,
  return_path text not null check (return_path in ('/settings', '/onboarding')),
  status text not null default 'started' check (status in ('started','exchanging','awaiting_confirmation','confirmed','cancelled','expired','failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  credential_envelope text,
  identity jsonb,
  account_id uuid references public.platform_accounts(id) on delete cascade
);
create index youtube_attempts_expiry on public.youtube_connection_attempts(expires_at);
create index youtube_attempts_user on public.youtube_connection_attempts(user_id, created_at);
alter table public.youtube_connection_attempts enable row level security;
revoke all on public.youtube_connection_attempts from public, anon, authenticated;
grant all on public.youtube_connection_attempts to service_role;

create table public.youtube_account_identity (
  platform_account_id uuid primary key references public.platform_accounts(id) on delete cascade,
  title text not null,
  custom_url text,
  avatar_url text,
  verified_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null
);
alter table public.youtube_account_identity enable row level security;
revoke all on public.youtube_account_identity from public, anon, authenticated;
grant all on public.youtube_account_identity to service_role;

-- Called ONLY by authenticated server code, after verifying the refresh token identity.
-- All writes commit together. Row/advisory locks serialize confirm/cancel/reconnect races.
create function public.confirm_youtube_connection(
  p_attempt_id uuid, p_user_id uuid, p_team_id uuid,
  p_refresh_token text, p_access_token text, p_expiry timestamptz,
  p_previous_account_id uuid, p_previous_refresh_token text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.youtube_connection_attempts%rowtype;
  acct public.platform_accounts%rowtype;
  saved_id uuid;
  channel_id text;
begin
  perform 1 from public.team_members where user_id = p_user_id and team_id = p_team_id and role in ('owner','admin') for share;
  if not found then raise exception 'YouTube confirmation permission denied'; end if;
  select * into a from public.youtube_connection_attempts where id = p_attempt_id and user_id = p_user_id and team_id = p_team_id for update;
  if not found then raise exception 'YouTube attempt not found'; end if;
  if a.status = 'confirmed' then return a.account_id; end if;
  if a.status <> 'awaiting_confirmation' or a.expires_at <= clock_timestamp() then raise exception 'YouTube attempt is no longer pending'; end if;
  if coalesce(p_refresh_token, '') = '' then raise exception 'Missing YouTube refresh token'; end if;
  channel_id := a.identity->>'channelId';
  if channel_id is null or channel_id !~ '^UC[A-Za-z0-9_-]{22}$' then raise exception 'Invalid YouTube identity'; end if;
  if a.expected_channel_id is not null and a.expected_channel_id <> channel_id then raise exception 'YouTube reconnect identity mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_team_id::text || ':youtube:' || channel_id, 0));
  select * into acct from public.platform_accounts where team_id = p_team_id and provider = 'youtube' and platform_user_id = channel_id for update;
  if acct.id is distinct from p_previous_account_id or acct.refresh_token is distinct from p_previous_refresh_token then
    raise exception 'YouTube connection changed; start again';
  end if;
  if a.previous_account_id is distinct from p_previous_account_id then raise exception 'YouTube account snapshot changed'; end if;
  if a.expected_account_id is not null and a.expected_account_id is distinct from acct.id then raise exception 'YouTube reconnect account changed'; end if;
  if exists (select 1 from public.youtube_account_identity where platform_account_id = acct.id and confirmed_at > a.created_at) then
    raise exception 'A newer YouTube connection was already confirmed';
  end if;
  -- Advisory/account locks can also take time. now() is transaction-stable, not a deadline clock.
  if a.expires_at <= clock_timestamp() then raise exception 'YouTube attempt expired while waiting'; end if;
  if acct.id is not null then
    update public.platform_accounts set refresh_token = p_refresh_token, access_token = p_access_token,
      expiry = p_expiry, avatar_url = a.identity->>'avatarUrl', updated_at = now()
      where id = acct.id returning id into saved_id;
  else
    insert into public.platform_accounts(user_id, team_id, provider, platform_user_id, refresh_token, access_token, expiry, profile_name, label, avatar_url, updated_at)
      values (p_user_id, p_team_id, 'youtube', channel_id, p_refresh_token, p_access_token, p_expiry,
        a.identity->>'title', a.identity->>'title', a.identity->>'avatarUrl', now()) returning id into saved_id;
  end if;
  insert into public.youtube_account_identity(platform_account_id,title,custom_url,avatar_url,verified_at,confirmed_at,confirmed_by)
    values (saved_id,a.identity->>'title',a.identity->>'customUrl',a.identity->>'avatarUrl',now(),now(),p_user_id)
    on conflict (platform_account_id) do update set title=excluded.title,custom_url=excluded.custom_url,
      avatar_url=excluded.avatar_url,verified_at=excluded.verified_at,confirmed_at=excluded.confirmed_at,confirmed_by=excluded.confirmed_by;
  update public.youtube_connection_attempts set status='confirmed',account_id=saved_id,credential_envelope=null where id=a.id;
  return saved_id;
end $$;
revoke all on function public.confirm_youtube_connection(uuid,uuid,uuid,text,text,timestamptz,uuid,text) from public, anon, authenticated;
grant execute on function public.confirm_youtube_connection(uuid,uuid,uuid,text,text,timestamptz,uuid,text) to service_role;

create function public.cleanup_youtube_connections() returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.youtube_connection_attempts set status='expired',credential_envelope=null
    where expires_at <= now() and status in ('started','exchanging','awaiting_confirmation');
  delete from public.youtube_connection_attempts where expires_at < now() - interval '24 hours';
end $$;
revoke all on function public.cleanup_youtube_connections() from public, anon, authenticated;
grant execute on function public.cleanup_youtube_connections() to service_role;

create table public.youtube_identity_refresh_limits (
  platform_account_id uuid primary key references public.platform_accounts(id) on delete cascade,
  last_attempt_at timestamptz not null default now()
);
alter table public.youtube_identity_refresh_limits enable row level security;
revoke all on public.youtube_identity_refresh_limits from public, anon, authenticated;
grant all on public.youtube_identity_refresh_limits to service_role;
create function public.claim_youtube_identity_refresh(p_account_id uuid) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.youtube_identity_refresh_limits(platform_account_id) values (p_account_id)
    on conflict (platform_account_id) do update set last_attempt_at=now()
      where youtube_identity_refresh_limits.last_attempt_at < now() - interval '1 minute';
  return found;
end $$;
revoke all on function public.claim_youtube_identity_refresh(uuid) from public, anon, authenticated;
grant execute on function public.claim_youtube_identity_refresh(uuid) to service_role;
commit;
