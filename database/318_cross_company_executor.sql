-- Cross-company task execution: bộ mẫu SX có thể gán công ty thực hiện khác chủ dự án.
-- executor_company_id trên task/assignment → công ty B thấy dự án + nhiệm vụ của mình;
-- tab «Không gian chung» hiển thị toàn bộ nhiệm vụ hai bên.

ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS executor_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS executor_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS executor_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_executor_company
  ON crm_tasks(executor_company_id)
  WHERE executor_company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_assignments_executor_company
  ON crm_assignments(executor_company_id)
  WHERE executor_company_id IS NOT NULL;

COMMENT ON COLUMN workshop_task_template_items.executor_company_id IS
  'Công ty thực hiện nhiệm vụ (khác chủ dự án). NULL = công ty chủ dự án.';
COMMENT ON COLUMN crm_tasks.executor_company_id IS
  'Công ty được giao thực hiện nhiệm vụ sx_*. NULL = chủ deal/dự án.';
COMMENT ON COLUMN crm_assignments.executor_company_id IS
  'Công ty thực hiện — dùng lọc Giao việc và quyền xem cho công ty đối tác.';
