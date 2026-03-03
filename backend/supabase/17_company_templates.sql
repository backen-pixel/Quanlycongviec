-- Migration 17: BỘ NV MẪU THEO CÔNG TY + LUỒNG DỰ ÁN QUA KHỐI
-- Mỗi Cty có nhiều bộ NV mẫu, phân công PB/Team/NV mặc định
-- Dự án gán Cty cho từng Khối, chuyển giao giữa Khối

-- ═══ 1. BỘ NV MẪU THEO CÔNG TY ═══
-- Mỗi Cty (ecosystem_unit cấp subsidiary) có nhiều bộ template
CREATE TABLE IF NOT EXISTS company_template_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE NOT NULL, -- Cty nào
  name VARCHAR(255) NOT NULL,              -- VD: "Dự án Biệt thự", "Dự án Chung cư"
  description TEXT,
  project_type VARCHAR(100),               -- Phân loại: biệt thự, chung cư, showroom...
  is_default BOOLEAN DEFAULT false,        -- Bộ mặc định khi tạo dự án nhanh
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cts_unit ON company_template_sets(unit_id);

-- ═══ 2. TASK MẪU TRONG BỘ ═══
CREATE TABLE IF NOT EXISTS company_template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_set_id UUID REFERENCES company_template_sets(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES workflow_stages(id) NOT NULL,  -- Thuộc quy trình nào
  title VARCHAR(500) NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  -- Phân công mặc định
  default_department_id UUID REFERENCES ecosystem_units(id), -- PB mặc định
  default_team_id UUID REFERENCES ecosystem_units(id),       -- Team mặc định
  default_assignee_id UUID REFERENCES users(id),             -- NV mặc định
  estimated_hours DECIMAL(8,2),
  priority VARCHAR(20) DEFAULT 'medium',  -- low, medium, high, urgent
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctt_set ON company_template_tasks(template_set_id);
CREATE INDEX IF NOT EXISTS idx_ctt_stage ON company_template_tasks(stage_id);

-- ═══ 3. CHECKLIST MẪU ═══
CREATE TABLE IF NOT EXISTS company_template_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id UUID REFERENCES company_template_tasks(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(500) NOT NULL,
  order_index INT DEFAULT 0,
  require_file BOOLEAN DEFAULT false,
  require_note BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctc_task ON company_template_checklists(template_task_id);

-- ═══ 4. GÁN CÔNG TY VÀO DỰ ÁN THEO KHỐI ═══
-- Mỗi dự án có nhiều Khối, mỗi Khối gán 1 Cty tham gia
CREATE TABLE IF NOT EXISTS project_company_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  division_unit_id UUID REFERENCES ecosystem_units(id) NOT NULL,  -- Khối nào
  company_unit_id UUID REFERENCES ecosystem_units(id) NOT NULL,   -- Cty nào trong Khối
  template_set_id UUID REFERENCES company_template_sets(id),       -- Bộ NV mẫu đã chọn
  -- Trạng thái
  status VARCHAR(30) DEFAULT 'pending', -- pending, in_progress, completed, handed_off
  order_index INT DEFAULT 0,            -- Thứ tự Khối trong luồng
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  handoff_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, division_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_pca_project ON project_company_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_pca_company ON project_company_assignments(company_unit_id);

-- ═══ 5. CHUYỂN GIAO GIỮA KHỐI ═══
CREATE TABLE IF NOT EXISTS project_phase_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  from_division_id UUID REFERENCES ecosystem_units(id) NOT NULL,
  to_division_id UUID REFERENCES ecosystem_units(id) NOT NULL,
  -- Nội dung chuyển giao
  summary TEXT,
  files_json JSONB DEFAULT '[]',  -- [{name, url, type}]
  notes TEXT,
  -- Trạng thái
  status VARCHAR(30) DEFAULT 'pending', -- pending, accepted, rejected
  created_by UUID REFERENCES users(id),
  accepted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pph_project ON project_phase_handoffs(project_id);

-- ═══ 6. RLS ═══
ALTER TABLE company_template_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_template_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_company_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phase_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON company_template_sets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON company_template_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON company_template_checklists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON project_company_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON project_phase_handoffs FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE project_company_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE project_phase_handoffs;

-- ═══ 7. THÊM COLUMN stage_group_id CHO KHỐI ═══
-- 1 Khối (division) = 1 Nhóm quy trình
DO $$ BEGIN
  ALTER TABLE ecosystem_units ADD COLUMN stage_group_id UUID REFERENCES workflow_stage_groups(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
