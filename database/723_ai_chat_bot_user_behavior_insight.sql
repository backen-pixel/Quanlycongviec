-- 723_ai_chat_bot_user_behavior_insight.sql
-- Thêm data_source 'user_behavior_insight' cho AI Chat Bot: báo cáo hành vi & khó khăn người
-- dùng hằng ngày (idle theo path, trợ lý báo lỗi/hỏi lặp lại, việc quá hạn), kèm file PDF.
-- KHÔNG qua LLM — số liệu lấy thẳng từ userBehaviorInsight.js, xử lý trong
-- backend/src/helpers/aiBotSender.js (nhánh dsAuto === 'user_behavior_insight').
-- Gửi riêng 1 người dùng cơ chế "1 người cụ thể" đã có sẵn trong AiChatBotSettingsPage.jsx
-- (channel_type='user' → fan-out qua DM, xem aiBotSender.js dòng ~1171-1218).
--
-- Idempotent — an toàn chạy lại.

ALTER TABLE ai_chat_bot_playbooks
  DROP CONSTRAINT IF EXISTS ai_chat_bot_playbooks_data_source_check;

ALTER TABLE ai_chat_bot_playbooks
  ADD CONSTRAINT ai_chat_bot_playbooks_data_source_check
  CHECK (data_source IN (
    'channel_context', 'kpi', 'none', 'company_report',
    'company_daily', 'org_overview', 'reminder', 'user_behavior_insight'
  ));

INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, max_tokens, temperature, is_builtin, enabled)
SELECT 'user_behavior_insight_daily',
       'Báo cáo hành vi & khó khăn người dùng (PDF)',
       'Gửi hằng ngày: thời gian thao tác/chờ, khó khăn khi hỏi trợ lý, việc quá hạn — theo từng nhân viên, kèm file PDF. Không qua AI, số liệu lấy trực tiếp.',
       '📊',
       'user_behavior_insight',
       'Không dùng — data_source=user_behavior_insight bỏ qua bước gọi LLM, nội dung do code sinh trực tiếp.',
       1, 0, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'user_behavior_insight_daily');

COMMENT ON COLUMN ai_chat_bot_playbooks.data_source IS
  'channel_context | kpi | none | company_report | company_daily | org_overview | reminder | user_behavior_insight';
