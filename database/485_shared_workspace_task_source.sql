-- 485_shared_workspace_task_source.sql
-- Phân loại nguồn nhiệm vụ Không gian chung:
--   task_source_type: customer_request | employee_error
--   employee_error_module: crm | production | logistics (chỉ khi lỗi nhân viên)
-- Idempotent.

BEGIN;

-- ── crm_tasks ──────────────────────────────────────────────────────────────
ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS task_source_type TEXT;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS employee_error_module TEXT;

ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_task_source_type_check;
ALTER TABLE crm_tasks
  ADD CONSTRAINT crm_tasks_task_source_type_check
  CHECK (
    task_source_type IS NULL
    OR task_source_type IN ('customer_request', 'employee_error')
  );

ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_employee_error_module_check;
ALTER TABLE crm_tasks
  ADD CONSTRAINT crm_tasks_employee_error_module_check
  CHECK (
    employee_error_module IS NULL
    OR employee_error_module IN ('crm', 'production', 'logistics')
  );

ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_employee_error_module_requires_type;
ALTER TABLE crm_tasks
  ADD CONSTRAINT crm_tasks_employee_error_module_requires_type
  CHECK (
    employee_error_module IS NULL
    OR task_source_type = 'employee_error'
  );

COMMENT ON COLUMN crm_tasks.task_source_type IS
  'customer_request = Phát sinh từ khách hàng; employee_error = Lỗi từ nhân viên.';
COMMENT ON COLUMN crm_tasks.employee_error_module IS
  'Khối phát sinh lỗi (crm/production/logistics) — độc lập với khối người nhận.';

-- ── crm_assignments ────────────────────────────────────────────────────────
ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS task_source_type TEXT;

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS employee_error_module TEXT;

ALTER TABLE crm_assignments DROP CONSTRAINT IF EXISTS crm_assignments_task_source_type_check;
ALTER TABLE crm_assignments
  ADD CONSTRAINT crm_assignments_task_source_type_check
  CHECK (
    task_source_type IS NULL
    OR task_source_type IN ('customer_request', 'employee_error')
  );

ALTER TABLE crm_assignments DROP CONSTRAINT IF EXISTS crm_assignments_employee_error_module_check;
ALTER TABLE crm_assignments
  ADD CONSTRAINT crm_assignments_employee_error_module_check
  CHECK (
    employee_error_module IS NULL
    OR employee_error_module IN ('crm', 'production', 'logistics')
  );

ALTER TABLE crm_assignments DROP CONSTRAINT IF EXISTS crm_assignments_employee_error_module_requires_type;
ALTER TABLE crm_assignments
  ADD CONSTRAINT crm_assignments_employee_error_module_requires_type
  CHECK (
    employee_error_module IS NULL
    OR task_source_type = 'employee_error'
  );

COMMENT ON COLUMN crm_assignments.task_source_type IS
  'customer_request = Phát sinh từ khách hàng; employee_error = Lỗi từ nhân viên.';
COMMENT ON COLUMN crm_assignments.employee_error_module IS
  'Khối phát sinh lỗi (crm/production/logistics) — độc lập với khối người nhận.';

COMMIT;
