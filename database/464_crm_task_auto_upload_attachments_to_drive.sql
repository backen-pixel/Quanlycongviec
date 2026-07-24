-- 464: Cờ tự động đẩy file đính kèm ghi chú nhiệm vụ CRM lên Drive
--      (cấu hình ở bộ mẫu → kế thừa xuống crm_tasks khi gen / tạo từ mẫu).
-- Idempotent.

BEGIN;

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS auto_upload_attachments_to_drive BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_task_template_items.auto_upload_attachments_to_drive IS
  'True: nhiệm vụ sinh từ mẫu này sẽ tự đẩy file upload vào ghi chú/đính kèm lên Drive của lead/deal.';

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS auto_upload_attachments_to_drive BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_tasks.auto_upload_attachments_to_drive IS
  'Khi bật: file nhân viên upload vào ghi chú/đính kèm nhiệm vụ tự động tải lên Drive entity (lead/deal). Có thể bật/tắt ở modal sửa NV hoặc kế thừa từ mẫu.';

ALTER TABLE crm_task_attachments
  ADD COLUMN IF NOT EXISTS source_drive_file_id UUID REFERENCES drive_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_task_att_source_drive
  ON crm_task_attachments(source_drive_file_id)
  WHERE source_drive_file_id IS NOT NULL;

COMMENT ON COLUMN crm_task_attachments.source_drive_file_id IS
  'File Drive đã mirror từ đính kèm nhiệm vụ (khi auto_upload_attachments_to_drive = true).';

COMMIT;
