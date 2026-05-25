-- 236_ai_chat_bot_user_facts.sql
-- Trí nhớ dài hạn cho AI Chat Bot: insight rút từ user_activity_log (cron đêm).
-- Mỗi chat mới inject top facts vào prompt → AI "nhớ" thói quen user.
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_chat_bot_user_facts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  fact_type     TEXT NOT NULL CHECK (fact_type IN ('habit', 'preference', 'context', 'correction')),
  fact          TEXT NOT NULL,
  confidence    REAL NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  source        TEXT NOT NULL DEFAULT 'derived_from_activity',
  evidence      JSONB,

  hits          INT NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_user_facts_user_source_fact
  ON ai_chat_bot_user_facts (user_id, source, fact);

CREATE INDEX IF NOT EXISTS idx_ai_user_facts_user_conf
  ON ai_chat_bot_user_facts (user_id, confidence DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_user_facts_source
  ON ai_chat_bot_user_facts (source);

COMMENT ON TABLE ai_chat_bot_user_facts IS
  'Fact đã học về từng user (thói quen CRM, filter hay dùng, ngữ cảnh gần nhất). Cron rebuild từ activity log.';

COMMENT ON COLUMN ai_chat_bot_user_facts.fact_type IS
  'habit=thói quen, preference=sở thích/lọc hay dùng, context=ngữ cảnh gần đây, correction=user dạy/sửa bot';

COMMENT ON COLUMN ai_chat_bot_user_facts.source IS
  'derived_from_activity | gpt_derived | user_taught | feedback';

ALTER TABLE ai_chat_bot_user_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_chat_bot_user_facts_all ON ai_chat_bot_user_facts;
CREATE POLICY ai_chat_bot_user_facts_all ON ai_chat_bot_user_facts FOR ALL USING (true) WITH CHECK (true);

COMMIT;
