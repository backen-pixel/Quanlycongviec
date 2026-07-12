-- Sync with database/134_crm_lead_type_workshop_production_templates.sql

ALTER TABLE crm_lead_types
  ADD COLUMN IF NOT EXISTS workshop_production_templates BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_lead_types.workshop_production_templates IS
  'Bật: khi tạo Deal loại này, tự sinh nhiệm vụ pipeline SX (sx_*) từ bộ mẫu xưởng (workshop_task_templates, workshop_area=production) theo công ty.';
