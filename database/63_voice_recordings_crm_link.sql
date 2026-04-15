-- Liên kết ghi âm với khách hàng + lead/deal (crm_leads.type = lead | deal)
ALTER TABLE voice_recordings ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE voice_recordings ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voice_recordings_customer ON voice_recordings(user_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_lead ON voice_recordings(lead_id);
