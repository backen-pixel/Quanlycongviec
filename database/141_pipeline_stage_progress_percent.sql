-- Migration 141: Thêm % tiến độ theo cột pipeline (SX + VC/LĐ)
-- Mục tiêu: hiển thị % hoàn thành theo cấu hình cột (không dựa vào % task done).

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS progress_percent INT;

ALTER TABLE logistics_pipeline_stages
  ADD COLUMN IF NOT EXISTS progress_percent INT;

COMMENT ON COLUMN production_pipeline_stages.progress_percent IS
  'Tiến độ % theo cột (0-100) để hiển thị trên thẻ Sản xuất. NULL = không áp dụng.';

COMMENT ON COLUMN logistics_pipeline_stages.progress_percent IS
  'Tiến độ % theo cột (0-100) để hiển thị trên thẻ Vận chuyển/Lắp đặt. NULL = không áp dụng.';

