-- 198_crm_assignment_columns_shared.sql
-- Cột Kanban Giao việc CRM dùng chung tất cả công ty (company_id = NULL).
-- Nhiệm vụ (crm_assignments) vẫn gắn company_id riêng từng công ty.

BEGIN;

UPDATE crm_assignment_columns SET company_id = NULL WHERE company_id IS NOT NULL;

COMMENT ON COLUMN crm_assignment_columns.company_id IS
  'Luôn NULL — bộ cột Kanban dùng chung toàn hệ thống. Lọc theo công ty chỉ áp dụng cho crm_assignments.';

COMMIT;
