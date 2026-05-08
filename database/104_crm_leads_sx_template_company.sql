-- Công ty xưởng đã dùng để gắn bộ mẫu nhiệm vụ SX (workshop_task_templates) khi deal vào cột Sản xuất
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS sx_template_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
