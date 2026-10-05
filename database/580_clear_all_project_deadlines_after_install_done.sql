-- 580: Lắp xong là mốc hoàn thành toàn dự án.
-- Tắt deadline CRM + SX + VC/LĐ, nhưng giữ ngày giao/ngày lắp làm lịch sử vận hành.

CREATE OR REPLACE FUNCTION public.clear_all_project_deadlines_after_install_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_install_done boolean := false;
BEGIN
  v_install_done := NEW.status::text = 'completed'
    OR EXISTS (
      SELECT 1
      FROM public.logistics_pipeline_stages s
      WHERE s.id = NEW.vc_kanban_column_id
        AND (
          lower(coalesce(s.bucket_slug, '')) IN ('completed', 'done', 'install_completed')
          OR lower(coalesce(s.name, '')) LIKE 'hoàn thành%'
          OR lower(coalesce(s.name, '')) LIKE 'hoàn thiện%'
        )
    );

  IF NOT v_install_done THEN
    RETURN NEW;
  END IF;

  UPDATE public.projects
  SET deadline = NULL,
      production_deadline = NULL,
      design_deadline = NULL,
      sx_kanban_deadline_at = NULL,
      sx_kanban_deadline_reason = NULL,
      completed_date = CASE
        WHEN completed_date IS NOT NULL THEN completed_date
        WHEN OLD.status IS DISTINCT FROM NEW.status
          OR OLD.vc_kanban_column_id IS DISTINCT FROM NEW.vc_kanban_column_id
          THEN v_now
        ELSE coalesce(install_date, updated_at, v_now)
      END,
      updated_at = v_now
  WHERE id = NEW.id
    AND (
      deadline IS NOT NULL
      OR production_deadline IS NOT NULL
      OR design_deadline IS NOT NULL
      OR sx_kanban_deadline_at IS NOT NULL
      OR sx_kanban_deadline_reason IS NOT NULL
      OR completed_date IS NULL
    );

  UPDATE public.crm_leads
  SET kanban_deadline_at = NULL,
      kanban_deadline_reason = 'Tự tắt khi dự án đã lắp xong',
      expected_close_date = NULL,
      next_follow_up = NULL,
      deadline_disabled_at = v_now,
      deadline_disabled_reason = 'Dự án đã lắp xong',
      deadline_disabled_by = NULL,
      updated_at = v_now
  WHERE type = 'deal'
    AND project_id = NEW.id;

  UPDATE public.crm_tasks
  SET deadline = NULL,
      updated_at = v_now
  WHERE deadline IS NOT NULL
    AND lead_id IN (
      SELECT id
      FROM public.crm_leads
      WHERE type = 'deal' AND project_id = NEW.id
    );

  UPDATE public.crm_assignments
  SET deadline = NULL,
      updated_at = v_now
  WHERE deadline IS NOT NULL
    AND (
      lead_id IN (
        SELECT id
        FROM public.crm_leads
        WHERE type = 'deal' AND project_id = NEW.id
      )
      OR crm_task_id IN (
        SELECT t.id
        FROM public.crm_tasks t
        JOIN public.crm_leads l ON l.id = t.lead_id
        WHERE l.type = 'deal' AND l.project_id = NEW.id
      )
    );

  UPDATE public.tasks
  SET due_date = NULL,
      updated_at = v_now
  WHERE project_id = NEW.id
    AND due_date IS NOT NULL;

  UPDATE public.app_module_tasks
  SET deadline = NULL,
      updated_at = v_now
  WHERE deadline IS NOT NULL
    AND record_id IN (
      SELECT r.id
      FROM public.app_module_records r
      JOIN public.crm_leads l ON l.id = r.source_crm_lead_id
      WHERE l.type = 'deal' AND l.project_id = NEW.id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_all_project_deadlines_after_install_done
  ON public.projects;

CREATE TRIGGER trg_clear_all_project_deadlines_after_install_done
AFTER UPDATE OF status, vc_kanban_column_id
ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.clear_all_project_deadlines_after_install_done();

-- Backfill các dự án đã lắp xong trước khi có trigger.
UPDATE public.projects p
SET status = p.status
WHERE p.status::text = 'completed'
   OR EXISTS (
     SELECT 1
     FROM public.logistics_pipeline_stages s
     WHERE s.id = p.vc_kanban_column_id
       AND (
         lower(coalesce(s.bucket_slug, '')) IN ('completed', 'done', 'install_completed')
         OR lower(coalesce(s.name, '')) LIKE 'hoàn thành%'
         OR lower(coalesce(s.name, '')) LIKE 'hoàn thiện%'
       )
   );

COMMENT ON FUNCTION public.clear_all_project_deadlines_after_install_done() IS
  'Tự tắt mọi deadline CRM/SX/VC-LĐ khi dự án hoàn tất lắp đặt; giữ ngày giao và ngày lắp làm lịch sử.';
