-- Webhook n8n riêng: workflow lấy tên/avatar khách Zalo (gọi callback CRM)

ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS n8n_sync_profile_webhook_url TEXT;

COMMENT ON COLUMN zalo_oa_accounts.n8n_sync_profile_webhook_url IS
  'POST khi cần lấy tên KH (tên tạm / thiếu). Payload event=zalo_sync_profile_request + actions.sync_profile.';
