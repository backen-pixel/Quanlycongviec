  -- 507_ai_bot_user_skills.sql
  -- Kỹ năng / tự động hóa do user dạy bot qua chat (gắn với lịch ai_chat_bot_schedules).
  -- Idempotent.

  BEGIN;

  CREATE TABLE IF NOT EXISTS ai_bot_user_skills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    skill_type      TEXT NOT NULL DEFAULT 'scheduled_report'
      CHECK (skill_type IN ('scheduled_report', 'preference', 'instruction')),

    title           TEXT NOT NULL,
    summary         TEXT,
    -- Cấu hình đầy đủ: report_type, company_id, department_id, run_times, channel, time_scope…
    config          JSONB NOT NULL DEFAULT '{}',

    schedule_id     UUID REFERENCES ai_chat_bot_schedules(id) ON DELETE SET NULL,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    source          TEXT NOT NULL DEFAULT 'user_chat'
      CHECK (source IN ('user_chat', 'admin_ui', 'derived')),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_ai_bot_skills_user ON ai_bot_user_skills(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_bot_skills_schedule ON ai_bot_user_skills(schedule_id);

  COMMENT ON TABLE ai_bot_user_skills IS
    'Kỹ năng bot học từ user: lịch báo cáo tự động, sở thích, hướng dẫn lặp lại.';

  -- Mở rộng fact_type cho bộ nhớ ngắn (preference/automation snippet)
  ALTER TABLE ai_chat_bot_user_facts
    DROP CONSTRAINT IF EXISTS ai_chat_bot_user_facts_fact_type_check;

  ALTER TABLE ai_chat_bot_user_facts
    ADD CONSTRAINT ai_chat_bot_user_facts_fact_type_check
    CHECK (fact_type IN ('habit', 'preference', 'context', 'correction', 'automation'));

  -- Playbook + data_source: báo cáo công ty / tổ chức gửi thẳng (không menu)
  ALTER TABLE ai_chat_bot_playbooks
    DROP CONSTRAINT IF EXISTS ai_chat_bot_playbooks_data_source_check;

  ALTER TABLE ai_chat_bot_playbooks
    ADD CONSTRAINT ai_chat_bot_playbooks_data_source_check
    CHECK (data_source IN (
      'channel_context', 'kpi', 'none', 'company_report',
      'company_daily', 'org_overview'
    ));

  INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, max_tokens, temperature, is_builtin, enabled)
  SELECT 'company_daily_report',
        'Báo cáo công ty (tự động)',
        'Gửi báo cáo nhanh lead/deal/thắng/thua theo kỳ — dùng cho lịch tự động (không menu).',
        '📊',
        'company_daily',
        'Playbook dành cho lịch tự động — nội dung do hệ thống format sẵn từ format_company_report_text.',
        100, 0.1, false, true
  WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'company_daily_report');

  INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, max_tokens, temperature, is_builtin, enabled)
  SELECT 'org_overview_report',
        'Báo cáo tổ chức (tự động)',
        'Gửi BC tổ chức / doanh thu / conversion — khớp trang org overview.',
        '📈',
        'org_overview',
        'Playbook dành cho lịch tự động — nội dung do format_org_overview_report_text sinh ra.',
        100, 0.1, false, true
  WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'org_overview_report');

  COMMIT;
