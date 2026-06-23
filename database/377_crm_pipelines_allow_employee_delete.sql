-- Cho phép / chặn nhân viên (không phải admin CRM) xóa Lead / Deal theo từng pipeline.
ALTER TABLE crm_pipelines
  ADD COLUMN IF NOT EXISTS allow_employee_delete_lead BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE crm_pipelines
  ADD COLUMN IF NOT EXISTS allow_employee_delete_deal BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN crm_pipelines.allow_employee_delete_lead IS
  'true = nhân viên CRM được xóa Lead thuộc pipeline này; admin CRM luôn được xóa.';

COMMENT ON COLUMN crm_pipelines.allow_employee_delete_deal IS
  'true = nhân viên CRM được xóa Deal thuộc pipeline này; admin CRM luôn được xóa.';
