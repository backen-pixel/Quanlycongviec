-- Mốc cập nhật cài đặt Page FB (token + cấu hình) — nhắc làm mới access token sau 30 ngày.

ALTER TABLE facebook_pages
  ADD COLUMN IF NOT EXISTS settings_updated_at TIMESTAMPTZ;

UPDATE facebook_pages
SET settings_updated_at = COALESCE(updated_at, created_at, now())
WHERE settings_updated_at IS NULL;

COMMENT ON COLUMN facebook_pages.settings_updated_at IS
  'Thời điểm lưu cài đặt/token Page. UI đếm ngược 30 ngày và nhắc cập nhật access token.';
