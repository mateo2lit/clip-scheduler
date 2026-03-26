-- AI Clips feature tables
-- Run manually in Supabase SQL editor (supabase.skipDbPush=true)

CREATE TABLE ai_clip_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  source_file_path TEXT NOT NULL,
  source_bucket TEXT NOT NULL DEFAULT 'clips',
  source_duration_minutes FLOAT NOT NULL,
  clip_count INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','uploading','transcribing','detecting','cutting','done','failed')),
  clips_generated INTEGER,
  result_upload_ids TEXT[],
  result_titles TEXT[],
  result_subtitles JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_clip_jobs_team_id ON ai_clip_jobs(team_id);
CREATE INDEX idx_ai_clip_jobs_created_at ON ai_clip_jobs(created_at DESC);

CREATE TABLE ai_clip_burn_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  source_job_id UUID NOT NULL REFERENCES ai_clip_jobs(id) ON DELETE CASCADE,
  clip_index INTEGER NOT NULL,
  source_clip_path TEXT NOT NULL,
  result_upload_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','burning','done','failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_clip_burn_jobs_team_id ON ai_clip_burn_jobs(team_id);
