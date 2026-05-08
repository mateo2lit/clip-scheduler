-- supabase/migrations/20260507_ai_clips_chunked.sql
-- Run manually in Supabase SQL editor (project convention: supabase.skipDbPush=true)

CREATE TABLE IF NOT EXISTS ai_clip_audio_chunks (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references ai_clip_jobs(id) on delete cascade,
  chunk_index           int not null,
  start_sec             numeric not null,
  end_sec               numeric not null,
  storage_path          text not null,
  status                text not null default 'uploaded',  -- uploaded | transcribing | done | failed
  transcript            text,
  word_segments_json    jsonb,
  error                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  unique (job_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ai_clip_audio_chunks_job_idx
  ON ai_clip_audio_chunks(job_id);

ALTER TABLE ai_clip_jobs
  ADD COLUMN IF NOT EXISTS processing_path        text not null default 'small',  -- 'small' | 'large'
  ADD COLUMN IF NOT EXISTS audio_chunks_total     int,
  ADD COLUMN IF NOT EXISTS notify_email           boolean not null default true,
  ADD COLUMN IF NOT EXISTS notify_email_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS transcript             text,
  ADD COLUMN IF NOT EXISTS result_moments_json    jsonb;
