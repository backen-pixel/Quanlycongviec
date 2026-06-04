-- @mention trong chat nhóm Messenger
ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS mention_user_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN messenger_group_messages.mention_user_ids IS 'Danh sách user_id được @ trong tin nhắn';
