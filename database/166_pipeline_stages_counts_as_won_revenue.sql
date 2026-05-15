-- 166_pipeline_stages_counts_as_won_revenue.sql
-- Thêm cờ riêng cho "Doanh thu thắng" trên Kanban CRM dashboard.
-- Mục đích:
--   * `is_won` là cờ định nghĩa "Cột Thắng" trong pipeline (mỗi pipeline thường chỉ 1).
--   * Tuy nhiên doanh nghiệp có thể muốn cộng dồn doanh thu của nhiều cột (ví dụ
--     "Đã ký HĐ", "Đặt cọc", "Đang triển khai") vào ô "Doanh thu thắng" ở dashboard
--     mà không muốn coi các cột đó là "Cột Thắng" duy nhất.
--   * Thêm cột `counts_as_won_revenue` (BOOLEAN, mặc định NULL) cho phép tick riêng.
--
-- Quy ước đọc dữ liệu:
--   - NẾU trên pipeline có ÍT NHẤT một stage `counts_as_won_revenue = true`
--     → ô "Doanh thu thắng" cộng các stage có cờ này.
--   - NẾU không có stage nào set → fallback dùng `is_won` (hành vi cũ).
-- Idempotent.

BEGIN;

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS counts_as_won_revenue BOOLEAN;

COMMENT ON COLUMN crm_pipeline_stages.counts_as_won_revenue IS
  'Khi TRUE: cộng vào ô "Doanh thu thắng" trên CRM dashboard. NULL/FALSE = không cộng. Nếu không stage nào set, dashboard fallback dùng is_won.';

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_counts_as_won_revenue
  ON crm_pipeline_stages (pipeline_id)
  WHERE counts_as_won_revenue = TRUE;

COMMIT;
