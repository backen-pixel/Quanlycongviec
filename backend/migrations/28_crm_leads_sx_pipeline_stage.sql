-- Cột Kanban sản xuất trên deal (đồng bộ với vị trí dự án trên /sx)
-- Chạy trên Supabase SQL Editor (hoặc migration runner).

ALTER TABLE crm_leads
ADD COLUMN IF NOT EXISTS sx_pipeline_stage_id UUID REFERENCES production_pipeline_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_sx_pipeline_stage_id
  ON crm_leads(sx_pipeline_stage_id)
  WHERE sx_pipeline_stage_id IS NOT NULL;

COMMENT ON COLUMN crm_leads.sx_pipeline_stage_id IS 'Cột pipeline xưởng (production_pipeline_stages); cập nhật khi deal thắng có dự án và khi kéo Kanban sản xuất';
