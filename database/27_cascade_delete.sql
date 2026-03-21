-- 27: Cascade delete cho các bảng phụ thuộc
-- Chạy 1 lần trên Supabase SQL Editor

-- crm_leads.project_id → SET NULL (để backend xóa thủ công, tránh loop)
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_project_id_fkey;
ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- Tasks → CASCADE khi xóa project
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Checklists → CASCADE khi xóa task
ALTER TABLE task_checklists DROP CONSTRAINT IF EXISTS task_checklists_task_id_fkey;
ALTER TABLE task_checklists ADD CONSTRAINT task_checklists_task_id_fkey 
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- Project sub-tables → CASCADE
ALTER TABLE project_comments DROP CONSTRAINT IF EXISTS project_comments_project_id_fkey;
ALTER TABLE project_comments ADD CONSTRAINT project_comments_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_company_assignments DROP CONSTRAINT IF EXISTS project_company_assignments_project_id_fkey;
ALTER TABLE project_company_assignments ADD CONSTRAINT project_company_assignments_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_phase_handoffs DROP CONSTRAINT IF EXISTS project_phase_handoffs_project_id_fkey;
ALTER TABLE project_phase_handoffs ADD CONSTRAINT project_phase_handoffs_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_approvals DROP CONSTRAINT IF EXISTS project_approvals_project_id_fkey;
ALTER TABLE project_approvals ADD CONSTRAINT project_approvals_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_workflow_lines DROP CONSTRAINT IF EXISTS project_workflow_lines_project_id_fkey;
ALTER TABLE project_workflow_lines ADD CONSTRAINT project_workflow_lines_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- CRM sub-tables → CASCADE khi xóa lead
ALTER TABLE crm_activities DROP CONSTRAINT IF EXISTS crm_activities_lead_id_fkey;
ALTER TABLE crm_activities ADD CONSTRAINT crm_activities_lead_id_fkey 
  FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;

ALTER TABLE lead_documents DROP CONSTRAINT IF EXISTS lead_documents_lead_id_fkey;
ALTER TABLE lead_documents ADD CONSTRAINT lead_documents_lead_id_fkey 
  FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;

ALTER TABLE crm_quotations DROP CONSTRAINT IF EXISTS crm_quotations_lead_id_fkey;
ALTER TABLE crm_quotations ADD CONSTRAINT crm_quotations_lead_id_fkey 
  FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;

ALTER TABLE crm_orders DROP CONSTRAINT IF EXISTS crm_orders_lead_id_fkey;
ALTER TABLE crm_orders ADD CONSTRAINT crm_orders_lead_id_fkey 
  FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;

ALTER TABLE crm_invoices DROP CONSTRAINT IF EXISTS crm_invoices_lead_id_fkey;
ALTER TABLE crm_invoices ADD CONSTRAINT crm_invoices_lead_id_fkey 
  FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;

-- Thêm cột deadline + notes cho projects (migration 26)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes TEXT;
