-- Migration 39: thu hồi tin nhắn + thả cảm xúc cho messenger nhóm
-- Chạy trên Supabase SQL Editor (idempotent — chạy lại không lỗi).

-- 1) Cờ "đã thu hồi" trên từng tin nhắn ----------------------------------
ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS is_recalled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS recalled_at TIMESTAMPTZ;

-- 2) Bảng cảm xúc (mỗi message + user + emoji là 1 hàng) ----------------
CREATE TABLE IF NOT EXISTS messenger_message_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES messenger_group_messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_mmr_message ON messenger_message_reactions (message_id);
CREATE INDEX IF NOT EXISTS idx_mmr_user    ON messenger_message_reactions (user_id);

-- 3) RLS (Supabase) — cho phép thành viên nhóm đọc/ghi reaction
ALTER TABLE messenger_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mmr_select ON messenger_message_reactions;
CREATE POLICY mmr_select ON messenger_message_reactions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS mmr_insert ON messenger_message_reactions;
CREATE POLICY mmr_insert ON messenger_message_reactions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS mmr_delete ON messenger_message_reactions;
CREATE POLICY mmr_delete ON messenger_message_reactions
  FOR DELETE USING (true);
