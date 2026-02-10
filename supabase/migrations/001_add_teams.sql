-- Step 1: New tables + columns

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'My Team',
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

CREATE TABLE team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, email)
);

ALTER TABLE uploads ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_invites_email ON team_invites(email);
CREATE INDEX idx_uploads_team_id ON uploads(team_id);
CREATE INDEX idx_scheduled_posts_team_id ON scheduled_posts(team_id);
CREATE INDEX idx_platform_accounts_team_id ON platform_accounts(team_id);

-- Step 2: Backfill existing users

-- Create personal teams for all existing users
INSERT INTO teams (id, name, owner_id)
SELECT gen_random_uuid(), 'My Team', id FROM auth.users
WHERE id NOT IN (SELECT owner_id FROM teams);

-- Add each user as owner
INSERT INTO team_members (team_id, user_id, role)
SELECT t.id, t.owner_id, 'owner' FROM teams t
WHERE NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = t.owner_id);

-- Backfill team_id on existing data
UPDATE uploads u SET team_id = (SELECT t.id FROM teams t WHERE t.owner_id = u.user_id LIMIT 1) WHERE u.team_id IS NULL;
UPDATE scheduled_posts sp SET team_id = (SELECT t.id FROM teams t WHERE t.owner_id = sp.user_id LIMIT 1) WHERE sp.team_id IS NULL;
UPDATE platform_accounts pa SET team_id = (SELECT t.id FROM teams t WHERE t.owner_id = pa.user_id LIMIT 1) WHERE pa.team_id IS NULL;

-- Drop old unique constraint on platform_accounts and add team-based one
ALTER TABLE platform_accounts DROP CONSTRAINT IF EXISTS platform_accounts_user_id_provider_key;
ALTER TABLE platform_accounts ADD CONSTRAINT platform_accounts_team_id_provider_key UNIQUE (team_id, provider);
