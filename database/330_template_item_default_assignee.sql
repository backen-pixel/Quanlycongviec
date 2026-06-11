-- 330: Gán nhân viên mặc định trên từng mục bộ nhiệm vụ mẫu (CRM + xưởng)

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS default_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS default_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN crm_task_template_items.default_assignee_id IS
  'NV mặc định khi sinh crm_tasks từ mẫu (auto-gen / gắn bộ mẫu). Checklist con vẫn có assignee riêng trong JSONB checklist.';

COMMENT ON COLUMN workshop_task_template_items.default_assignee_id IS
  'NV mặc định khi sinh nhiệm vụ sx_* từ mẫu. Có thể bị ghi đè bởi production_handover_task_assignments theo công ty.';

CREATE INDEX IF NOT EXISTS idx_crm_tpl_items_default_assignee
  ON crm_task_template_items(default_assignee_id)
  WHERE default_assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_tpl_items_default_assignee
  ON workshop_task_template_items(default_assignee_id)
  WHERE default_assignee_id IS NOT NULL;
