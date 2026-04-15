-- Nhóm chat nội bộ (Messenger) — KHÔNG gắn crm_leads / Deal

CREATE TABLE IF NOT EXISTS messenger_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messenger_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- leader | deputy | member
  added_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS messenger_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  message_type TEXT DEFAULT 'text',
  attachments JSONB,
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_size INTEGER,
  attachment_mime TEXT,
  reply_to UUID REFERENCES messenger_group_messages(id) ON DELETE SET NULL,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messenger_group_members_gid ON messenger_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_messenger_group_members_uid ON messenger_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messenger_group_messages_gid ON messenger_group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_messenger_group_messages_created ON messenger_group_messages(group_id, created_at);

ALTER TABLE messenger_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messenger_groups_all" ON messenger_groups;
CREATE POLICY "messenger_groups_all" ON messenger_groups FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "messenger_group_members_all" ON messenger_group_members;
CREATE POLICY "messenger_group_members_all" ON messenger_group_members FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "messenger_group_messages_all" ON messenger_group_messages;
CREATE POLICY "messenger_group_messages_all" ON messenger_group_messages FOR ALL USING (true) WITH CHECK (true);
