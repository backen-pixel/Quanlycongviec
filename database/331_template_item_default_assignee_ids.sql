-- 331: Gán nhiều NV mặc định trên mục bộ nhiệm vụ mẫu

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS default_assignee_ids UUID[] DEFAULT '{}';

ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS default_assignee_ids UUID[] DEFAULT '{}';

UPDATE crm_task_template_items
SET default_assignee_ids = ARRAY[default_assignee_id]
WHERE default_assignee_id IS NOT NULL
  AND (default_assignee_ids IS NULL OR cardinality(default_assignee_ids) = 0);

UPDATE workshop_task_template_items
SET default_assignee_ids = ARRAY[default_assignee_id]
WHERE default_assignee_id IS NOT NULL
  AND (default_assignee_ids IS NULL OR cardinality(default_assignee_ids) = 0);

COMMENT ON COLUMN crm_task_template_items.default_assignee_ids IS
  'Danh sách NV mặc định khi sinh crm_tasks. assignee_id = phần tử đầu; crm_task_assignees = toàn bộ.';

COMMENT ON COLUMN workshop_task_template_items.default_assignee_ids IS
  'Danh sách NV mặc định khi sinh sx_*. Có thể bị ghi đè 1 NV bởi production_handover_task_assignments.';
