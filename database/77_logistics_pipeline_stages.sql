-- Migration 77: Tạo bảng logistics_pipeline_stages cho module Vận chuyển & Lắp đặt
-- Chạy trong Supabase Dashboard > SQL Editor

-- Bảng cấu hình cột Kanban cho module VC (giống production_pipeline_stages)
CREATE TABLE IF NOT EXISTS logistics_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#f97316',
  icon TEXT DEFAULT '📦',
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  workflow_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
  bucket_slug TEXT, -- 'delivery_pending' for intake bucket
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index để tăng tốc query
CREATE INDEX IF NOT EXISTS idx_logistics_pipeline_stages_order ON logistics_pipeline_stages(order_index);
CREATE INDEX IF NOT EXISTS idx_logistics_pipeline_stages_active ON logistics_pipeline_stages(is_active);

-- Cột logistics_person_id trên bảng projects (người phụ trách vận chuyển)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS logistics_person_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_logistics_person ON projects(logistics_person_id);

-- Seed dữ liệu mặc định cho pipeline VC
INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug)
VALUES
  ('Chờ vận chuyển',  '#f97316', '📦', 1, true, 'delivery_pending'),
  ('Đang vận chuyển', '#ea580c', '🚚', 2, true, NULL),
  ('Đang lắp đặt',    '#d97706', '🔧', 3, true, NULL),
  ('Bảo hành',        '#0f766e', '🤝', 4, true, NULL),
  ('Hoàn thành',      '#16a34a', '✅', 5, true, NULL)
ON CONFLICT DO NOTHING;

-- Cập nhật workflow_stage_id dựa vào slug (nếu đã có workflow stages)
UPDATE logistics_pipeline_stages lps
SET workflow_stage_id = ws.id
FROM workflow_stages ws
WHERE ws.slug = 'delivery' AND lps.name = 'Đang vận chuyển' AND lps.workflow_stage_id IS NULL;

UPDATE logistics_pipeline_stages lps
SET workflow_stage_id = ws.id
FROM workflow_stages ws
WHERE ws.slug = 'installation' AND lps.name = 'Đang lắp đặt' AND lps.workflow_stage_id IS NULL;

UPDATE logistics_pipeline_stages lps
SET workflow_stage_id = ws.id
FROM workflow_stages ws
WHERE ws.slug = 'customer-care' AND lps.name = 'Bảo hành' AND lps.workflow_stage_id IS NULL;

-- Xác nhận
SELECT 'logistics_pipeline_stages created with ' || COUNT(*)::text || ' stages' AS result
FROM logistics_pipeline_stages;
