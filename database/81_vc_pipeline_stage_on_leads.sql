-- Migration 81: Thêm vc_pipeline_stage_id vào crm_leads
-- Bước 1: Tạo bảng logistics_pipeline_stages nếu chưa tồn tại

CREATE TABLE IF NOT EXISTS logistics_pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#f97316',
  icon        TEXT DEFAULT '📦',
  order_index INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  workflow_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
  bucket_slug TEXT,
  crm_sync_type TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed cột mặc định nếu bảng vừa được tạo (chưa có dòng nào)
INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, crm_sync_type)
SELECT 'Chờ vận chuyển', '#f97316', '📦', 1, true, 'delivery_pending', null
WHERE NOT EXISTS (SELECT 1 FROM logistics_pipeline_stages LIMIT 1);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, crm_sync_type)
SELECT 'Đang vận chuyển', '#ea580c', '🚚', 2, true, 'delivery'
WHERE NOT EXISTS (SELECT 1 FROM logistics_pipeline_stages WHERE name = 'Đang vận chuyển');

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, crm_sync_type)
SELECT 'Đang lắp đặt', '#d97706', '🔧', 3, true, 'installation'
WHERE NOT EXISTS (SELECT 1 FROM logistics_pipeline_stages WHERE name = 'Đang lắp đặt');

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, crm_sync_type)
SELECT 'Bảo hành & CSKH', '#0f766e', '🤝', 4, true, 'customer_care'
WHERE NOT EXISTS (SELECT 1 FROM logistics_pipeline_stages WHERE name = 'Bảo hành & CSKH');

-- Bước 2: Thêm cột vc_pipeline_stage_id vào crm_leads (không FK cứng để tránh lỗi nếu bảng vừa tạo)
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS vc_pipeline_stage_id UUID;

-- Index để join nhanh
CREATE INDEX IF NOT EXISTS idx_crm_leads_vc_pipeline_stage_id
  ON crm_leads(vc_pipeline_stage_id);

COMMENT ON COLUMN crm_leads.vc_pipeline_stage_id IS
  'Trỏ đến logistics_pipeline_stages.id — cập nhật tự động khi project VC chuyển cột';
