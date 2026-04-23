-- Migration 79: Đội vận chuyển & Lắp đặt
-- Chạy trong Supabase Dashboard > SQL Editor

-- Bảng đội nhóm
CREATE TABLE IF NOT EXISTS workshop_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('delivery', 'installation')),
  description TEXT,
  color       TEXT DEFAULT '#f97316',
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workshop_teams_type ON workshop_teams(type);

-- Thành viên đội nhóm
CREATE TABLE IF NOT EXISTS workshop_team_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES workshop_teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT DEFAULT 'member',   -- 'leader' | 'member'
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wtm_team ON workshop_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_wtm_user ON workshop_team_members(user_id);

-- Thêm cột gán đội/người vào dự án
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS delivery_team_id      UUID REFERENCES workshop_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installation_team_id  UUID REFERENCES workshop_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installer_person_id   UUID REFERENCES users(id)          ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_delivery_team    ON projects(delivery_team_id);
CREATE INDEX IF NOT EXISTS idx_projects_installation_team ON projects(installation_team_id);
CREATE INDEX IF NOT EXISTS idx_projects_installer_person  ON projects(installer_person_id);

-- Seed đội mặc định
INSERT INTO workshop_teams (name, type, color, description) VALUES
  ('Đội Vận chuyển 1', 'delivery',     '#f97316', 'Đội vận chuyển chính'),
  ('Đội Lắp đặt 1',    'installation', '#d97706', 'Đội lắp đặt chính')
ON CONFLICT DO NOTHING;

SELECT 'Migration 79 done' AS result;
