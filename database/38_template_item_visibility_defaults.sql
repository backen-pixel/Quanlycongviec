-- 38_template_item_visibility_defaults.sql
-- Thêm phân quyền mặc định cho từng nhiệm vụ mẫu CRM
-- Khi user upload file/ghi chú → tự động áp dụng quyền xem từ template

ALTER TABLE crm_task_template_items 
  ADD COLUMN IF NOT EXISTS default_allowed_companies JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_allowed_departments JSONB DEFAULT NULL;

-- Cũng thêm vào crm_tasks (nhiệm vụ thực tế) để lưu quyền mặc định kế thừa từ template
ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS default_allowed_companies JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_allowed_departments JSONB DEFAULT NULL;
