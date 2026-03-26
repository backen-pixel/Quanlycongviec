-- 34_lead_owner.sql
-- Thêm cột lead_owner_id để lưu người phụ trách Lead gốc khi convert sang Deal

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS lead_owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Cập nhật các deal hiện tại: lead_owner = created_by (nếu chưa có)
UPDATE crm_leads SET lead_owner_id = created_by WHERE type = 'deal' AND lead_owner_id IS NULL;
-- Cập nhật lead hiện tại: lead_owner = assigned_to hoặc created_by
UPDATE crm_leads SET lead_owner_id = COALESCE(assigned_to, created_by) WHERE type = 'lead' AND lead_owner_id IS NULL;
