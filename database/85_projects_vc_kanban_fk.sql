-- Migration 85: FK cho projects.vc_kanban_column_id → logistics_pipeline_stages
-- Cho phép Supabase join vc_stage:logistics_pipeline_stages(...) trong production queries
-- Script an toàn — có thể chạy nhiều lần.

-- Đảm bảo cột tồn tại
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS vc_kanban_column_id UUID;

-- Làm sạch dữ liệu rác (trỏ đến ID không tồn tại)
UPDATE projects
SET vc_kanban_column_id = NULL
WHERE vc_kanban_column_id IS NOT NULL
  AND vc_kanban_column_id NOT IN (SELECT id FROM logistics_pipeline_stages);

-- Thêm FK constraint (nếu chưa có)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'projects_vc_kanban_column_id_fkey'
      AND table_name = 'projects'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_vc_kanban_column_id_fkey
      FOREIGN KEY (vc_kanban_column_id)
      REFERENCES logistics_pipeline_stages(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_projects_vc_kanban_column_id
  ON projects(vc_kanban_column_id);
