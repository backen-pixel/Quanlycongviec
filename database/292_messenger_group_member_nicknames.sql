-- Biệt danh thành viên theo từng nhóm chat (tách biệt với biệt danh cá nhân / liên hệ).
CREATE TABLE IF NOT EXISTS messenger_group_member_nicknames (
  viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL CHECK (char_length(trim(nickname)) BETWEEN 1 AND 80),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_user_id, group_id, target_user_id),
  CHECK (viewer_user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_messenger_group_member_nicknames_viewer_group
  ON messenger_group_member_nicknames (viewer_user_id, group_id);

COMMENT ON TABLE messenger_group_member_nicknames IS
  'Biệt danh trong nhóm: viewer đặt nickname cho target chỉ trong group_id (không ảnh hưởng chat 1-1 / chat nhanh).';
