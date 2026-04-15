-- Hoạt động online: client POST ping mỗi ~2 phút; last_ping_at > 2 phút coi offline
CREATE TABLE IF NOT EXISTS user_last_activity (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_ping_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_last_activity_ping ON user_last_activity (last_ping_at DESC);

-- Ghim hội thoại Messenger theo từng user (không dùng localStorage cho ghim)
CREATE TABLE IF NOT EXISTS messenger_user_pins (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_messenger_user_pins_user ON messenger_user_pins (user_id);

ALTER TABLE user_last_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_user_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_last_activity_all" ON user_last_activity;
CREATE POLICY "user_last_activity_all" ON user_last_activity FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "messenger_user_pins_all" ON messenger_user_pins;
CREATE POLICY "messenger_user_pins_all" ON messenger_user_pins FOR ALL USING (true) WITH CHECK (true);
