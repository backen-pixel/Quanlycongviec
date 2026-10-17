-- 724: Cột pipeline SX «Đóng hết việc» — kéo thẻ vào cột thì tích hoàn thành mọi nhiệm vụ còn mở.
--
-- Khác với cột tick «Đã VC» (dashboard_kpi='shipped') vốn chỉ đóng nhiệm vụ từ cột đó TRỞ VỀ TRƯỚC:
-- cờ này đóng TẤT CẢ việc SX còn mở của đơn, kể cả việc ở các cột sau (chốt công nợ, thu tiền).
-- Chỉ bật cho cột CUỐI chuỗi, nơi nghiệp vụ coi như đơn đã xong hẳn.
ALTER TABLE public.production_pipeline_stages
  ADD COLUMN IF NOT EXISTS dong_het_viec BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.production_pipeline_stages.dong_het_viec IS
  'Khi true: chuyển dự án vào cột này sẽ tích hoàn thành mọi nhiệm vụ SX, việc giao và checklist còn mở của đơn. Dùng cho cột cuối chuỗi (CÔNG NỢ ĐÃ CHỐT, Đã thu tiền).';
