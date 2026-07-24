-- 466: Nút điền form trên nhiệm vụ CRM
--      (cấu hình ở bộ mẫu: show_fill_form + form_config → kế thừa xuống crm_tasks;
--       form_data lưu kết quả NV đã điền).
-- Idempotent.

BEGIN;

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS show_fill_form BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS form_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN crm_task_template_items.show_fill_form IS
  'True: nhiệm vụ sinh từ mẫu này sẽ hiển thị nút Điền form trên tab Nhiệm vụ.';

COMMENT ON COLUMN crm_task_template_items.form_config IS
  'Cấu hình form: { button_label, title, fields: [{ id, type, label, required, placeholder, options }] }. type: text|number|textarea|file|single_select|multi_select|button.';

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS show_fill_form BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS form_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS form_data JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN crm_tasks.show_fill_form IS
  'Hiển thị nút Điền form. Mặc định kế thừa từ mẫu; có thể bật/tắt ở modal sửa NV.';

COMMENT ON COLUMN crm_tasks.form_config IS
  'Schema form điền (copy từ mẫu khi gen). fields: text|number|textarea|file|single_select|multi_select|button.';

COMMENT ON COLUMN crm_tasks.form_data IS
  'Giá trị NV đã điền: { submitted_at, submitted_by, values: { fieldId: value } }.';

COMMIT;
