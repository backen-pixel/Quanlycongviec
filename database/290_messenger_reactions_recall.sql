-- Reactions & recall cho Messenger nội bộ
-- Yêu cầu: đã chạy 65_messenger_groups.sql (bảng messenger_group_messages phải tồn tại)
-- Chạy TOÀN BỘ file này trong Supabase SQL Editor (một lần).

ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]'::jsonb;

ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_messenger_group_messages_active
  ON messenger_group_messages(group_id, created_at)
  WHERE deleted_at IS NULL;
