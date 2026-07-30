-- 480_crm_assignments_assignment_module_logistics.sql
-- Cho phép assignment_module = logistics (VC/LĐ) ngoài crm / production.
-- Idempotent.

BEGIN;

ALTER TABLE crm_assignments DROP CONSTRAINT IF EXISTS crm_assignments_assignment_module_check;

ALTER TABLE crm_assignments
  ADD CONSTRAINT crm_assignments_assignment_module_check
  CHECK (assignment_module IN ('crm', 'production', 'logistics'));

COMMENT ON COLUMN crm_assignments.assignment_module IS
  'crm = Giao việc CRM; production = Giao việc SX; logistics = Giao việc VC/LĐ.';

COMMIT;
