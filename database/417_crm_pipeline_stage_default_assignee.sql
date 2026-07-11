-- 417_crm_pipeline_stage_default_assignee.sql
-- Gán người phụ trách CRM khi lead/deal vào cột pipeline (nếu bật checkbox).
-- Idempotent.

BEGIN;

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS apply_default_assignee_on_enter BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS default_assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN crm_pipeline_stages.apply_default_assignee_on_enter IS
  'Khi bật: mỗi lần lead/deal vào cột này, gán assigned_to + lead_owner_id theo default_assignee_user_id.';

COMMENT ON COLUMN crm_pipeline_stages.default_assignee_user_id IS
  'NV phụ trách mặc định khi vào cột (chỉ áp dụng nếu apply_default_assignee_on_enter = true).';

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_default_assignee
  ON crm_pipeline_stages (default_assignee_user_id)
  WHERE default_assignee_user_id IS NOT NULL;

COMMIT;
