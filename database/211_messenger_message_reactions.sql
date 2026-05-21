-- 211_messenger_message_reactions.sql
-- Cảm xúc (emoji) cho tin nhắn Messenger group; tương tự lead_message_reactions.
-- Một user có thể thả nhiều emoji khác nhau lên cùng 1 tin.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS messenger_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messenger_group_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_msg_reactions_message
  ON messenger_message_reactions(message_id);

CREATE INDEX IF NOT EXISTS idx_msg_reactions_user
  ON messenger_message_reactions(user_id);

ALTER TABLE messenger_message_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messenger_message_reactions'
      AND policyname = 'messenger_message_reactions_all'
  ) THEN
    EXECUTE 'CREATE POLICY messenger_message_reactions_all ON messenger_message_reactions FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMENT ON TABLE messenger_message_reactions IS
  'Thả cảm xúc trên tin nhắn Messenger group (multi emoji per user)';

COMMIT;
