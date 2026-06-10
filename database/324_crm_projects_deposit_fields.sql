-- 324: Tiền cọc trên lead/deal (CRM only — không đồng bộ module SX)
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS deposit_received BOOLEAN;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS deposit_label TEXT;

COMMENT ON COLUMN crm_leads.deposit_amount IS 'Tiền cọc ghi trên lead/deal (CRM)';
COMMENT ON COLUMN crm_leads.deposit_received IS 'NULL: chưa rõ; true: đã nhận; false: chưa nhận';
COMMENT ON COLUMN crm_leads.deposit_label IS 'Mô tả dòng cọc (VD ký HĐ, lệnh SX)';
