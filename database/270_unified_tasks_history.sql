-- 270_unified_tasks_history.sql
-- Bảng lịch sử thống nhất + VIEW unified_tasks_v + trigger ghi log tự động.
-- Idempotent — chạy nhiều lần an toàn.

BEGIN;

-- ─── 1. Enum nguồn nhiệm vụ ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unified_task_source') THEN
    CREATE TYPE unified_task_source AS ENUM ('task', 'crm_task', 'crm_assignment');
  END IF;
END $$;

-- ─── 2. Bảng lịch sử ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unified_task_history (
  id              BIGSERIAL PRIMARY KEY,
  source          unified_task_source NOT NULL,
  source_id       TEXT NOT NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,
  field_name      TEXT,
  old_value       JSONB,
  new_value       JSONB,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unified_task_history_source
  ON unified_task_history (source, source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_unified_task_history_project
  ON unified_task_history (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unified_task_history_lead
  ON unified_task_history (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unified_task_history_actor
  ON unified_task_history (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

COMMENT ON TABLE unified_task_history IS
  'Audit trail thống nhất cho mọi nhiệm vụ (tasks, crm_tasks, crm_assignments).';

ALTER TABLE unified_task_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'unified_task_history'
      AND policyname = 'unified_task_history_all'
  ) THEN
    EXECUTE 'CREATE POLICY unified_task_history_all ON unified_task_history FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ─── 3. Helper ghi log ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_unified_task_history_insert(
  p_source        unified_task_source,
  p_source_id     TEXT,
  p_project_id    UUID,
  p_lead_id       UUID,
  p_company_id    UUID,
  p_actor_user_id UUID,
  p_event_type    TEXT,
  p_field_name    TEXT DEFAULT NULL,
  p_old_value     JSONB DEFAULT NULL,
  p_new_value     JSONB DEFAULT NULL,
  p_description   TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO unified_task_history (
    source, source_id, project_id, lead_id, company_id,
    actor_user_id, event_type, field_name, old_value, new_value, description
  ) VALUES (
    p_source, p_source_id, p_project_id, p_lead_id, p_company_id,
    p_actor_user_id, p_event_type, p_field_name, p_old_value, p_new_value, p_description
  );
END;
$$;

-- ─── 4. VIEW thống nhất ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW unified_tasks_v AS

-- tasks (Công việc / SX / VC / cá nhân)
SELECT
  ('task:' || t.id::text)                    AS unified_id,
  'task'::unified_task_source                AS source,
  t.id::text                                 AS source_id,
  t.project_id,
  cl.id                                      AS lead_id,
  COALESCE(p.company_id, cl.company_id)      AS company_id,
  t.title,
  t.description,
  t.status::text                             AS status,
  t.priority::text                           AS priority,
  t.assignee_id,
  t.due_date                                 AS deadline,
  t.completed_at,
  t.created_by_id,
  t.created_at,
  t.updated_at,
  CASE
    WHEN COALESCE(t.task_type, 'project') = 'personal' OR t.project_id IS NULL THEN 'Cá nhân'
    WHEN p.production_person_id IS NOT NULL OR t.production_stage_id IS NOT NULL THEN 'SX'
    WHEN p.vc_kanban_column_id IS NOT NULL OR p.logistics_company_id IS NOT NULL THEN 'VC'
    ELSE 'Dự án'
  END                                        AS task_kind,
  p.code                                     AS project_code,
  p.name                                     AS project_name,
  cl.title                                   AS lead_title
FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id
LEFT JOIN crm_leads cl ON cl.project_id = t.project_id

UNION ALL

-- crm_tasks (Lead / Deal)
SELECT
  ('crm_task:' || ct.id::text),
  'crm_task'::unified_task_source,
  ct.id::text,
  cl.project_id,
  ct.lead_id,
  cl.company_id,
  ct.title,
  ct.description,
  ct.status,
  ct.priority,
  ct.assignee_id,
  ct.deadline,
  ct.completed_at,
  ct.created_by,
  ct.created_at,
  ct.updated_at,
  CASE
    WHEN cl.project_id IS NOT NULL OR COALESCE(ps.is_won, false) THEN 'CRM-Deal'
    WHEN COALESCE(ps.pipeline_type, 'lead') = 'deal' THEN 'CRM-Deal'
    ELSE 'CRM-Lead'
  END,
  p.code,
  p.name,
  cl.title
FROM crm_tasks ct
JOIN crm_leads cl ON cl.id = ct.lead_id
LEFT JOIN crm_pipeline_stages ps ON ps.id = cl.stage_id
LEFT JOIN projects p ON p.id = cl.project_id

UNION ALL

-- crm_assignments (Giao việc CRM Kanban)
SELECT
  ('crm_assignment:' || ca.id::text),
  'crm_assignment'::unified_task_source,
  ca.id::text,
  NULL::uuid,
  NULL::uuid,
  ca.company_id,
  ca.title,
  ca.description,
  ca.status::text,
  ca.priority::text,
  ca.assignee_id,
  ca.deadline,
  ca.completed_at,
  ca.created_by_id,
  ca.created_at,
  ca.updated_at,
  'Giao việc',
  NULL,
  NULL,
  NULL
FROM crm_assignments ca;

COMMENT ON VIEW unified_tasks_v IS
  'UNION ALL 3 nguồn nhiệm vụ — dùng cho API /api/work-tasks list/filter.';

-- ─── 5. Trigger: tasks ───────────────────────────────────────────────────────
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

  -- UPDATE whitelist fields
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
      OLD.status::text || ' → ' || NEW.status::text
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

DROP TRIGGER IF EXISTS trg_unified_task_history_tasks ON tasks;
CREATE TRIGGER trg_unified_task_history_tasks
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION trg_unified_task_history_tasks();

-- ─── 6. Trigger: crm_tasks ───────────────────────────────────────────────────
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

DROP TRIGGER IF EXISTS trg_unified_task_history_crm_tasks ON crm_tasks;
CREATE TRIGGER trg_unified_task_history_crm_tasks
  AFTER INSERT OR UPDATE OR DELETE ON crm_tasks
  FOR EACH ROW EXECUTE FUNCTION trg_unified_task_history_crm_tasks();

-- ─── 7. Trigger: crm_assignments ─────────────────────────────────────────────
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
      OLD.status::text || ' → ' || NEW.status::text
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

DROP TRIGGER IF EXISTS trg_unified_task_history_crm_assignments ON crm_assignments;
CREATE TRIGGER trg_unified_task_history_crm_assignments
  AFTER INSERT OR UPDATE OR DELETE ON crm_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_unified_task_history_crm_assignments();

-- ─── 8. Trigger comment: task_comments ───────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_unified_task_history_task_comments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_id UUID;
  v_lead_id UUID;
  v_company_id UUID;
BEGIN
  SELECT t.project_id, cl.id, COALESCE(p.company_id, cl.company_id)
    INTO v_project_id, v_lead_id, v_company_id
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN crm_leads cl ON cl.project_id = t.project_id
    WHERE t.id = NEW.task_id;

  PERFORM fn_unified_task_history_insert(
    'task', NEW.task_id::text, v_project_id, v_lead_id, v_company_id,
    NEW.user_id, 'comment_added', 'comment',
    NULL, jsonb_build_object('content', left(NEW.content, 500)),
    'Thêm bình luận'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unified_task_history_task_comments ON task_comments;
CREATE TRIGGER trg_unified_task_history_task_comments
  AFTER INSERT ON task_comments
  FOR EACH ROW EXECUTE FUNCTION trg_unified_task_history_task_comments();

-- ─── 9. Trigger comment: crm_assignment_comments ─────────────────────────────
CREATE OR REPLACE FUNCTION trg_unified_task_history_crm_assignment_comments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM crm_assignments WHERE id = NEW.assignment_id;

  PERFORM fn_unified_task_history_insert(
    'crm_assignment', NEW.assignment_id::text, NULL, NULL, v_company_id,
    NEW.user_id, 'comment_added', 'comment',
    NULL, jsonb_build_object('content', left(NEW.content, 500)),
    'Thêm bình luận giao việc'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unified_task_history_crm_assignment_comments ON crm_assignment_comments;
CREATE TRIGGER trg_unified_task_history_crm_assignment_comments
  AFTER INSERT ON crm_assignment_comments
  FOR EACH ROW EXECUTE FUNCTION trg_unified_task_history_crm_assignment_comments();

COMMIT;
