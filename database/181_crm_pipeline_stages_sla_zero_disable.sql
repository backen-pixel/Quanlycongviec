-- Cho phép sla_days = 0: tắt SLA cột (không cảnh báo Kanban / watchlist).
-- NULL = dùng mặc định 7 ngày trên UI; ≥1 = số ngày SLA.

ALTER TABLE crm_pipeline_stages
  DROP CONSTRAINT IF EXISTS crm_pipeline_stages_sla_days_check;

ALTER TABLE crm_pipeline_stages
  ADD CONSTRAINT crm_pipeline_stages_sla_days_check
  CHECK (sla_days IS NULL OR sla_days >= 0);

COMMENT ON COLUMN crm_pipeline_stages.sla_days IS
  'SLA (ngày) từ stage_entered_at. NULL = mặc định 7; 0 = không áp dụng SLA; ≥1 = số ngày.';
