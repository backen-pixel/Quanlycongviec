-- 388: Ngữ cảnh hội thoại AI bot (session_context)
ALTER TABLE ai_chat_bot_conversations
  ADD COLUMN IF NOT EXISTS session_context JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN ai_chat_bot_conversations.session_context IS
  'Ngữ cảnh chat: subject_type, subject_name, subject_user_id, company_id, time_scope, date_from, date_to, period_label, last_request';
