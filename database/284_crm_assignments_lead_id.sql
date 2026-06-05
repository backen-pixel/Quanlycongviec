-- 284_crm_assignments_lead_id.sql
-- Liên kết nhiệm vụ «Giao việc CRM» với lead/deal (gán từ tab Thành viên).
-- Idempotent.

BEGIN;

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL;

COMMENT ON COLUMN crm_assignments.lead_id IS
  'Lead/deal gốc khi nhiệm vụ được tạo từ tab Thành viên — hiển thị trên trang Giao việc CRM.';

CREATE INDEX IF NOT EXISTS idx_crm_assignments_lead_id
  ON crm_assignments (lead_id)
  WHERE lead_id IS NOT NULL;

COMMIT;
