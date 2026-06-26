-- Bổ sung thiết bị + vị trí cho user_activity_log (nhật ký hoạt động / giám sát)
BEGIN;

ALTER TABLE IF EXISTS user_activity_log
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS device_name TEXT,
  ADD COLUMN IF NOT EXISTS geo_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geo_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geo_address TEXT;

CREATE INDEX IF NOT EXISTS idx_user_activity_device_time
  ON user_activity_log (device_id, created_at DESC)
  WHERE device_id IS NOT NULL;

COMMENT ON COLUMN user_activity_log.device_id IS 'ID thiết bị (web/mobile) tại thời điểm ghi log';
COMMENT ON COLUMN user_activity_log.geo_address IS 'Địa chỉ reverse-geocode hoặc từ client';

COMMIT;
