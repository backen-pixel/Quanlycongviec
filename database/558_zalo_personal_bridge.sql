-- ═══════════════════════════════════════════════════════════════
-- 558. ZALO CÁ NHÂN (BRIDGE) — Đồng bộ tin nhắn TK Zalo cá nhân vào CRM
--
-- Tái dùng toàn bộ hạ tầng Zalo OA sẵn có (zalo_contacts / zalo_messages /
-- ZaloChatTab). Tài khoản cá nhân lưu trong zalo_oa_accounts với
-- account_kind = 'personal' và oa_id = 'personal:<zalo_uid>'.
--
-- Chiều đến : bridge → POST /api/zalo-bridge/inbound
-- Chiều đi  : CRM ghi vào zalo_outbox → bridge poll → gửi → ack
-- ═══════════════════════════════════════════════════════════════

-- 1. Mở rộng zalo_oa_accounts cho tài khoản cá nhân
ALTER TABLE zalo_oa_accounts ALTER COLUMN access_token DROP NOT NULL;

ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'oa',
  ADD COLUMN IF NOT EXISTS bridge_token TEXT,
  ADD COLUMN IF NOT EXISTS bridge_status TEXT NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS bridge_last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bridge_transport TEXT,
  ADD COLUMN IF NOT EXISTS bridge_note TEXT;

DO $$ BEGIN
  ALTER TABLE zalo_oa_accounts
    ADD CONSTRAINT zalo_oa_accounts_account_kind_chk
    CHECK (account_kind IN ('oa', 'personal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE zalo_oa_accounts
    ADD CONSTRAINT zalo_oa_accounts_bridge_status_chk
    CHECK (bridge_status IN ('offline', 'online', 'need_qr', 'error'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_zalo_oa_accounts_bridge_token
  ON zalo_oa_accounts(bridge_token) WHERE bridge_token IS NOT NULL;

-- Tài khoản cá nhân không auto-tạo lead: chỉ đồng bộ hội thoại đã gắn lead.
-- (cột auto_create_lead vẫn dùng chung, admin tự tắt trong UI)

-- 2. Hàng đợi tin gửi đi từ CRM
CREATE TABLE IF NOT EXISTS zalo_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oa_id TEXT NOT NULL,
  contact_id UUID NOT NULL REFERENCES zalo_contacts(id) ON DELETE CASCADE,
  message_id UUID REFERENCES zalo_messages(id) ON DELETE SET NULL,
  thread_id TEXT NOT NULL,
  thread_type TEXT NOT NULL DEFAULT 'user' CHECK (thread_type IN ('user', 'group')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  zalo_msg_id TEXT,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  requested_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_outbox_poll
  ON zalo_outbox(oa_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_zalo_outbox_contact
  ON zalo_outbox(contact_id, created_at DESC);

-- 3. Hội thoại cá nhân chưa gắn lead — chỉ lưu metadata, KHÔNG lưu nội dung
CREATE TABLE IF NOT EXISTS zalo_personal_pending_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oa_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  thread_type TEXT NOT NULL DEFAULT 'user' CHECK (thread_type IN ('user', 'group')),
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  message_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oa_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_zalo_pending_threads_recent
  ON zalo_personal_pending_threads(oa_id, dismissed, last_message_at DESC NULLS LAST);

-- 4. RLS đồng bộ với các bảng zalo_* hiện có
ALTER TABLE zalo_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_personal_pending_threads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "zalo_outbox_all" ON zalo_outbox FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "zalo_personal_pending_threads_all" ON zalo_personal_pending_threads
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Nguồn CRM
INSERT INTO crm_sources (name, icon)
SELECT 'Zalo Cá nhân', '📱'
WHERE NOT EXISTS (SELECT 1 FROM crm_sources WHERE name = 'Zalo Cá nhân');
