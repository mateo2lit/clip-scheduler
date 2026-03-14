CREATE TABLE vertical_conversions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL,
  source_upload_id   UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  style              TEXT NOT NULL CHECK (style IN ('crop', 'blur')),
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','processing','done','failed')),
  result_upload_id   UUID REFERENCES uploads(id) ON DELETE SET NULL,
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
