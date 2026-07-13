-- 424: Cờ "Cột nhận Lead khi Trả về Lead" cho từng cột pipeline Lead.
-- Khi bật trên một cột lead: chức năng "Trả về Lead" (revert deal -> lead) sẽ đưa
-- deal về đúng cột đó, thay vì luôn lấy cột lead đầu tiên theo order_index.
-- Nếu không cột lead nào của pipeline bật cờ này, backend fallback về cột lead
-- đầu tiên (order_index nhỏ nhất) như hành vi cũ.

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS is_revert_to_lead_target BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_pipeline_stages.is_revert_to_lead_target IS
  'Khi true (chỉ áp dụng cột lead): là cột đích khi "Trả về Lead" một deal của cùng pipeline. Nên chỉ bật 1 cột lead / pipeline.';
