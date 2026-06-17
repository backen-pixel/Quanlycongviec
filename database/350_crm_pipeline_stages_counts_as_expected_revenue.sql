-- 350_crm_pipeline_stages_counts_as_expected_revenue.sql
-- Cờ chọn cột tính «Giá trị dự kiến» và «Giá trị kỳ vọng» trên CRM dashboard (deal pipeline).
--
-- Quy ước đọc dữ liệu:
--   - NẾU pipeline có ÍT NHẤT một stage `counts_as_expected_revenue = true`
--     → cả «Giá trị dự kiến» (estimated_value) và «Giá trị kỳ vọng» (× xác suất %)
--       chỉ cộng các stage được tick.
--   - NẾU không có stage nào set → fallback hành vi cũ
--     (loại cột Thua / Thắng / Hoàn thành DT).
-- Idempotent.

BEGIN;

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS counts_as_expected_revenue BOOLEAN;

COMMENT ON COLUMN crm_pipeline_stages.counts_as_expected_revenue IS
  'Khi TRUE: cộng vào ô "Giá trị dự kiến" và "Giá trị kỳ vọng" trên CRM dashboard. NULL/FALSE = không cộng. Nếu không stage nào set, dashboard fallback loại Thua/Thắng/Hoàn thành DT.';

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_counts_as_expected_revenue
  ON crm_pipeline_stages (pipeline_id)
  WHERE counts_as_expected_revenue = TRUE;

COMMIT;
