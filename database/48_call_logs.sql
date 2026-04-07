-- 48_call_logs.sql — Bảng lưu lịch sử cuộc gọi từ Stringee/bên thứ 3

CREATE TABLE IF NOT EXISTS crm_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  third_party_call_id TEXT UNIQUE,    -- call_id từ Stringee
  provider TEXT DEFAULT 'stringee',   -- stringee | twilio | manual
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  phone_from TEXT,                    -- số gọi đi
  phone_to TEXT,                      -- số nhận
  direction TEXT DEFAULT 'outbound',  -- inbound | outbound
  status TEXT DEFAULT 'unknown',      -- RINGING, ANSWERED, ENDED, MISSED...
  duration_seconds INT DEFAULT 0,
  recording_url TEXT,                 -- link file ghi âm
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  notes TEXT,                         -- ghi chú thêm
  raw_payload JSONB,                  -- payload gốc từ webhook
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON crm_call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_customer ON crm_call_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_phone ON crm_call_logs(phone_from, phone_to);
CREATE INDEX IF NOT EXISTS idx_call_logs_started ON crm_call_logs(started_at DESC);

-- RLS
ALTER TABLE crm_call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON crm_call_logs FOR ALL USING (true);
