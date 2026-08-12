-- 510_crm_daily_report_metric_key.sql
-- Gắn metric_key để auto-chốt kết quả chiều từ CRM.
BEGIN;

ALTER TABLE crm_daily_report_template_items
  ADD COLUMN IF NOT EXISTS metric_key TEXT;

ALTER TABLE crm_daily_report_lines
  ADD COLUMN IF NOT EXISTS metric_key TEXT;

ALTER TABLE crm_daily_report_lines
  ADD COLUMN IF NOT EXISTS auto_result BOOLEAN NOT NULL DEFAULT false;

-- Sale Admin
UPDATE crm_daily_report_template_items SET metric_key = 'lead_new'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND label = 'Lead mới tiếp nhận';
UPDATE crm_daily_report_template_items SET metric_key = 'not_contacted'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND label = 'Liên hệ khách không trả lời';
UPDATE crm_daily_report_template_items SET metric_key = 'care_cold'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND label = 'Chăm lại Lead Cold';
UPDATE crm_daily_report_template_items SET metric_key = 'care_warm'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND label = 'Chăm lại Lead Warm';
UPDATE crm_daily_report_template_items SET metric_key = 'care_hot'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND label = 'Chăm lại Lead Hot';
UPDATE crm_daily_report_template_items SET metric_key = 'survey_scheduled'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND label = 'Chốt khách khảo sát';

-- Thiết kế - Khảo sát (chỉ các hạng mục auto được)
UPDATE crm_daily_report_template_items SET metric_key = 'survey_event'
WHERE template_id = 'a1000000-0000-4000-8000-000000000002' AND label = 'Khảo sát';
UPDATE crm_daily_report_template_items SET metric_key = 'install_follow'
WHERE template_id = 'a1000000-0000-4000-8000-000000000002' AND label = 'Theo dõi Lắp đặt';

COMMIT;
