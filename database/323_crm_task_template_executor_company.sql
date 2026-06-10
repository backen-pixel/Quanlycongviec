-- Gán công ty thực hiện trên mục bộ mẫu CRM (parity workshop_task_template_items / migration 318).

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS executor_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_task_tpl_items_executor_company
  ON crm_task_template_items(executor_company_id)
  WHERE executor_company_id IS NOT NULL;

COMMENT ON COLUMN crm_task_template_items.executor_company_id IS
  'Công ty thực hiện nhiệm vụ (khác chủ deal). NULL = công ty chủ deal.';
