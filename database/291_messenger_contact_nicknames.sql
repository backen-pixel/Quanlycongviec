-- Biệt danh liên hệ Messenger: mỗi user đặt tên riêng cho đồng nghiệp (DM + hiển thị trong nhóm).
CREATE TABLE IF NOT EXISTS messenger_contact_nicknames (
  viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL CHECK (char_length(trim(nickname)) BETWEEN 1 AND 80),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_user_id, target_user_id),
  CHECK (viewer_user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_messenger_contact_nicknames_viewer
  ON messenger_contact_nicknames (viewer_user_id);

COMMENT ON TABLE messenger_contact_nicknames IS
  'Biệt danh cá nhân/liên hệ: viewer đặt nickname cho target (chat 1-1, chat nhanh). Không dùng trong nhóm chat.';
