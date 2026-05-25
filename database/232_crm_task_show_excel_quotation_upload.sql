-- 232: Cờ bật/tắt nút "Upload Excel Báo giá" trên từng nhiệm vụ CRM
--      (cấu hình ở bộ mẫu → kế thừa xuống crm_tasks khi gen / tạo từ mẫu).
-- Idempotent.

BEGIN;

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS show_excel_quotation_upload BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_task_template_items.show_excel_quotation_upload IS
  'True: nhiệm vụ sinh từ mẫu này sẽ hiển thị nút "Upload Excel BG" trên tab Nhiệm vụ (CRMTasksTab).';

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS show_excel_quotation_upload BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_tasks.show_excel_quotation_upload IS
  'Hiển thị nút Upload Excel Báo giá trên nhiệm vụ. Mặc định kế thừa từ crm_task_template_items khi gen; có thể bật/tắt thủ công ở modal sửa NV.';

COMMIT;
