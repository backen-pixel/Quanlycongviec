-- Migration 423: projects.sx_kanban_column_id (đối xứng vc_kanban_column_id)
-- Backend (handover-vc, management, kanban) đã select/update cột này nhưng chưa có trên DB
-- → PATCH /production/projects/:id/handover-vc trả 404 "Project not found" giả.
-- Idempotent — chạy lại an toàn.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sx_kanban_column_id UUID;

COMMENT ON COLUMN projects.sx_kanban_column_id IS
  'Cột Kanban SX (production_pipeline_stages.id) — cập nhật khi kéo thẻ / bàn giao VC; nguồn dự phòng: crm_leads.sx_pipeline_stage_id';

-- Dọn giá trị orphan trước khi gắn FK
UPDATE projects
SET sx_kanban_column_id = NULL
WHERE sx_kanban_column_id IS NOT NULL
  AND sx_kanban_column_id NOT IN (SELECT id FROM production_pipeline_stages);

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_sx_kanban_column_id_fkey;
ALTER TABLE projects
  ADD CONSTRAINT projects_sx_kanban_column_id_fkey
  FOREIGN KEY (sx_kanban_column_id)
  REFERENCES production_pipeline_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_sx_kanban_column_id
  ON projects(sx_kanban_column_id)
  WHERE sx_kanban_column_id IS NOT NULL;

-- Backfill từ deal CRM (ưu tiên deal có sx_pipeline_stage_id mới nhất)
UPDATE projects p
SET sx_kanban_column_id = src.sx_pipeline_stage_id
FROM (
  SELECT DISTINCT ON (project_id)
    project_id,
    sx_pipeline_stage_id
  FROM crm_leads
  WHERE type = 'deal'
    AND project_id IS NOT NULL
    AND sx_pipeline_stage_id IS NOT NULL
  ORDER BY project_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
) src
WHERE p.id = src.project_id
  AND p.sx_kanban_column_id IS NULL
  AND EXISTS (
    SELECT 1 FROM production_pipeline_stages pps
    WHERE pps.id = src.sx_pipeline_stage_id
  );
