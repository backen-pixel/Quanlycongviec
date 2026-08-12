-- 507_crm_assignments_custom_module.sql
-- Cho phép assignment_module = module_key của app module tùy chỉnh
-- (ngoài crm / production / logistics).

ALTER TABLE crm_assignments DROP CONSTRAINT IF EXISTS crm_assignments_assignment_module_check;

ALTER TABLE crm_assignments
  ADD CONSTRAINT crm_assignments_assignment_module_check
  CHECK (
    assignment_module ~ '^[a-z][a-z0-9_-]{0,63}$'
  );

COMMENT ON COLUMN crm_assignments.assignment_module IS
  'crm | production | logistics | <app_modules.module_key>';

-- schedules dùng cùng khóa module
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_assignment_schedules'
      AND column_name = 'assignment_module'
  ) THEN
    ALTER TABLE crm_assignment_schedules DROP CONSTRAINT IF EXISTS crm_assignment_schedules_assignment_module_check;
    -- không bắt buộc CHECK cứng trên schedules (một số DB chưa có constraint tên cố định)
  END IF;
END $$;
