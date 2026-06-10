-- Zalo OA: refresh token + thời hạn access/refresh (access ~25h, refresh ~3 tháng, rotate mỗi lần refresh)
ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS refresh_token TEXT;

ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ;

ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;

ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS token_refreshed_at TIMESTAMPTZ;

ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS last_token_error TEXT;

CREATE INDEX IF NOT EXISTS idx_zalo_oa_accounts_token_refresh
  ON zalo_oa_accounts (is_active, access_token_expires_at)
  WHERE is_active = true;
