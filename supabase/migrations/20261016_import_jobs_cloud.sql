-- Google Drive / Dropbox import.
--
-- import_jobs gains a description of the picked file. The short-lived credential needed to
-- download it (a Drive access token or a Dropbox direct link) lives in its own table with RLS
-- on and no policies, so only the service role (the API route and the import-cloud workflow)
-- can read it. The workflow deletes the row as soon as the download finishes or fails.
--
-- The credential never goes into workflow_dispatch inputs: the repo is public, so Actions
-- logs are readable by any signed-in GitHub user.

alter table public.import_jobs
  add column if not exists source_file_id text,
  add column if not exists source_file_name text,
  add column if not exists file_size bigint;

create table if not exists public.import_job_secrets (
  job_id uuid primary key references public.import_jobs(id) on delete cascade,
  secret text not null,
  created_at timestamptz not null default now()
);

alter table public.import_job_secrets enable row level security;
