-- Tắt deadline SX cho dự án đang ở cột Đã công / Đã thu (Hoàn thành).
-- Khớp logic clearSxSchedulesOnCompletedForProjects khi kéo vào các cột này.

WITH done_cols AS (
  SELECT id FROM production_pipeline_stages
  WHERE counts_as_completed_revenue IS TRUE OR counts_as_collected_revenue IS TRUE
),
target_projects AS (
  SELECT DISTINCT p.id
  FROM projects p
  WHERE p.sx_kanban_column_id IN (SELECT id FROM done_cols)
     OR EXISTS (
       SELECT 1 FROM crm_leads l
       WHERE l.project_id = p.id AND l.type = 'deal'
         AND l.sx_pipeline_stage_id IN (SELECT id FROM done_cols)
     )
),
upd_projects AS (
  UPDATE projects p
  SET
    sx_kanban_deadline_at = NULL,
    sx_kanban_deadline_reason = NULL,
    production_deadline = NULL,
    delivery_date = NULL,
    deadline = NULL,
    updated_at = NOW()
  FROM target_projects t
  WHERE p.id = t.id
    AND (
      p.sx_kanban_deadline_at IS NOT NULL
      OR p.sx_kanban_deadline_reason IS NOT NULL
      OR p.production_deadline IS NOT NULL
      OR p.delivery_date IS NOT NULL
      OR p.deadline IS NOT NULL
    )
  RETURNING p.id
),
upd_leads AS (
  UPDATE crm_leads l
  SET
    kanban_deadline_at = NULL,
    kanban_deadline_reason = NULL,
    updated_at = NOW()
  WHERE l.type = 'deal'
    AND l.project_id IN (SELECT id FROM target_projects)
    AND (l.kanban_deadline_at IS NOT NULL OR l.kanban_deadline_reason IS NOT NULL)
  RETURNING l.id
),
upd_crm_tasks AS (
  UPDATE crm_tasks ct
  SET deadline = NULL, updated_at = NOW()
  WHERE ct.deadline IS NOT NULL
    AND ct.stage_slug LIKE 'sx_%'
    AND ct.lead_id IN (
      SELECT l.id FROM crm_leads l
      WHERE l.type = 'deal' AND l.project_id IN (SELECT id FROM target_projects)
    )
  RETURNING ct.id
),
upd_tasks AS (
  UPDATE tasks t
  SET due_date = NULL, updated_at = NOW()
  WHERE t.project_id IN (SELECT id FROM target_projects)
    AND t.due_date IS NOT NULL
  RETURNING t.id
)
SELECT
  (SELECT count(*) FROM upd_projects) AS projects_cleared,
  (SELECT count(*) FROM upd_leads) AS leads_cleared,
  (SELECT count(*) FROM upd_crm_tasks) AS sx_crm_tasks_cleared,
  (SELECT count(*) FROM upd_tasks) AS workshop_tasks_cleared;
