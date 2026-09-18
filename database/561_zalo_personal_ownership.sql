-- ═══════════════════════════════════════════════════════════════
-- 561. ZALO CÁ NHÂN — mỗi tài khoản Zalo thuộc về một nhân viên
--
-- Trước: ai đăng nhập CRM cũng gửi được từ mọi tài khoản Zalo cá nhân.
-- Nay  : tài khoản Zalo khớp với nhân viên qua SỐ ĐIỆN THOẠI —
--        users.phone == số của chính tài khoản Zalo đó.
--
-- Số của tài khoản Zalo do máy công ty báo lên (fetchAccountInfo), không nhập tay,
-- nên không gán nhầm được.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE zalo_oa_accounts
  -- Số của CHÍNH tài khoản Zalo đang đăng nhập, máy công ty tự báo
  ADD COLUMN IF NOT EXISTS account_phone TEXT,
  -- Nhân viên sở hữu, khớp tự động theo số
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 'owner' = chỉ chủ tài khoản (và admin) dùng được
  -- 'team'  = mở cho mọi nhân viên, dùng cho số tổng đài dùng chung
  ADD COLUMN IF NOT EXISTS share_mode TEXT NOT NULL DEFAULT 'owner';

DO $$ BEGIN
  ALTER TABLE zalo_oa_accounts
    ADD CONSTRAINT zalo_oa_accounts_share_mode_chk
    CHECK (share_mode IN ('owner', 'team'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_zalo_oa_accounts_owner
  ON zalo_oa_accounts(owner_user_id) WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zalo_oa_accounts_account_phone
  ON zalo_oa_accounts(account_phone) WHERE account_phone IS NOT NULL;

-- Tra ngược nhân viên theo số, dùng khi máy công ty báo số lên.
-- Dữ liệu users.phone có cả rác (email lọt vào cột phone) nên phải lọc.
CREATE INDEX IF NOT EXISTS idx_users_phone_normalized
  ON users (zalo_normalize_phone(phone))
  WHERE phone IS NOT NULL AND btrim(phone) <> '';
