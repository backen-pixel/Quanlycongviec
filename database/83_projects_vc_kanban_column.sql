-- Migration 83: Thêm vc_kanban_column_id vào projects để track trực tiếp logistics_pipeline_stages
-- Chạy sau migration 81, 82. Script an toàn — có thể chạy nhiều lần.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS vc_kanban_column_id UUID;

COMMENT ON COLUMN projects.vc_kanban_column_id IS
  'Trỏ đến logistics_pipeline_stages.id — cập nhật khi project VC kéo sang cột mới trên Kanban';

CREATE INDEX IF NOT EXISTS idx_projects_vc_kanban_column_id
  ON projects(vc_kanban_column_id);
