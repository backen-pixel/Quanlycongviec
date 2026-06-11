-- Mỗi cấu hình Zalo OA có token trigger n8n riêng

ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS n8n_trigger_token TEXT;

UPDATE zalo_oa_accounts
SET n8n_trigger_token = replace(gen_random_uuid()::text, '-', '')
WHERE n8n_trigger_token IS NULL OR trim(n8n_trigger_token) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_zalo_oa_n8n_trigger_token
  ON zalo_oa_accounts (n8n_trigger_token)
  WHERE n8n_trigger_token IS NOT NULL;

COMMENT ON COLUMN zalo_oa_accounts.n8n_trigger_token IS
  'Token riêng OA — dùng trong path webhook n8n và callback CRM /integrations/n8n/o/:token/...';
