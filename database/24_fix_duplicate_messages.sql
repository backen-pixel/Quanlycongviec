-- Thêm unique constraint cho fb_message_id để tránh duplicate
-- Facebook gửi webhook 2 lần trong ~30ms → race condition

-- Xóa duplicate cũ trước (giữ record đầu tiên)
DELETE FROM facebook_messages a
USING facebook_messages b
WHERE a.id > b.id
AND a.fb_message_id = b.fb_message_id
AND a.fb_message_id IS NOT NULL;

-- Tạo unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_messages_fb_message_id 
ON facebook_messages(fb_message_id) 
WHERE fb_message_id IS NOT NULL;
