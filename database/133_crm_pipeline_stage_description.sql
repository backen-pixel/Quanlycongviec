-- Mô tả ngắn theo từng cột Kanban CRM (crm_pipeline_stages)
ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS description TEXT;
