-- 32_crm_template_pipeline_type.sql
-- Thêm pipeline_type cho CRM task templates (lead/deal/both)

ALTER TABLE crm_task_templates ADD COLUMN IF NOT EXISTS pipeline_type TEXT DEFAULT 'both';
-- Values: 'lead', 'deal', 'both'

-- Update existing templates
UPDATE crm_task_templates SET pipeline_type = 'both' WHERE pipeline_type IS NULL;
