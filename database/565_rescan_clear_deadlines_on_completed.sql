-- 565: Quét lại dự án / deal đã hoàn thành — tắt deadline còn sót.
-- SX: cột Đã công / Đã thu. CRM: cột hoàn thành. VC: bucket completed.

WITH sx_done AS (
  SELECT id FROM production_pipeline_stages
  WHERE counts_as_completed_revenue IS TRUE OR counts_as_collected_revenue IS TRUE
),
sx_projects AS (
  SELECT DISTINCT p.id
  FROM projects p
  WHERE p.status = 'completed'
     OR p.sx_kanban_column_id IN (SELECT id FROM sx_done)
     OR EXISTS (
       SELECT 1 FROM crm_leads l
       WHERE l.project_id = p.id AND l.type = 'deal'
         AND l.sx_pipeline_stage_id IN (SELECT id FROM sx_done)
     )
),
upd_sx_projects AS (
  UPDATE projects p
  SET
    sx_kanban_deadline_at = NULL,
    sx_kanban_deadline_reason = NULL,
    production_deadline = NULL,
    design_deadline = NULL,
    delivery_date = NULL,
    deadline = NULL,
    updated_at = NOW()
  FROM sx_projects t
  WHERE p.id = t.id
    AND (
      p.sx_kanban_deadline_at IS NOT NULL
      OR p.sx_kanban_deadline_reason IS NOT NULL
      OR p.production_deadline IS NOT NULL
      OR p.design_deadline IS NOT NULL
      OR p.delivery_date IS NOT NULL
      OR p.deadline IS NOT NULL
    )
  RETURNING p.id
),
upd_sx_leads AS (
  UPDATE crm_leads l
  SET
    kanban_deadline_at = NULL,
    kanban_deadline_reason = NULL,
    updated_at = NOW()
  WHERE l.type = 'deal'
    AND l.project_id IN (SELECT id FROM sx_projects)
    AND (l.kanban_deadline_at IS NOT NULL OR l.kanban_deadline_reason IS NOT NULL)
  RETURNING l.id
),
upd_sx_crm_tasks AS (
  UPDATE crm_tasks ct
  SET deadline = NULL, updated_at = NOW()
  WHERE ct.deadline IS NOT NULL
    AND ct.stage_slug LIKE 'sx_%'
    AND ct.lead_id IN (
      SELECT l.id FROM crm_leads l
      WHERE l.type = 'deal' AND l.project_id IN (SELECT id FROM sx_projects)
    )
  RETURNING ct.id
),
upd_sx_tasks AS (
  UPDATE tasks t
  SET due_date = NULL, updated_at = NOW()
  WHERE t.project_id IN (SELECT id FROM sx_projects)
    AND t.due_date IS NOT NULL
  RETURNING t.id
),
crm_done AS (
  SELECT id FROM crm_pipeline_stages
  WHERE counts_as_completed_revenue IS TRUE
     OR lower(coalesce(canonical_slug, '')) IN ('completed', 'done')
),
crm_done_leads AS (
  SELECT l.id FROM crm_leads l
  WHERE l.stage_id IN (SELECT id FROM crm_done)
),
upd_crm_leads AS (
  UPDATE crm_leads l
  SET
    kanban_deadline_at = NULL,
    kanban_deadline_reason = NULL,
    expected_close_date = NULL,
    next_follow_up = NULL,
    updated_at = NOW()
  WHERE l.id IN (SELECT id FROM crm_done_leads)
    AND (
      l.kanban_deadline_at IS NOT NULL
      OR l.kanban_deadline_reason IS NOT NULL
      OR l.expected_close_date IS NOT NULL
      OR l.next_follow_up IS NOT NULL
    )
  RETURNING l.id
),
upd_crm_tasks AS (
  UPDATE crm_tasks ct
  SET deadline = NULL, updated_at = NOW()
  WHERE ct.deadline IS NOT NULL
    AND ct.lead_id IN (SELECT id FROM crm_done_leads)
  RETURNING ct.id
),
vc_done AS (
  SELECT id FROM logistics_pipeline_stages
  WHERE lower(coalesce(bucket_slug, '')) IN ('completed', 'done', 'install_completed')
),
upd_vc_projects AS (
  UPDATE projects p
  SET deadline = NULL, updated_at = NOW()
  WHERE p.vc_kanban_column_id IN (SELECT id FROM vc_done)
    AND p.deadline IS NOT NULL
  RETURNING p.id
)
SELECT
  (SELECT count(*) FROM upd_sx_projects) AS sx_projects_cleared,
  (SELECT count(*) FROM upd_sx_leads) AS sx_leads_cleared,
  (SELECT count(*) FROM upd_sx_crm_tasks) AS sx_crm_tasks_cleared,
  (SELECT count(*) FROM upd_sx_tasks) AS workshop_tasks_cleared,
  (SELECT count(*) FROM upd_crm_leads) AS crm_leads_cleared,
  (SELECT count(*) FROM upd_crm_tasks) AS crm_tasks_cleared,
  (SELECT count(*) FROM upd_vc_projects) AS vc_projects_cleared;
