-- Bộ nhiệm vụ mẫu xưởng theo phân loại (Cửa / Tủ bếp / …) trong từng công ty.
-- NULL workshop_type_id = bộ chung áp dụng mọi phân loại (giống pipeline Global).

ALTER TABLE workshop_task_templates
  ADD COLUMN IF NOT EXISTS workshop_type_id UUID NULL
  REFERENCES workshop_project_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_task_tpl_company_type_area
  ON workshop_task_templates (company_id, workshop_type_id, workshop_area)
  WHERE company_id IS NOT NULL;

COMMENT ON COLUMN workshop_task_templates.workshop_type_id IS
  'Phân loại xưởng (workshop_project_types). NULL = bộ mẫu chung cho mọi phân loại của công ty.';
