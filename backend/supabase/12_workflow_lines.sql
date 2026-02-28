-- Migration 12: Project Workflow Lines — Luồng phân công linh hoạt
-- 1 dự án có thể có nhiều bộ phận cùng giai đoạn (VD: 2 xưởng sản xuất)
-- Thay thế 8 cột _person_id cố định trên projects

-- ═══ BẢNG LUỒNG CÔNG VIỆC ═══
CREATE TABLE IF NOT EXISTS project_workflow_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_slug TEXT NOT NULL,          -- 'consulting', 'production', etc.
  label TEXT NOT NULL,               -- 'Xưởng Nhôm', 'Team Lắp đặt 1', etc.
  assignee_id UUID REFERENCES users(id),
  description TEXT,                  -- 'Sản xuất bếp nhôm chữ L'
  order_index INT DEFAULT 0,
  status TEXT DEFAULT 'pending',     -- pending, active, done
  color TEXT,                        -- optional color override
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pwl_project ON project_workflow_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_pwl_project_stage ON project_workflow_lines(project_id, stage_slug);
CREATE INDEX IF NOT EXISTS idx_pwl_assignee ON project_workflow_lines(assignee_id);

-- ═══ LINK TASKS TO WORKFLOW LINE (optional) ═══
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='workflow_line_id') THEN
    ALTER TABLE tasks ADD COLUMN workflow_line_id UUID REFERENCES project_workflow_lines(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_workflow_line ON tasks(workflow_line_id);
