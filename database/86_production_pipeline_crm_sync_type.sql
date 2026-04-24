-- Migration 86: Thêm crm_sync_type vào production_pipeline_stages
-- Cho phép cấu hình chính xác cột nào trong xưởng sẽ trigger CRM deal nhảy sang "Sản xuất".
-- Giá trị: 'production' = khi đến cột này → CRM deal → "Sản xuất", NULL = không trigger.
-- Script an toàn — có thể chạy nhiều lần.

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS crm_sync_type TEXT DEFAULT NULL;

COMMENT ON COLUMN production_pipeline_stages.crm_sync_type IS
  'Khi = ''production'': project vào cột này → CRM deal tự nhảy sang cột "Sản xuất". NULL = không đồng bộ.';

-- Đặt sẵn cho cột mẫu "Nhận bản vẽ & tối ưu" (slug sx-sample-drawing) nếu tồn tại
UPDATE production_pipeline_stages
SET crm_sync_type = 'production'
WHERE workflow_stage_id IN (
  SELECT id FROM workflow_stages WHERE slug = 'sx-sample-drawing'
)
AND crm_sync_type IS NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_production_pipeline_stages_crm_sync_type
  ON production_pipeline_stages(crm_sync_type)
  WHERE crm_sync_type IS NOT NULL;
