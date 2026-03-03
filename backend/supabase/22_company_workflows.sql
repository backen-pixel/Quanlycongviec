-- Migration 22: QUY TRÌNH NỘI BỘ THEO CÔNG TY
-- Mỗi Công ty trong Khối tự quy định danh sách quy trình riêng
-- Mỗi quy trình có nhiều nhiệm vụ, mỗi nhiệm vụ có checklist
-- Quy trình gắn vào flow step (1 flow step = 1 Khối+Cty → chạy hết quy trình nội bộ)

-- ═══ 1. QUY TRÌNH NỘI BỘ CỦA CÔNG TY ═══
CREATE TABLE IF NOT EXISTS company_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_unit_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE NOT NULL, -- Cty nào
  name VARCHAR(255) NOT NULL,            -- VD: "Thiết kế 2D", "Báo giá chi tiết"
  description TEXT,
  color VARCHAR(20) DEFAULT '#3B82F6',
  icon VARCHAR(10) DEFAULT '📋',
  order_index INT DEFAULT 0,             -- Thứ tự trong Cty
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cp_company ON company_processes(company_unit_id);

-- ═══ 2. NHIỆM VỤ MẪU TRONG QUY TRÌNH ═══
CREATE TABLE IF NOT EXISTS company_process_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID REFERENCES company_processes(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  default_department_id UUID REFERENCES ecosystem_units(id),
  default_team_id UUID REFERENCES ecosystem_units(id),
  default_assignee_id UUID REFERENCES users(id),
  estimated_hours DECIMAL(8,2),
  deadline_days INT DEFAULT 0,
  deadline_hours INT DEFAULT 0,
  priority VARCHAR(20) DEFAULT 'medium',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpt_process ON company_process_tasks(process_id);

-- ═══ 3. CHECKLIST MẪU TRONG NHIỆM VỤ ═══
CREATE TABLE IF NOT EXISTS company_process_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES company_process_tasks(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(500) NOT NULL,
  order_index INT DEFAULT 0,
  require_file BOOLEAN DEFAULT false,
  require_note BOOLEAN DEFAULT false,
  default_assignee_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpc_task ON company_process_checklists(task_id);

-- ═══ 4. LIÊN KẾT: FLOW STEP ↔ QUY TRÌNH NỘI BỘ ═══
-- Mỗi flow step (Khối+Cty) chọn những quy trình nào cần chạy + thứ tự
CREATE TABLE IF NOT EXISTS flow_step_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_step_id UUID REFERENCES workflow_flow_steps(id) ON DELETE CASCADE NOT NULL,
  process_id UUID REFERENCES company_processes(id) ON DELETE CASCADE NOT NULL,
  order_index INT DEFAULT 0,             -- Thứ tự chạy quy trình trong step
  is_required BOOLEAN DEFAULT true,      -- Bắt buộc hoàn thành hay optional
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(flow_step_id, process_id)
);

CREATE INDEX IF NOT EXISTS idx_fsp_step ON flow_step_processes(flow_step_id);
CREATE INDEX IF NOT EXISTS idx_fsp_process ON flow_step_processes(process_id);

-- ═══ 5. RLS ═══
ALTER TABLE company_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_process_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_process_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_step_processes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "allow_all" ON company_processes FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "allow_all" ON company_process_tasks FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "allow_all" ON company_process_checklists FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "allow_all" ON flow_step_processes FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
