-- 286_crm_assignments_crm_task_id.sql
-- Liên kết «Giao việc CRM» với nhiệm vụ pipeline crm_tasks (gán NV từ tab Nhiệm vụ lead/deal).
-- Idempotent.

BEGIN;

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS crm_task_id UUID REFERENCES crm_tasks(id) ON DELETE CASCADE;

COMMENT ON COLUMN crm_assignments.crm_task_id IS
  'Nhiệm vụ pipeline gốc — đồng bộ 2 chiều với crm_tasks khi gán NV / đổi trạng thái.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_assignments_crm_task_id
  ON crm_assignments (crm_task_id)
  WHERE crm_task_id IS NOT NULL;

COMMIT;
