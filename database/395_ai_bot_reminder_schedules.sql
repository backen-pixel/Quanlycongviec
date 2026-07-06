-- 395: Lịch nhắc việc / thông báo tùy chỉnh (một lần, hàng ngày/tháng/năm)
BEGIN;

ALTER TABLE ai_chat_bot_schedules
  ADD COLUMN IF NOT EXISTS schedule_kind TEXT NOT NULL DEFAULT 'report'
    CHECK (schedule_kind IN ('report', 'reminder'));

ALTER TABLE ai_chat_bot_schedules
  ADD COLUMN IF NOT EXISTS reminder_text TEXT;

ALTER TABLE ai_chat_bot_schedules
  ADD COLUMN IF NOT EXISTS reminder_recurrence TEXT
    CHECK (reminder_recurrence IS NULL OR reminder_recurrence IN ('once', 'daily', 'monthly', 'yearly'));

ALTER TABLE ai_chat_bot_schedules
  ADD COLUMN IF NOT EXISTS run_once_date DATE;

ALTER TABLE ai_chat_bot_schedules
  ADD COLUMN IF NOT EXISTS recurrence_day SMALLINT
    CHECK (recurrence_day IS NULL OR (recurrence_day >= 1 AND recurrence_day <= 31));

ALTER TABLE ai_chat_bot_schedules
  ADD COLUMN IF NOT EXISTS recurrence_month SMALLINT
    CHECK (recurrence_month IS NULL OR (recurrence_month >= 1 AND recurrence_month <= 12));

COMMENT ON COLUMN ai_chat_bot_schedules.schedule_kind IS 'report = báo cáo CRM; reminder = nhắc việc/thông báo';
COMMENT ON COLUMN ai_chat_bot_schedules.reminder_text IS 'Nội dung tin nhắn nhắc';
COMMENT ON COLUMN ai_chat_bot_schedules.reminder_recurrence IS 'once | daily | monthly | yearly';
COMMENT ON COLUMN ai_chat_bot_schedules.run_once_date IS 'Ngày chạy một lần (giờ VN, theo run_slots)';

ALTER TABLE ai_chat_bot_playbooks
  DROP CONSTRAINT IF EXISTS ai_chat_bot_playbooks_data_source_check;

ALTER TABLE ai_chat_bot_playbooks
  ADD CONSTRAINT ai_chat_bot_playbooks_data_source_check
  CHECK (data_source IN (
    'channel_context', 'kpi', 'none', 'company_report',
    'company_daily', 'org_overview', 'reminder'
  ));

INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, max_tokens, temperature, is_builtin, enabled)
SELECT 'reminder_notify',
       'Nhắc việc / thông báo',
       'Gửi tin nhắc tùy chỉnh theo lịch — một lần hoặc lặp ngày/tháng/năm.',
       '🔔',
       'reminder',
       'Playbook nhắc việc — nội dung do reminder_text / custom_prompt, không qua OpenAI.',
       100, 0.1, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'reminder_notify');

COMMIT;
