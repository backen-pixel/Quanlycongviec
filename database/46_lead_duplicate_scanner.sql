-- 46. Lead Duplicate Scanner + Customer Quotation Sync
-- Chạy trên Supabase SQL Editor

-- Thêm cột sync báo giá vào customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_quotation_amount NUMERIC;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_quotation_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_quotation_value NUMERIC DEFAULT 0;

-- Index for duplicate scanning
CREATE INDEX IF NOT EXISTS idx_crm_leads_customer_id ON crm_leads(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fb_contacts_psid_lead ON facebook_contacts(psid, lead_id) WHERE lead_id IS NOT NULL;
