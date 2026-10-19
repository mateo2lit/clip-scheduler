-- Scheduled jobs that run inside Supabase (pg_cron + pg_net).
-- Run in the Supabase dashboard → SQL Editor. These jobs are NOT created by migrations.
--
-- All three jobs (the every-minute post worker and the two nightly jobs) read
-- WORKER_SECRET from Vault, so rotating the secret means updating Vault only.
-- The nightly jobs moved here from GitHub Actions, because GitHub turns off
-- scheduled workflows after 60 days without commits.
--
-- Times are UTC. All three endpoints accept WORKER_SECRET as a Bearer token.

-- ── Step 1 (once): store the worker secret in Vault ─────────────────────────────
-- Replace the placeholder with the value of WORKER_SECRET from Vercel.
-- Never commit the real value.
select vault.create_secret('PASTE_WORKER_SECRET_HERE', 'clipdash_worker_secret');

-- ── Step 2: schedule the jobs ───────────────────────────────────────────────────
-- cron.schedule with an existing job name updates that job, so re-running is safe.

-- Post worker, every minute.
-- This job was first made by hand with the secret typed into its URL (?token=...).
-- After the 2026-10-17 rotation it kept sending the old secret, got 401s, and
-- nothing posted. Same name here, so running this replaces that version in place.
select cron.schedule(
  'clip_scheduler_worker_every_minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://clip-scheduler.vercel.app/api/worker/run-scheduled',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'clipdash_worker_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Token refresh + storage cleanup, daily at 03:00 UTC
select cron.schedule(
  'clipdash-refresh-tokens',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://clip-scheduler.vercel.app/api/worker/refresh-tokens',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'clipdash_worker_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Follower snapshots, daily at 06:00 UTC
select cron.schedule(
  'clipdash-follower-snapshots',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://clip-scheduler.vercel.app/api/worker/follower-snapshots',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'clipdash_worker_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $
);

-- Stuck-posts alert, every 10 minutes. Emails SUPPORT_EMAIL (at most every 6 hours) when due
-- posts sit in `scheduled` 15+ minutes. Sends no secret on purpose, so a wrong WORKER_SECRET
-- can't silence it. Needs supabase/migrations/20261019_system_alerts.sql run first.
select cron.schedule(
  'clipdash-stuck-posts-check',
  '*/10 * * * *',
  $
  select net.http_get(
    url := 'https://clip-scheduler.vercel.app/api/health/stuck-posts',
    timeout_milliseconds := 60000
  );
  $
);

-- ── Check ───────────────────────────────────────────────────────────────────────
-- All jobs (you should see exactly these four, and no other `* * * * *` job
-- with run-scheduled?token= in its command):
select jobid, jobname, schedule, active, command from cron.job order by jobid;

-- After a run: was the request sent? (cron side)
-- select jobid, status, start_time, return_message from cron.job_run_details order by start_time desc limit 10;
-- What did the endpoint answer? (HTTP side; 200 = ok. The post worker answers a wrong secret with
-- 500 "Unauthorized worker request"; the stuck-posts check answers 503 while posts are stuck.)
-- select id, status_code, error_msg, created from net._http_response order by created desc limit 10;

-- ── Undo ────────────────────────────────────────────────────────────────────────
-- select cron.unschedule('clip_scheduler_worker_every_minute');
-- select cron.unschedule('clipdash-refresh-tokens');
-- select cron.unschedule('clipdash-follower-snapshots');
-- select cron.unschedule('clipdash-stuck-posts-check');
