-- Phạm vi chia sẻ theo module (SX / VC / Công việc dự án) cho đính kèm & hoạt động CRM
-- NULL khi đã bật chia sẻ = hiển thị cả ba module (tương thích dữ liệu cũ)

ALTER TABLE crm_task_attachments
  ADD COLUMN IF NOT EXISTS allowed_share_modules JSONB DEFAULT NULL;

COMMENT ON COLUMN crm_task_attachments.allowed_share_modules IS
  'Khi shared_to_project=true: giới hạn module production | logistics | workshop. NULL = cả ba.';

ALTER TABLE crm_activities
  ADD COLUMN IF NOT EXISTS allowed_share_modules JSONB DEFAULT NULL;

COMMENT ON COLUMN crm_activities.allowed_share_modules IS
  'Khi shared_to_workshop=true: giới hạn module production | logistics | workshop. NULL = cả ba.';

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS allowed_share_modules JSONB DEFAULT NULL;

COMMENT ON COLUMN crm_tasks.allowed_share_modules IS
  'Khi shared_to_project=true (ghi chú NV): giới hạn module production | logistics | workshop. NULL = cả ba.';
