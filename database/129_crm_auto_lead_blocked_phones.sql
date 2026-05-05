-- Chặn tự động tạo lead Facebook / quét SĐT khi SĐT đã bị đánh dấu (vd. sau khi xóa lead/KH).
-- Khớp theo 9 số cuối (thuê bao VN), giống logic tìm trùng KH.

CREATE TABLE IF NOT EXISTS crm_auto_lead_blocked_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_last9 TEXT NOT NULL,
  phone_display TEXT,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_auto_lead_blocked_phones_last9_len CHECK (char_length(phone_last9) = 9 AND phone_last9 ~ '^[0-9]+$'),
  CONSTRAINT uq_crm_auto_lead_blocked_phones_last9 UNIQUE (phone_last9)
);

CREATE INDEX IF NOT EXISTS idx_crm_auto_lead_blocked_phones_created_at
  ON crm_auto_lead_blocked_phones (created_at DESC);

ALTER TABLE crm_auto_lead_blocked_phones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON crm_auto_lead_blocked_phones;
CREATE POLICY "service_all" ON crm_auto_lead_blocked_phones FOR ALL USING (true);
