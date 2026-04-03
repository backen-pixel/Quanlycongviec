-- 22_fix_duplicate_messages.sql
-- Thêm UNIQUE constraint cho fb_message_id để chống duplicate messages

-- Tạo unique index (partial — chỉ cho non-null fb_message_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_messages_fb_message_id 
  ON facebook_messages (fb_message_id) 
  WHERE fb_message_id IS NOT NULL;
