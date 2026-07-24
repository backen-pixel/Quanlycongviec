-- 469: Hạn mẫu/NV CRM theo ngày + giờ + phút

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS deadline_hours INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deadline_minutes INT DEFAULT 0;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS deadline_hours INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deadline_minutes INT DEFAULT 0;

COMMENT ON COLUMN crm_task_template_items.deadline_hours IS
  'Số giờ hạn (cộng với deadline_days / deadline_minutes) khi NV tới lượt đếm.';
COMMENT ON COLUMN crm_task_template_items.deadline_minutes IS
  'Số phút hạn (cộng với deadline_days / deadline_hours) khi NV tới lượt đếm.';
COMMENT ON COLUMN crm_tasks.deadline_hours IS
  'Offset giờ hạn — kế thừa từ mẫu; dùng khi start deadline tuần tự.';
COMMENT ON COLUMN crm_tasks.deadline_minutes IS
  'Offset phút hạn — kế thừa từ mẫu; dùng khi start deadline tuần tự.';

UPDATE crm_task_template_items
SET deadline_hours = 0
WHERE deadline_hours IS NULL;

UPDATE crm_task_template_items
SET deadline_minutes = 0
WHERE deadline_minutes IS NULL;

UPDATE crm_tasks
SET deadline_hours = 0
WHERE deadline_hours IS NULL;

UPDATE crm_tasks
SET deadline_minutes = 0
WHERE deadline_minutes IS NULL;
