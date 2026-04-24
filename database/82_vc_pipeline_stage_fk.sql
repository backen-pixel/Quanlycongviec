-- Migration 82: Thêm FK constraint cho vc_pipeline_stage_id
-- Chạy sau migration 81. Script an toàn — có thể chạy nhiều lần.

-- Đảm bảo bảng logistics_pipeline_stages tồn tại (phòng trường hợp bỏ qua migration 81)
CREATE TABLE IF NOT EXISTS logistics_pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#f97316',
  icon        TEXT DEFAULT '📦',
  order_index INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  workflow_stage_id UUID,
  bucket_slug TEXT,
  crm_sync_type TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed cột mặc định nếu bảng vừa tạo
INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug)
SELECT 'Chờ vận chuyển', '#f97316', '📦', 1, true, 'delivery_pending'
WHERE NOT EXISTS (SELECT 1 FROM logistics_pipeline_stages LIMIT 1);

-- Đảm bảo cột vc_pipeline_stage_id tồn tại
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS vc_pipeline_stage_id UUID;

-- Làm sạch dữ liệu: set NULL nếu trỏ đến ID không tồn tại
UPDATE crm_leads
SET vc_pipeline_stage_id = NULL
WHERE vc_pipeline_stage_id IS NOT NULL
  AND vc_pipeline_stage_id NOT IN (SELECT id FROM logistics_pipeline_stages);

-- Thêm FK constraint (nếu chưa có)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'crm_leads_vc_pipeline_stage_id_fkey'
      AND table_name = 'crm_leads'
  ) THEN
    ALTER TABLE crm_leads
      ADD CONSTRAINT crm_leads_vc_pipeline_stage_id_fkey
      FOREIGN KEY (vc_pipeline_stage_id)
      REFERENCES logistics_pipeline_stages(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_crm_leads_vc_pipeline_stage_id
  ON crm_leads(vc_pipeline_stage_id);
