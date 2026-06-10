-- 314_crm_assignments_production_module.sql
-- Phân tách "Giao việc CRM" vs "Giao việc Sản xuất" trên cùng bảng crm_assignments.
-- Idempotent.

BEGIN;

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS assignment_module TEXT NOT NULL DEFAULT 'crm';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_assignments_assignment_module_check'
  ) THEN
    ALTER TABLE crm_assignments
      ADD CONSTRAINT crm_assignments_assignment_module_check
      CHECK (assignment_module IN ('crm', 'production'));
  END IF;
END $$;

COMMENT ON COLUMN crm_assignments.assignment_module IS
  'crm = Giao việc CRM; production = Giao việc Sản xuất (tự sinh từ bộ mẫu pipeline SX).';

CREATE INDEX IF NOT EXISTS idx_crm_assignments_module_company
  ON crm_assignments (assignment_module, company_id);

CREATE INDEX IF NOT EXISTS idx_crm_assignments_module_assignee
  ON crm_assignments (assignment_module, assignee_id);

COMMIT;
