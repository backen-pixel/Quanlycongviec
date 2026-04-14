-- Đồng bộ: deal có cột sx_pipeline_stage_id trỏ tới production_pipeline_stages (Kanban /sx).
-- (Bản sao logic với backend/migrations/28_crm_leads_sx_pipeline_stage.sql)

ALTER TABLE crm_leads
ADD COLUMN IF NOT EXISTS sx_pipeline_stage_id UUID REFERENCES production_pipeline_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_sx_pipeline_stage_id
  ON crm_leads(sx_pipeline_stage_id)
  WHERE sx_pipeline_stage_id IS NOT NULL;

COMMENT ON COLUMN crm_leads.sx_pipeline_stage_id IS 'Cột pipeline xưởng (production_pipeline_stages); cập nhật khi deal thắng có dự án và khi kéo Kanban sản xuất';
