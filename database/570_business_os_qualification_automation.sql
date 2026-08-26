-- 570: Qualification task template + SLA escalation cho Business OS.
--
-- Phạm vi:
--   - Cấu hình theo company/process/stage, không bật hoặc seed đại trà tenant.
--   - Task sinh ra vẫn nằm trong crm_tasks (nguồn công việc duy nhất).
--   - Dấu vết nguồn + unique key bảo đảm gọi lặp không sinh task trùng.
--   - SLA escalation chỉ ghi sổ + notification nội bộ; delivery bên ngoài do
--     hệ thống thông báo hiện tại quyết định và không được gọi từ worker này.

BEGIN;

CREATE TABLE IF NOT EXISTS business_os_stage_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  name TEXT NOT NULL,
  sla_duration_minutes INT NOT NULL DEFAULT 960,
  sla_warning_minutes INT NOT NULL DEFAULT 240,
  escalate_at_risk_to_owner BOOLEAN NOT NULL DEFAULT true,
  escalate_overdue_to_owner BOOLEAN NOT NULL DEFAULT true,
  escalate_overdue_to_company_admins BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_os_stage_automations_scope_uq
    UNIQUE (company_id, process_key, stage_key),
  CONSTRAINT business_os_stage_automations_sla_ck
    CHECK (
      sla_duration_minutes BETWEEN 15 AND 43200
      AND sla_warning_minutes BETWEEN 0 AND sla_duration_minutes
    )
);

CREATE INDEX IF NOT EXISTS idx_business_os_stage_automations_company
  ON business_os_stage_automations (company_id, process_key, stage_key)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS business_os_stage_task_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES business_os_stage_automations(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  deadline_minutes INT NOT NULL DEFAULT 0,
  order_index INT NOT NULL DEFAULT 0,
  assignment_strategy TEXT NOT NULL DEFAULT 'record_owner',
  blocks_stage_advance BOOLEAN NOT NULL DEFAULT false,
  completion_requires_file_or_note BOOLEAN NOT NULL DEFAULT false,
  required_evidence_file_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_quick_verdict BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_os_stage_task_items_key_uq UNIQUE (automation_id, item_key),
  CONSTRAINT business_os_stage_task_items_key_ck CHECK (item_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  CONSTRAINT business_os_stage_task_items_priority_ck CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT business_os_stage_task_items_deadline_ck CHECK (deadline_minutes BETWEEN 0 AND 43200),
  CONSTRAINT business_os_stage_task_items_assignment_ck
    CHECK (assignment_strategy IN ('record_owner', 'actor', 'unassigned'))
);

CREATE INDEX IF NOT EXISTS idx_business_os_stage_task_items_active
  ON business_os_stage_task_template_items (automation_id, order_index, id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS business_os_stage_automation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES business_os_stage_automations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  version INT NOT NULL,
  automation_snapshot JSONB NOT NULL,
  task_items_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_type TEXT NOT NULL DEFAULT 'update',
  source_version INT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_os_stage_automation_versions_uq UNIQUE (automation_id, version)
);

CREATE INDEX IF NOT EXISTS idx_business_os_stage_automation_versions_scope
  ON business_os_stage_automation_versions (company_id, process_key, stage_key, version DESC);

CREATE TABLE IF NOT EXISTS business_os_sla_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_instance_id UUID NOT NULL REFERENCES business_os_process_instances(id) ON DELETE CASCADE,
  record_id UUID NOT NULL,
  level TEXT NOT NULL,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_os_sla_escalations_level_ck CHECK (level IN ('at_risk', 'overdue')),
  CONSTRAINT business_os_sla_escalations_dedupe_uq
    UNIQUE (process_instance_id, level, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_business_os_sla_escalations_company_time
  ON business_os_sla_escalations (company_id, created_at DESC);

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS business_os_process_key TEXT,
  ADD COLUMN IF NOT EXISTS business_os_stage_key TEXT,
  ADD COLUMN IF NOT EXISTS business_os_template_item_key TEXT,
  ADD COLUMN IF NOT EXISTS business_os_template_item_id UUID
    REFERENCES business_os_stage_task_template_items(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_tasks_business_os_template_source
  ON crm_tasks (
    lead_id,
    business_os_process_key,
    business_os_stage_key,
    business_os_template_item_key
  );

CREATE INDEX IF NOT EXISTS idx_crm_tasks_business_os_source
  ON crm_tasks (lead_id, business_os_process_key, business_os_stage_key)
  WHERE business_os_process_key IS NOT NULL;

DROP TRIGGER IF EXISTS trg_business_os_stage_automations_updated_at
  ON business_os_stage_automations;
CREATE TRIGGER trg_business_os_stage_automations_updated_at
  BEFORE UPDATE ON business_os_stage_automations
  FOR EACH ROW EXECUTE FUNCTION business_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_business_os_stage_task_items_updated_at
  ON business_os_stage_task_template_items;
CREATE TRIGGER trg_business_os_stage_task_items_updated_at
  BEFORE UPDATE ON business_os_stage_task_template_items
  FOR EACH ROW EXECUTE FUNCTION business_os_set_updated_at();

ALTER TABLE business_os_stage_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_os_stage_task_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_os_stage_automation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_os_sla_escalations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE business_os_stage_automations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE business_os_stage_task_template_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE business_os_stage_automation_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE business_os_sla_escalations FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_os_stage_automations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_os_stage_task_template_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_os_stage_automation_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_os_sla_escalations TO service_role;

COMMENT ON TABLE business_os_stage_automations IS
  'Cấu hình automation + SLA theo company/process/stage. Qualification pilot là lát cắt đầu tiên.';
COMMENT ON TABLE business_os_stage_task_template_items IS
  'Checklist mẫu của stage; khi chạy được materialize vào crm_tasks, không tạo nguồn task thứ hai.';
COMMENT ON TABLE business_os_stage_automation_versions IS
  'Snapshot bất biến để audit và rollback cấu hình task/SLA.';
COMMENT ON TABLE business_os_sla_escalations IS
  'Sổ chống lặp cảnh báo SLA theo process instance, mức cảnh báo và người nhận.';
COMMENT ON COLUMN crm_tasks.business_os_template_item_key IS
  'Khóa nguồn ổn định dùng chống sinh trùng khi automation Qualification được gọi lặp.';

COMMIT;
