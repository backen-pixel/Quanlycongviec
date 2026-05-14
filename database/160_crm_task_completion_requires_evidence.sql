-- 160: Bắt buộc minh chứng (file hoặc ghi chú) khi hoàn thành nhiệm vụ CRM — cấu hình trên mẫu + lưu trên task thực tế.
-- Idempotent.

BEGIN;

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS completion_requires_file_or_note BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_task_template_items.completion_requires_file_or_note IS
  'True: khi đánh dấu hoàn thành crm_tasks sinh từ mẫu, bắt buộc có ghi chú task hoặc đính kèm (file/ghi chú trên attachment).';

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS completion_requires_file_or_note BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_tasks.completion_requires_file_or_note IS
  'Kế thừa từ crm_task_template_items khi gen/tạo từ mẫu; áp dụng khi status → completed.';

COMMIT;
