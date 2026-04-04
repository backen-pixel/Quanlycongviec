-- 22_lead_members_chat.sql
-- Thành viên tham gia Lead/Deal + Chat realtime

-- 1. Bảng thành viên tham gia Lead/Deal
CREATE TABLE IF NOT EXISTS lead_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- owner | member | viewer
  added_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, user_id)
);

-- 2. Bảng tin nhắn trao đổi trong Lead/Deal
CREATE TABLE IF NOT EXISTS lead_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  message_type TEXT DEFAULT 'text', -- text | file | image | video | audio | system
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_size INTEGER,
  attachment_mime TEXT,
  reply_to UUID REFERENCES lead_messages(id) ON DELETE SET NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Bảng cảm xúc (reactions)
CREATE TABLE IF NOT EXISTS lead_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES lead_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_members_lead ON lead_members(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_members_user ON lead_members(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_messages_lead ON lead_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_messages_created ON lead_messages(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_msg_reactions ON lead_message_reactions(message_id);

-- RLS
ALTER TABLE lead_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_members_all" ON lead_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "lead_messages_all" ON lead_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "lead_msg_reactions_all" ON lead_message_reactions FOR ALL USING (true) WITH CHECK (true);
