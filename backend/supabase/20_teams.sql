-- Migration 20: Teams + NV thuộc Team
-- Team là con của Phòng ban, NV thuộc Team

-- ═══ 1. BẢNG teams ═══
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  short_name VARCHAR(50),
  department_id UUID REFERENCES departments(id) NOT NULL,
  leader_id UUID REFERENCES users(id),
  description TEXT,
  color VARCHAR(7) DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_department ON teams(department_id);
CREATE INDEX IF NOT EXISTS idx_teams_leader ON teams(leader_id);

-- ═══ 2. THÊM team_id CHO users ═══
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN team_id UUID REFERENCES teams(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
