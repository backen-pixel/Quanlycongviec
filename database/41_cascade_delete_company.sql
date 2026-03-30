-- 41: Cascade delete khi xóa công ty
-- Chạy 1 lần trên Supabase SQL Editor

-- departments.company_id → CASCADE (xóa công ty = xóa phòng ban)
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_company_id_fkey;
ALTER TABLE departments ADD CONSTRAINT departments_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- ecosystem_units.company_id → CASCADE (xóa công ty = xóa đơn vị hệ sinh thái)
ALTER TABLE ecosystem_units DROP CONSTRAINT IF EXISTS ecosystem_units_company_id_fkey;
ALTER TABLE ecosystem_units ADD CONSTRAINT ecosystem_units_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- company_template_sets.company_id → CASCADE
ALTER TABLE company_template_sets DROP CONSTRAINT IF EXISTS company_template_sets_company_id_fkey;
ALTER TABLE company_template_sets ADD CONSTRAINT company_template_sets_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- project_company_assignments.company_id → CASCADE
ALTER TABLE project_company_assignments DROP CONSTRAINT IF EXISTS project_company_assignments_company_id_fkey;
ALTER TABLE project_company_assignments ADD CONSTRAINT project_company_assignments_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- crm_leads.company_id → SET NULL (giữ leads, bỏ liên kết)
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_company_id_fkey;
ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

-- projects.company_id → SET NULL (giữ dự án, bỏ liên kết)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_company_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

-- user_companies → CASCADE (xóa công ty = xóa liên kết nhân viên)
ALTER TABLE user_companies DROP CONSTRAINT IF EXISTS user_companies_company_id_fkey;
ALTER TABLE user_companies ADD CONSTRAINT user_companies_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
