-- Reactions & recall — chạy trên Supabase project TRÙNG với SUPABASE_URL của backend.
-- Nếu đã có bảng messenger_group_messages (chat đang hoạt động): chỉ cần phần ALTER bên dưới.

ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]'::jsonb;

ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messenger_group_messages_active
  ON messenger_group_messages (group_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messenger_group_messages_reactions
  ON messenger_group_messages USING GIN (reactions);
