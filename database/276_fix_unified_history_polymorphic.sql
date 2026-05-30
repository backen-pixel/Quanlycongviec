-- 276_fix_unified_history_polymorphic.sql
-- Fix lỗi PostgreSQL "could not determine polymorphic type because input has type unknown"
-- khi tick HOÀN THÀNH nhiệm vụ ở Lead/Deal (CRM) hoặc Công việc (SX/VC).
--
-- Nguyên nhân: trigger ghi audit `unified_task_history` dùng to_jsonb('completed')
-- với chuỗi literal chưa cast type (introduced in 270_unified_tasks_history.sql).
-- PostgreSQL không suy ra được kiểu cho hàm `to_jsonb(anyelement)` → trigger raise,
-- request UPDATE crm_tasks/crm_assignments/tasks bị 500.
--
-- Fix: cast tất cả status literal về ::text trước khi to_jsonb.
-- Idempotent: CREATE OR REPLACE FUNCTION (không drop trigger, không mất history).

BEGIN;

-- ─── Trigger: tasks (Công việc / SX / VC / cá nhân) ───────────────────────────
CREATE OR REPLACE FUNCTION trg_unified_task_history_tasks()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_id UUID;
  v_company_id UUID;
  v_actor UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT cl.id, COALESCE(p.company_id, cl.company_id)
      INTO v_lead_id, v_company_id
      FROM projects p
      LEFT JOIN crm_leads cl ON cl.project_id = p.id
      WHERE p.id = NEW.project_id
      LIMIT 1;
    v_actor := NEW.created_by_id;
    PERFORM fn_unified_task_history_insert(
      'task', NEW.id::text, NEW.project_id, v_lead_id, v_company_id,
      v_actor, 'created', NULL, NULL,
      jsonb_build_object('title', NEW.title, 'status', NEW.status),
      'Tạo nhiệm vụ: ' || COALESCE(NEW.title, '')
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT cl.id, COALESCE(p.company_id, cl.company_id)
      INTO v_lead_id, v_company_id
      FROM projects p
      LEFT JOIN crm_leads cl ON cl.project_id = p.id
      WHERE p.id = OLD.project_id
      LIMIT 1;
    PERFORM fn_unified_task_history_insert(
      'task', OLD.id::text, OLD.project_id, v_lead_id, v_company_id,
      NULL, 'deleted', NULL,
      jsonb_build_object('title', OLD.title, 'status', OLD.status),
      NULL, 'Xóa nhiệm vụ: ' || COALESCE(OLD.title, '')
    );
    RETURN OLD;
  END IF;

  SELECT cl.id, COALESCE(p.company_id, cl.company_id)
    INTO v_lead_id, v_company_id
    FROM projects p
    LEFT JOIN crm_leads cl ON cl.project_id = p.id
    WHERE p.id = NEW.project_id
    LIMIT 1;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM fn_unified_task_history_insert(
      'task', NEW.id::text, NEW.project_id, v_lead_id, v_company_id,
      NULL, 'status_changed', 'status',
      to_jsonb(OLD.status::text), to_jsonb(NEW.status::text),
      COALESCE(OLD.status::text, '') || ' → ' || COALESCE(NEW.status::text, '')
    );
    IF NEW.status = 'done' THEN
      PERFORM fn_unified_task_history_insert(
        'task', NEW.id::text, NEW.project_id, v_lead_id, v_company_id,
        NULL, 'completed', 'status', to_jsonb(OLD.status::text), to_jsonb('done'::text),
        'Hoàn thành nhiệm vụ'
      );
    ELSIF NEW.status = 'blocked' THEN
      PERFORM fn_unified_task_history_insert(
        'task', NEW.id::text, NEW.project_id, v_lead_id, v_company_id,
        NULL, 'blocked', 'status', to_jsonb(OLD.status::text), to_jsonb('blocked'::text),
        'Nhiệm vụ bị chặn'
      );
    END IF;
  END IF;

  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    PERFORM fn_unified_task_history_insert(
      'task', NEW.id::text, NEW.project_id, v_lead_id, v_company_id,
      NULL, 'assignee_changed', 'assignee_id',
      to_jsonb(OLD.assignee_id::text), to_jsonb(NEW.assignee_id::text),
      'Đổi người phụ trách'
    );
  END IF;

  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    PERFORM fn_unified_task_history_insert(
      'task', NEW.id::text, NEW.project_id, v_lead_id, v_company_id,
      NULL, 'deadline_changed', 'due_date',
      to_jsonb(OLD.due_date), to_jsonb(NEW.due_date),
      'Đổi hạn hoàn thành'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Trigger: crm_tasks (Nhiệm vụ Lead/Deal) ──────────────────────────────────
CREATE OR REPLACE FUNCTION trg_unified_task_history_crm_tasks()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_id UUID;
  v_company_id UUID;
BEGIN
  SELECT cl.project_id, cl.company_id
    INTO v_project_id, v_company_id
    FROM crm_leads cl WHERE cl.id = COALESCE(NEW.lead_id, OLD.lead_id);

  IF TG_OP = 'INSERT' THEN
    PERFORM fn_unified_task_history_insert(
      'crm_task', NEW.id::text, v_project_id, NEW.lead_id, v_company_id,
      NEW.created_by, 'created', NULL, NULL,
      jsonb_build_object('title', NEW.title, 'status', NEW.status),
      'Tạo nhiệm vụ CRM: ' || COALESCE(NEW.title, '')
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM fn_unified_task_history_insert(
      'crm_task', OLD.id::text, v_project_id, OLD.lead_id, v_company_id,
      NULL, 'deleted', NULL,
      jsonb_build_object('title', OLD.title, 'status', OLD.status),
      NULL, 'Xóa nhiệm vụ CRM: ' || COALESCE(OLD.title, '')
    );
    RETURN OLD;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM fn_unified_task_history_insert(
      'crm_task', NEW.id::text, v_project_id, NEW.lead_id, v_company_id,
      NULL, 'status_changed', 'status',
      to_jsonb(OLD.status::text), to_jsonb(NEW.status::text),
      COALESCE(OLD.status::text, '') || ' → ' || COALESCE(NEW.status::text, '')
    );
    IF NEW.status = 'completed' THEN
      PERFORM fn_unified_task_history_insert(
        'crm_task', NEW.id::text, v_project_id, NEW.lead_id, v_company_id,
        NULL, 'completed', 'status', to_jsonb(OLD.status::text), to_jsonb('completed'::text),
        'Hoàn thành nhiệm vụ CRM'
      );
    END IF;
  END IF;

  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    PERFORM fn_unified_task_history_insert(
      'crm_task', NEW.id::text, v_project_id, NEW.lead_id, v_company_id,
      NULL, 'assignee_changed', 'assignee_id',
      to_jsonb(OLD.assignee_id::text), to_jsonb(NEW.assignee_id::text),
      'Đổi người phụ trách CRM'
    );
  END IF;

  IF OLD.deadline IS DISTINCT FROM NEW.deadline THEN
    PERFORM fn_unified_task_history_insert(
      'crm_task', NEW.id::text, v_project_id, NEW.lead_id, v_company_id,
      NULL, 'deadline_changed', 'deadline',
      to_jsonb(OLD.deadline), to_jsonb(NEW.deadline),
      'Đổi deadline CRM'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Trigger: crm_assignments (Giao việc CRM) ────────────────────────────────
CREATE OR REPLACE FUNCTION trg_unified_task_history_crm_assignments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM fn_unified_task_history_insert(
      'crm_assignment', NEW.id::text, NULL, NULL, NEW.company_id,
      NEW.created_by_id, 'created', NULL, NULL,
      jsonb_build_object('title', NEW.title, 'status', NEW.status::text),
      'Tạo giao việc CRM: ' || COALESCE(NEW.title, '')
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM fn_unified_task_history_insert(
      'crm_assignment', OLD.id::text, NULL, NULL, OLD.company_id,
      NULL, 'deleted', NULL,
      jsonb_build_object('title', OLD.title, 'status', OLD.status::text),
      NULL, 'Xóa giao việc CRM: ' || COALESCE(OLD.title, '')
    );
    RETURN OLD;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM fn_unified_task_history_insert(
      'crm_assignment', NEW.id::text, NULL, NULL, NEW.company_id,
      NULL, 'status_changed', 'status',
      to_jsonb(OLD.status::text), to_jsonb(NEW.status::text),
      COALESCE(OLD.status::text, '') || ' → ' || COALESCE(NEW.status::text, '')
    );
    IF NEW.status = 'completed' THEN
      PERFORM fn_unified_task_history_insert(
        'crm_assignment', NEW.id::text, NULL, NULL, NEW.company_id,
        NULL, 'completed', 'status', to_jsonb(OLD.status::text), to_jsonb('completed'::text),
        'Hoàn thành giao việc CRM'
      );
    END IF;
  END IF;

  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    PERFORM fn_unified_task_history_insert(
      'crm_assignment', NEW.id::text, NULL, NULL, NEW.company_id,
      NULL, 'assignee_changed', 'assignee_id',
      to_jsonb(OLD.assignee_id::text), to_jsonb(NEW.assignee_id::text),
      'Đổi người giao việc'
    );
  END IF;

  IF OLD.deadline IS DISTINCT FROM NEW.deadline THEN
    PERFORM fn_unified_task_history_insert(
      'crm_assignment', NEW.id::text, NULL, NULL, NEW.company_id,
      NULL, 'deadline_changed', 'deadline',
      to_jsonb(OLD.deadline), to_jsonb(NEW.deadline),
      'Đổi deadline giao việc'
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
