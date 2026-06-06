-- 296_production_pipeline_collected_revenue.sql
-- Cột pipeline SX: tick «Đã thu tiền» để cộng estimated_value vào KPI «Đã thu» trên dashboard.

BEGIN;

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS counts_as_collected_revenue BOOLEAN;

COMMENT ON COLUMN production_pipeline_stages.counts_as_collected_revenue IS
  'TRUE: cộng estimated_value dự án vào ô «Đã thu» trên dashboard Sản xuất.';

COMMENT ON COLUMN production_pipeline_stages.counts_as_completed_revenue IS
  'TRUE: cộng estimated_value vào «Đã công» / công nợ (nếu chưa thu) trên dashboard Sản xuất.';

CREATE INDEX IF NOT EXISTS idx_production_pipeline_stages_counts_as_collected_revenue
  ON production_pipeline_stages (company_id)
  WHERE counts_as_collected_revenue = TRUE;

COMMIT;
