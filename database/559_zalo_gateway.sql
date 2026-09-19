-- ═══════════════════════════════════════════════════════════════
-- 559. CỔNG ZALO — một máy công ty giữ nhiều tài khoản cá nhân
--
-- Trước: mỗi tài khoản một bridge_token riêng (không nhân rộng được).
-- Nay  : máy công ty là một "gateway" có một khoá duy nhất; mỗi tài khoản
--        Zalo cá nhân gắn vào một gateway. Thêm tài khoản = thêm hàng trong
--        zalo_oa_accounts, không phải cấp khoá mới.
-- ═══════════════════════════════════════════════════════════════

-- 1. Máy công ty
CREATE TABLE IF NOT EXISTS zalo_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gateway_token TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  agent_version TEXT,
  host_info JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Gắn tài khoản vào máy
ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS gateway_id UUID REFERENCES zalo_gateways(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_zalo_oa_accounts_gateway
  ON zalo_oa_accounts(gateway_id) WHERE gateway_id IS NOT NULL;

-- 3. Lệnh admin gửi xuống máy công ty (đăng xuất, khởi động lại, quét QR)
CREATE TABLE IF NOT EXISTS zalo_gateway_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id UUID NOT NULL REFERENCES zalo_gateways(id) ON DELETE CASCADE,
  oa_id TEXT,
  command TEXT NOT NULL CHECK (command IN ('logout', 'restart', 'relogin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  result TEXT,
  requested_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  done_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_zalo_gateway_commands_poll
  ON zalo_gateway_commands(gateway_id, status, created_at);

-- 4. Mã QR do máy công ty đẩy lên để admin quét từ xa
ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS qr_image TEXT,
  ADD COLUMN IF NOT EXISTS qr_updated_at TIMESTAMPTZ;

-- 5. RLS đồng bộ với các bảng zalo_* khác
ALTER TABLE zalo_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_gateway_commands ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "zalo_gateways_all" ON zalo_gateways FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "zalo_gateway_commands_all" ON zalo_gateway_commands FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Chuyển tài khoản cá nhân đang chạy sang gateway đầu tiên
DO $$
DECLARE gw UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM zalo_gateways) THEN
    INSERT INTO zalo_gateways (name, gateway_token, description)
    VALUES ('Máy công ty', encode(gen_random_bytes(32), 'hex'), 'Máy Linux đặt tại văn phòng, chạy 24/7')
    RETURNING id INTO gw;
  ELSE
    SELECT id INTO gw FROM zalo_gateways ORDER BY created_at LIMIT 1;
  END IF;

  UPDATE zalo_oa_accounts
     SET gateway_id = gw
   WHERE account_kind = 'personal' AND gateway_id IS NULL;
END $$;
