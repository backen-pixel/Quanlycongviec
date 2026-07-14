-- 418: Hình nền chat messenger — đồng bộ web ↔ app (theo từng user + nhóm).
CREATE TABLE IF NOT EXISTS messenger_chat_wallpapers (
  viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
  wallpaper_url TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_messenger_chat_wallpapers_group
  ON messenger_chat_wallpapers (group_id);

COMMENT ON TABLE messenger_chat_wallpapers IS
  'Hình nền đoạn chat theo từng người xem — URL ảnh public; NULL = nền mặc định';
