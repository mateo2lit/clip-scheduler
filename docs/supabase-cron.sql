-- Scheduled jobs that run inside Supabase (pg_cron + pg_net).
-- Run in the Supabase dashboard → SQL Editor. These jobs are NOT created by migrations.
--
-- The post worker (/api/worker/run-scheduled, every minute) already runs here; it was
-- set up by hand earlier and is not recreated by this file.
-- This file moves the two nightly jobs here from GitHub Actions, because GitHub turns
-- off scheduled workflows after 60 days without commits.
--
-- Times are UTC. Both endpoints accept WORKER_SECRET as a Bearer token.

-- ── Step 1 (once): store the worker secret in Vault ─────────────────────────────
-- Replace the placeholder with the value of WORKER_SECRET from Vercel.
-- Never commit the real value.
select vault.create_secret('PASTE_WORKER_SECRET_HERE', 'clipdash_worker_secret');

-- ── Step 2: schedule the nightly jobs ───────────────────────────────────────────
-- cron.schedule with an existing job name updates that job, so re-running is safe.

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
  $$
);

-- ── Check ───────────────────────────────────────────────────────────────────────
-- All jobs (you should see the existing every-minute worker plus these two):
select jobid, jobname, schedule, active from cron.job order by jobid;

-- After a run: was the request sent? (cron side)
-- select jobid, status, start_time, return_message from cron.job_run_details order by start_time desc limit 10;
-- What did the endpoint answer? (HTTP side; 200 = ok, 401 = wrong secret)
-- select id, status_code, error_msg, created from net._http_response order by created desc limit 10;

-- ── Undo ────────────────────────────────────────────────────────────────────────
-- select cron.unschedule('clipdash-refresh-tokens');
-- select cron.unschedule('clipdash-follower-snapshots');
