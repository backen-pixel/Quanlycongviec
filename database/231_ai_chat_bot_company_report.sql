-- 231_ai_chat_bot_company_report.sql
-- Mở rộng AI Chat Bot: báo cáo công ty interactive (menu + hỏi đáp 2-way).
-- Idempotent — an toàn chạy lại.

-- ───────────────────────── 1) Cột mới trên ai_chat_bot_schedules ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'time_scope'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN time_scope TEXT NOT NULL DEFAULT 'today'
        CHECK (time_scope IN ('today', 'yesterday', 'last_7d', 'custom'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'time_scope_days_offset'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN time_scope_days_offset INT NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'company_whitelist'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN company_whitelist UUID[] DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'conversation_enabled'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN conversation_enabled BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'conversation_ttl_minutes'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN conversation_ttl_minutes INT NOT NULL DEFAULT 60;
  END IF;
END $$;

COMMENT ON COLUMN ai_chat_bot_schedules.time_scope IS 'Kỳ báo cáo mặc định: today | yesterday | last_7d | custom';
COMMENT ON COLUMN ai_chat_bot_schedules.time_scope_days_offset IS 'Khi time_scope=custom: số ngày lùi từ hôm nay (0=hôm nay, 1=hôm qua, …)';
COMMENT ON COLUMN ai_chat_bot_schedules.company_whitelist IS 'NULL = mọi công ty active; có giá trị = chỉ các công ty trong danh sách';
COMMENT ON COLUMN ai_chat_bot_schedules.conversation_enabled IS 'Bật chế độ hỏi đáp 2-way sau khi bot post menu (group)';
COMMENT ON COLUMN ai_chat_bot_schedules.conversation_ttl_minutes IS 'Thời gian conversation group còn hiệu lực sau menu (phút)';

-- ───────────────────────── 2) Mở rộng data_source trên playbooks ─────────────────────────
-- Postgres CHECK không sửa trực tiếp — drop + add lại.
ALTER TABLE ai_chat_bot_playbooks
  DROP CONSTRAINT IF EXISTS ai_chat_bot_playbooks_data_source_check;

ALTER TABLE ai_chat_bot_playbooks
  ADD CONSTRAINT ai_chat_bot_playbooks_data_source_check
  CHECK (data_source IN ('channel_context', 'kpi', 'none', 'company_report'));

-- ───────────────────────── 3) Bảng conversation state (group) ─────────────────────────
CREATE TABLE IF NOT EXISTS ai_chat_bot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES ai_chat_bot_schedules(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('department', 'group')),
  channel_id UUID NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_message_id UUID,
  last_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_channel_expires
  ON ai_chat_bot_conversations(channel_type, channel_id, expires_at DESC)
  WHERE closed = false;

CREATE INDEX IF NOT EXISTS idx_ai_conv_schedule
  ON ai_chat_bot_conversations(schedule_id);

ALTER TABLE ai_chat_bot_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_chat_bot_conversations_all" ON ai_chat_bot_conversations;
CREATE POLICY "ai_chat_bot_conversations_all" ON ai_chat_bot_conversations FOR ALL USING (true) WITH CHECK (true);

-- ───────────────────────── 4) Seed playbook company_report_menu ─────────────────────────
INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, max_tokens, temperature, is_builtin, enabled)
SELECT 'company_report_menu',
       'Báo cáo công ty (menu + hỏi đáp)',
       '16h30 post menu chọn công ty → sếp trả lời số/tên → AI báo cáo lead/deal/nhân viên theo kỳ.',
       '📊',
       'company_report',
       'Bạn đang mở menu báo cáo công ty cho lãnh đạo.
Nếu context_pack.companies có >1 công ty: liệt kê menu đánh số 1..N và dòng cuối "N+1) Tất cả".
Nếu chỉ 1 công ty: bỏ menu, gọi tools và trả báo cáo luôn.
Mỗi dòng menu: "<số>) <short_name>".
Kết thúc bằng: "(Trả lời số hoặc gõ tên công ty)".
KHÔNG bịa số liệu — menu chỉ dùng tên công ty từ context_pack.companies.',
       900, 0.45, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'company_report_menu');
