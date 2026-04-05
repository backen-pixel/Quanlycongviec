-- 43: Department message reactions (emoji reactions cho chat phòng ban)
CREATE TABLE IF NOT EXISTS department_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES department_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dept_msg_reactions_message ON department_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_dept_msg_reactions_user ON department_message_reactions(user_id);

-- RLS
ALTER TABLE department_message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dept_msg_reactions_all" ON department_message_reactions FOR ALL USING (true) WITH CHECK (true);
