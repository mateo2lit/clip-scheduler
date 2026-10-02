-- AI Clips instant post: the captioned upload is reserved before its render finishes.
alter table uploads add column if not exists render_status text;          -- null = ready | 'rendering' | 'failed'
alter table uploads add column if not exists render_job_id uuid;
alter table uploads add column if not exists render_started_at timestamptz;
alter table ai_clip_burn_jobs add column if not exists progress_stage text;
alter table ai_clip_burn_jobs add column if not exists progress_pct int;
