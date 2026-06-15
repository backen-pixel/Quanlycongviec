-- 352: Cờ "Cho phép trả Deal về Lead" cho từng cột pipeline deal.
-- Khi bật trên cột deal: thẻ deal đang ở cột đó mới hiện nút "Trả về Lead" (ở
-- chi tiết và cột Danh sách), endpoint backend cũng kiểm tra cờ này.
-- Lead/stage không deal: cờ vô nghĩa nhưng vẫn lưu để đơn giản hóa whitelist.

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS allow_revert_to_lead BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_pipeline_stages.allow_revert_to_lead IS
  'Khi true (chỉ áp dụng cột deal): cho phép trả deal đang ở cột này về Lead.';
