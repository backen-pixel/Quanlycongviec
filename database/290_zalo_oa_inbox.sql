-- ═══════════════════════════════════════════════════════════════
-- 290. ZALO OA INBOX — Nhận tin nhắn khách qua webhook + hộp thư CRM
-- ═══════════════════════════════════════════════════════════════

-- 1. Cấu hình Official Account
CREATE TABLE IF NOT EXISTS zalo_oa_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oa_id TEXT NOT NULL UNIQUE,
  oa_name TEXT,
  app_id TEXT,
  access_token TEXT NOT NULL,
  secret_key TEXT,
  is_active BOOLEAN DEFAULT true,
  auto_create_lead BOOLEAN DEFAULT true,
  auto_reply_message TEXT DEFAULT 'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.',
  default_pipeline_id UUID,
  default_stage_id UUID,
  default_source_id UUID,
  default_company_id UUID,
  default_region_id UUID,
  default_lead_owner_id UUID REFERENCES users(id),
  default_lead_type_id UUID,
  webhook_verify_enabled BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Liên hệ Zalo (user_id ↔ Lead/Customer)
CREATE TABLE IF NOT EXISTS zalo_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oa_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  email TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oa_id, user_id)
);

-- 3. Lịch sử tin nhắn
CREATE TABLE IF NOT EXISTS zalo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES zalo_contacts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  zalo_msg_id TEXT UNIQUE,
  event_name TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'location', 'sticker', 'link', 'gif', 'contact', 'unknown')),
  content TEXT,
  attachment_url TEXT,
  attachment_type TEXT,
  metadata JSONB,
  sent_by UUID REFERENCES users(id),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Log webhook (debug)
CREATE TABLE IF NOT EXISTS zalo_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oa_id TEXT,
  event_name TEXT,
  payload JSONB,
  status TEXT DEFAULT 'received',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_contacts_oa_user ON zalo_contacts(oa_id, user_id);
CREATE INDEX IF NOT EXISTS idx_zalo_contacts_lead ON zalo_contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_zalo_contacts_last_msg ON zalo_contacts(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_contact ON zalo_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_lead ON zalo_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_created ON zalo_messages(created_at DESC);

ALTER TABLE zalo_oa_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zalo_oa_accounts_all" ON zalo_oa_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "zalo_contacts_all" ON zalo_contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "zalo_messages_all" ON zalo_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "zalo_webhook_logs_all" ON zalo_webhook_logs FOR ALL USING (true) WITH CHECK (true);

INSERT INTO crm_sources (name, icon)
VALUES ('Zalo OA', '💬')
ON CONFLICT DO NOTHING;
