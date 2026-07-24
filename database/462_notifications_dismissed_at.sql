-- 462: Thêm cột dismissed_at cho notifications — hỗ trợ "Bỏ qua" thông báo không quan tâm.
-- Tin có dismissed_at IS NOT NULL sẽ bị ẩn khỏi Trung tâm thông báo và không tính vào badge.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dismissed_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_not_dismissed
  ON notifications (user_id, created_at DESC)
  WHERE dismissed_at IS NULL;
