-- Bàn giao CRM → SX: admin chịu trách nhiệm + phân công mục mẫu → thành viên theo công ty sản xuất
-- + Đội sản xuất (workshop_teams) gắn công ty

-- 1) Mở rộng workshop_teams: công ty + loại production
ALTER TABLE workshop_teams
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_teams_company_type
  ON workshop_teams(company_id, type)
  WHERE company_id IS NOT NULL;

COMMENT ON COLUMN workshop_teams.company_id IS 'Công ty sở hữu đội (NULL = đội toàn hệ thống / VC cũ)';

ALTER TABLE workshop_teams DROP CONSTRAINT IF EXISTS workshop_teams_type_check;
ALTER TABLE workshop_teams ADD CONSTRAINT workshop_teams_type_check
  CHECK (type IN ('delivery', 'installation', 'production'));

-- 2) Cài đặt tổng: người chịu trách nhiệm (thường admin công ty SX) + đội mặc định
CREATE TABLE IF NOT EXISTS production_handover_settings (
  production_company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  default_production_team_id UUID REFERENCES workshop_teams(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE production_handover_settings IS
  'Khi deal chọn công ty SX: người phụ trách chính + đội SX mặc định gán dự án';
COMMENT ON COLUMN production_handover_settings.responsible_user_id IS
  'Người chịu trách nhiệm (thường admin công ty SX) — đồng bộ production_person_id khi tạo dự án';

-- 3) Phân công từng mục trong bộ mẫu workshop_task_template_items
CREATE TABLE IF NOT EXISTS production_handover_task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_item_id UUID NOT NULL REFERENCES workshop_task_template_items(id) ON DELETE CASCADE,
  assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (production_company_id, template_item_id)
);

CREATE INDEX IF NOT EXISTS idx_prod_handover_assign_co ON production_handover_task_assignments(production_company_id);

COMMENT ON TABLE production_handover_task_assignments IS
  'Phân công mặc định: mục mẫu SX → nhân sự (team SX — users.company_id nên trùng công ty SX)';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS production_workshop_team_id UUID REFERENCES workshop_teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_production_ws_team ON projects(production_workshop_team_id);

COMMENT ON COLUMN projects.production_workshop_team_id IS 'Đội SX (workshop_teams type=production) gắn dự án khi bàn giao từ CRM';
