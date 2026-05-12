-- 158: Tắt toàn bộ thông báo của module "Quản lý công việc" (Dự án) cho tất cả user.
-- Bao trùm: project_assigned/updated/stage_changed, project_pipeline_deadline_*,
-- mọi notification có entity_type='project' hoặc metadata.ecosystem_module_key='projects',
-- mọi task_*/comment_added/checklist_completed có metadata.project_id, và task_created.

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS project_notifications BOOLEAN DEFAULT false;

COMMENT ON COLUMN notification_preferences.project_notifications IS
  'Bật/tắt mọi thông báo của module Dự án (Quản lý công việc): giai đoạn dự án, task/bình luận trong dự án, nhắc hạn task giai đoạn DA. Mặc định tắt.';

-- Đảm bảo TẤT CẢ user hiện hữu đều tắt module Dự án (kể cả đã set true trước đây).
UPDATE notification_preferences
SET project_notifications = false
WHERE project_notifications IS DISTINCT FROM false;
