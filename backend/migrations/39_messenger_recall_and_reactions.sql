-- Migration 39: thu hồi tin nhắn + thả cảm xúc cho messenger nhóm
-- Áp dụng idempotent — chạy lại không lỗi.

-- 1) Cờ "đã thu hồi" trên từng tin nhắn ----------------------------------
ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS is_recalled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS recalled_at TIMESTAMPTZ;

-- 2) Bảng cảm xúc (mỗi (message, user, emoji) là 1 hàng) ----------------
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
