-- 36_auto_project_config.sql
-- Cấu hình tự động tạo dự án khi Deal thắng
-- Chỉ có 1 record (singleton config)

CREATE TABLE IF NOT EXISTS auto_project_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Luồng mặc định
  flow_id UUID REFERENCES workflow_flows(id) ON DELETE SET NULL,
  -- Phân công Khối/Cty cho từng step (JSONB array)
  -- [{division_unit_id, company_unit_id, template_set_id, order_index}]
  flow_assignments JSONB DEFAULT '[]',
  -- Thông tin bổ sung
  default_status TEXT DEFAULT 'consulting',
  default_priority TEXT DEFAULT 'medium',
  -- Import CRM tasks vào step KD (order_index=0)?
  import_crm_tasks BOOLEAN DEFAULT true,
  -- Tạo CRM tasks nữa không (bên tab CRM)?
  create_crm_tasks BOOLEAN DEFAULT true,
  -- Timestamps
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed 1 record mặc định (empty config — user phải setup)
INSERT INTO auto_project_config (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;
