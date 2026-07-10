-- 409: Mặc định chia sẻ xưởng trên nhiệm vụ mẫu CRM (file/ghi chú sinh từ mẫu)

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS default_shared_to_project boolean DEFAULT false;

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS default_allowed_share_modules JSONB DEFAULT NULL;

COMMENT ON COLUMN crm_task_template_items.default_shared_to_project IS
  'Khi true: file/ghi chú upload vào nhiệm vụ sinh từ mẫu tự chia sẻ sang SX/VC/CV (kế thừa crm_tasks.shared_to_project).';

COMMENT ON COLUMN crm_task_template_items.default_allowed_share_modules IS
  'Khi default_shared_to_project=true: giới hạn module production | logistics | workshop. NULL = cả ba.';
