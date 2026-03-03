-- Migration 20: LUỒNG CÔNG VIỆC (Workflow Flows)
-- Luồng = chuỗi các Khối theo thứ tự: VD Kinh doanh → Sản xuất → Vận chuyển → Lắp đặt
-- Khi tạo dự án → chọn luồng → hệ thống hỏi chọn dự án mẫu cho từng Khối

-- ═══ 1. BẢNG LUỒNG ═══
CREATE TABLE IF NOT EXISTS workflow_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,                -- VD: "Luồng tủ bếp chuẩn"
  description TEXT,
  color VARCHAR(20) DEFAULT '#6366F1',
  icon VARCHAR(10) DEFAULT '🔄',
  is_default BOOLEAN DEFAULT false,          -- Luồng mặc định khi tạo dự án
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 2. CÁC BƯỚC TRONG LUỒNG (Flow Steps) ═══
-- Mỗi bước = 1 Khối (division) theo thứ tự
CREATE TABLE IF NOT EXISTS workflow_flow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES workflow_flows(id) ON DELETE CASCADE NOT NULL,
  division_unit_id UUID REFERENCES ecosystem_units(id) NOT NULL, -- Khối nào
  order_index INT DEFAULT 0,                 -- Thứ tự trong luồng
  -- Thời gian setup: khi bước trước hoàn thành, chờ bao lâu mới bắt đầu bước này
  setup_days INT DEFAULT 0,                  -- Số ngày setup
  setup_hours INT DEFAULT 0,                 -- Số giờ setup thêm
  description TEXT,                           -- Ghi chú cho bước này
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wfs_flow ON workflow_flow_steps(flow_id);

-- ═══ 3. THÊM CỘT deadline_offset VÀO COMPANY_TEMPLATE_TASKS ═══
-- Tính deadline tương đối: bao nhiêu ngày/giờ sau khi bắt đầu giai đoạn
DO $$ BEGIN
  ALTER TABLE company_template_tasks ADD COLUMN deadline_days INT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE company_template_tasks ADD COLUMN deadline_hours INT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ═══ 4. THÊM CỘT deadline_offset VÀO TASK_TEMPLATES (legacy) ═══
DO $$ BEGIN
  ALTER TABLE task_templates ADD COLUMN deadline_days INT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE task_templates ADD COLUMN deadline_hours INT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ═══ 5. THÊM CỘT flow_id VÀO PROJECTS ═══
DO $$ BEGIN
  ALTER TABLE projects ADD COLUMN flow_id UUID REFERENCES workflow_flows(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ═══ 6. THÊM CỘT default_assignee_id VÀO COMPANY_TEMPLATE_CHECKLISTS ═══
DO $$ BEGIN
  ALTER TABLE company_template_checklists ADD COLUMN default_assignee_id UUID REFERENCES users(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ═══ 7. RLS ═══
ALTER TABLE workflow_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_flow_steps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all" ON workflow_flows FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "allow_all" ON workflow_flow_steps FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
