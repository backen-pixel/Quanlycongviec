-- 373: HT nhiệm vụ SX → tự tắt deadline ngày giao hàng trên dự án
ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS clears_delivery_deadline_on_complete BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN workshop_task_template_items.clears_delivery_deadline_on_complete IS
  'True: khi nhiệm vụ sinh từ mẫu được đánh dấu hoàn thành → xóa delivery_date + production_deadline trên projects gắn deal.';

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS clears_delivery_deadline_on_complete BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_tasks.clears_delivery_deadline_on_complete IS
  'Kế thừa từ workshop_task_template_items — HT nhiệm vụ thì tắt deadline ngày giao hàng dự án.';
