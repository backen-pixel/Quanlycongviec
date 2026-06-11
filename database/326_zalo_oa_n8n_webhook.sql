-- Webhook outbound → n8n (hoặc automation khác) khi có tin Zalo inbound mới

ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS n8n_webhook_url TEXT;

COMMENT ON COLUMN zalo_oa_accounts.n8n_webhook_url IS
  'POST JSON khi khách nhắn OA (inbound). Dùng Webhook node n8n.';
