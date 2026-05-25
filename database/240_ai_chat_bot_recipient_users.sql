-- 240_ai_chat_bot_recipient_users.sql
-- Cho phép 1 lịch "1-1 cá nhân" chứa NHIỀU người nhận, bot tự fan-out DM riêng cho từng người.
--
-- recipient_user_ids:
--   NULL  → giữ logic cũ (channel_type + channel_id quyết định kênh).
--   array → bot bỏ qua channel_id, ensure DM với từng user trong list rồi gửi tin cá nhân hoá cho từng người.
--           Bắt buộc kèm personal_scope_only = true để dữ liệu cá nhân hoá theo người nhận.
--
-- Idempotent.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'recipient_user_ids'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN recipient_user_ids UUID[] DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN ai_chat_bot_schedules.recipient_user_ids IS
  'NULL = không fanout. Có giá trị = bot fan out DM riêng cho từng user, dữ liệu cá nhân hoá theo từng người (yêu cầu personal_scope_only=true).';
