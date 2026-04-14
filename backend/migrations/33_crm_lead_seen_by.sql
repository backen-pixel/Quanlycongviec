-- Đồng bộ với database/59_crm_lead_seen_by.sql
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS lead_seen_by JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN crm_leads.lead_seen_by IS 'Map user_id -> ISO time khi user đó mở trang chi tiết; dùng để ẩn badge Mới trên pipeline.';
