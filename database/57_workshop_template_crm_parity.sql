-- Bổ sung cột giống crm_task_templates / items (mặc định + phân quyền mẫu)

ALTER TABLE workshop_task_templates
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS default_allowed_companies UUID[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_allowed_departments UUID[] DEFAULT NULL;
