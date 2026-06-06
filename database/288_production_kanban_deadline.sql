-- 288_production_kanban_deadline.sql
-- Deadline thủ công cho thẻ dự án Kanban Sản xuất (tách biệt deadline dự án / production_deadline / SLA cột).
--   * projects.sx_kanban_deadline_at         : hạn do người dùng đặt cho thẻ
--   * projects.sx_kanban_deadline_reason     : lý do lần đặt/sửa gần nhất
--   * production_pipeline_stages.requires_deadline : cột bắt buộc chọn deadline khi kéo thẻ tới
-- Idempotent: an toàn để chạy lại.

BEGIN;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sx_kanban_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sx_kanban_deadline_reason TEXT;

COMMENT ON COLUMN projects.sx_kanban_deadline_at IS
  'Hạn (deadline) do người dùng đặt cho thẻ Kanban SX. Khác deadline dự án / production_deadline và SLA cột.';
COMMENT ON COLUMN projects.sx_kanban_deadline_reason IS
  'Lý do lần đặt/sửa deadline thẻ SX gần nhất (snapshot).';

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS requires_deadline BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN production_pipeline_stages.requires_deadline IS
  'Khi true: kéo thẻ tới cột này bắt buộc hiện modal và chọn deadline mới.';

COMMIT;
