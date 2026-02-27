-- ═══════════════════════════════════════════════════
-- 06: Staff Management + Task Templates + Personal Tasks
-- ═══════════════════════════════════════════════════

-- ─── Staff Management extras ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary NUMERIC(15,0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]';

-- ─── Task Templates (nhiệm vụ mẫu cho từng quy trình) ──
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID REFERENCES workflow_stages(id) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'medium',
  estimated_hours NUMERIC(5,1),
  order_index INT DEFAULT 0,
  checklist_items JSONB DEFAULT '[]',
  assignee_role VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_stage ON task_templates(stage_id);

-- ─── Personal Tasks (nhiệm vụ cá nhân - ko thuộc dự án) ──
ALTER TABLE tasks ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(20) DEFAULT 'project';
-- task_type: 'project' = nhiệm vụ dự án, 'personal' = nhiệm vụ cá nhân

-- ─── Supabase Storage for file uploads ──
-- (Bucket phải tạo qua Supabase Dashboard: Settings > Storage > New bucket "attachments" public)
-- Cập nhật file_attachments để dùng Supabase Storage URL thay vì local

-- RLS
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_templates ON task_templates;
CREATE POLICY allow_all_templates ON task_templates FOR ALL USING (true) WITH CHECK (true);
