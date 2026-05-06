-- Khi tạo Deal với loại có workshop_production_templates = true và công ty thuộc module SX:
-- backend gọi applyProductionTemplateToFulfillmentLead (crm_tasks sx_* từ workshop_task_templates).

ALTER TABLE crm_lead_types
  ADD COLUMN IF NOT EXISTS workshop_production_templates BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_lead_types.workshop_production_templates IS
  'Bật: khi tạo Deal loại này, tự sinh nhiệm vụ pipeline SX (sx_*) từ bộ mẫu xưởng (workshop_task_templates, workshop_area=production) theo công ty.';
