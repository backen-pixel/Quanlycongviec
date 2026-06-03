-- Thu hồi tin nhắn + cảm xúc (reactions) cho messenger group chat
ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS recalled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recalled_by UUID REFERENCES users(id);

-- Cột boolean tương thích (một số bản API cũ dùng is_recalled)
ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS is_recalled BOOLEAN NOT NULL DEFAULT false;

UPDATE messenger_group_messages
  SET is_recalled = true
  WHERE recalled_at IS NOT NULL AND is_recalled = false;

CREATE TABLE IF NOT EXISTS messenger_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messenger_group_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) <= 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_messenger_reactions_message
  ON messenger_message_reactions (message_id);

-- Reload PostgREST schema cache (Supabase)
NOTIFY pgrst, 'reload schema';
