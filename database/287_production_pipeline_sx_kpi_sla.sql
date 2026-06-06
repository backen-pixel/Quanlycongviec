-- 287_production_pipeline_sx_kpi_sla.sql
-- KPI/SLA cột pipeline Sản xuất (mirror crm_pipeline_stages) + thời điểm vào cột trên projects.

BEGIN;

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS default_probability INT
    CHECK (default_probability IS NULL OR (default_probability >= 0 AND default_probability <= 100));

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS sla_days INT
    CHECK (sla_days IS NULL OR sla_days >= 0);

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS counts_as_won_revenue BOOLEAN;

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS counts_as_completed_revenue BOOLEAN;

COMMENT ON COLUMN production_pipeline_stages.default_probability IS
  'Xác suất mặc định (%) khi dự án/deal chưa có % riêng — KPI giá trị có trọng số dashboard SX.';

COMMENT ON COLUMN production_pipeline_stages.sla_days IS
  'SLA cột Kanban SX (ngày từ sx_pipeline_stage_entered_at). NULL = mặc định 7 trên UI; 0 = bỏ quá hạn cột.';

COMMENT ON COLUMN production_pipeline_stages.counts_as_won_revenue IS
  'TRUE: cộng estimated_value dự án vào ô Doanh thu thắng trên dashboard Sản xuất.';

COMMENT ON COLUMN production_pipeline_stages.counts_as_completed_revenue IS
  'TRUE: cộng estimated_value dự án vào ô Doanh thu đã hoàn thành trên dashboard Sản xuất.';

CREATE INDEX IF NOT EXISTS idx_production_pipeline_stages_counts_as_won_revenue
  ON production_pipeline_stages (company_id)
  WHERE counts_as_won_revenue = TRUE;

CREATE INDEX IF NOT EXISTS idx_production_pipeline_stages_counts_as_completed_revenue
  ON production_pipeline_stages (company_id)
  WHERE counts_as_completed_revenue = TRUE;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sx_pipeline_stage_entered_at TIMESTAMPTZ;

COMMENT ON COLUMN projects.sx_pipeline_stage_entered_at IS
  'Reset khi dự án đổi cột Kanban SX — dùng tính SLA cột pipeline.';

-- Backfill từ updated_at/created_at cho dự án đang có deal gắn sx_pipeline_stage_id
UPDATE projects p
SET sx_pipeline_stage_entered_at = COALESCE(p.updated_at, p.created_at, now())
WHERE p.sx_pipeline_stage_entered_at IS NULL
  AND EXISTS (
    SELECT 1 FROM crm_leads l
    WHERE l.project_id = p.id
      AND l.type = 'deal'
      AND l.sx_pipeline_stage_id IS NOT NULL
  );

COMMIT;
