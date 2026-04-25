-- Giảm egress Facebook: đánh dấu contact đã đủ dữ liệu để bỏ qua sync sâu.
ALTER TABLE facebook_contacts
  ADD COLUMN IF NOT EXISTS sync_paused BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_pause_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_fb_contacts_sync_paused ON facebook_contacts(sync_paused);
COMMENT ON COLUMN facebook_contacts.sync_paused IS 'true = bỏ qua sync sâu/batch scan vì đã đủ dữ liệu hoặc đã tạo lead';
COMMENT ON COLUMN facebook_contacts.phone_resolved_at IS 'thời điểm đã lấy được số điện thoại hoặc dữ liệu đủ để tạo lead';
COMMENT ON COLUMN facebook_contacts.sync_pause_reason IS 'lý do dừng sync sâu: phone_resolved, lead_created, manual_pause';
