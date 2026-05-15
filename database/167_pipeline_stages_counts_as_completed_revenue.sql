-- 167_pipeline_stages_counts_as_completed_revenue.sql
-- Cờ riêng cho "Doanh thu đã hoàn thành" trên Kanban CRM dashboard.
--
-- Tương tự `counts_as_won_revenue` ở migration 166, cho phép admin chỉ định rõ
-- những cột nào được tính vào ô "Doanh thu đã hoàn thành" thay vì dò theo
-- canonical_slug = 'completed' / deal_report_bucket = 'completed' / tên cột.
--
-- Quy ước đọc dữ liệu:
--   - NẾU pipeline có ÍT NHẤT một stage `counts_as_completed_revenue = true`
--     → ô "Doanh thu đã hoàn thành" cộng các stage được tick.
--   - NẾU không có stage nào set → fallback hành vi cũ
--     (canonical_slug = 'completed', deal_report_bucket = 'completed', tên chứa "Hoàn thành").
-- Idempotent.

BEGIN;

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS counts_as_completed_revenue BOOLEAN;

COMMENT ON COLUMN crm_pipeline_stages.counts_as_completed_revenue IS
  'Khi TRUE: cộng vào ô "Doanh thu đã hoàn thành" trên CRM dashboard. NULL/FALSE = không cộng. Nếu không stage nào set, dashboard tự dò theo canonical_slug/bucket/tên cột.';

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_counts_as_completed_revenue
  ON crm_pipeline_stages (pipeline_id)
  WHERE counts_as_completed_revenue = TRUE;

COMMIT;
