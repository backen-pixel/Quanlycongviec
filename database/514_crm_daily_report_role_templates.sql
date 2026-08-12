-- 514_crm_daily_report_role_templates.sql
-- Sale Admin = 6 mục Lead; Sale-Deal = luồng Deal (KS → BG → HĐ → SX → VC/LĐ → HT).
BEGIN;

-- Template Sale - Deal
INSERT INTO crm_daily_report_templates (id, company_id, role_key, name, description, has_sharpen_section, is_active)
VALUES (
  'a1000000-0000-4000-8000-000000000003',
  NULL,
  'sale_deal',
  'Sale - Deal',
  'Báo cáo ngày theo luồng Deal: khảo sát, báo giá, hợp đồng, sản xuất, VC/LĐ, hoàn thành',
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  role_key = EXCLUDED.role_key,
  has_sharpen_section = true,
  is_active = true;

-- Dọn hạng mục thừa khỏi Sale Admin (chỉ giữ 6 Lead gốc)
DELETE FROM crm_daily_report_template_items
WHERE template_id = 'a1000000-0000-4000-8000-000000000001'
  AND section = 'work'
  AND metric_key IN (
    'events_count', 'interactions', 'stage_moves',
    'deal_new', 'deal_interactions', 'deal_stage_moves'
  );

-- Đảm bảo 6 mục Lead Sale Admin đúng thứ tự
UPDATE crm_daily_report_template_items SET order_index = 1, label = 'Lead mới tiếp nhận'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND metric_key = 'lead_new';
UPDATE crm_daily_report_template_items SET order_index = 2, label = 'Liên hệ khách không trả lời'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND metric_key = 'not_contacted';
UPDATE crm_daily_report_template_items SET order_index = 3, label = 'Chăm lại Lead Cold'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND metric_key = 'care_cold';
UPDATE crm_daily_report_template_items SET order_index = 4, label = 'Chăm lại Lead Warm'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND metric_key = 'care_warm';
UPDATE crm_daily_report_template_items SET order_index = 5, label = 'Chăm lại Lead Hot'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND metric_key = 'care_hot';
UPDATE crm_daily_report_template_items SET order_index = 6, label = 'Chốt khách khảo sát'
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND metric_key = 'survey_scheduled';

-- Work items Sale-Deal
DELETE FROM crm_daily_report_template_items
WHERE template_id = 'a1000000-0000-4000-8000-000000000003' AND section = 'work';

INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000071', 'a1000000-0000-4000-8000-000000000003', 'work', 'Deal mới tiếp nhận', 1, 'deal_new'),
  ('a1000000-0000-4000-8000-000000000072', 'a1000000-0000-4000-8000-000000000003', 'work', 'Deal tương tác (Khảo sát)', 2, 'deal_interact'),
  ('a1000000-0000-4000-8000-000000000073', 'a1000000-0000-4000-8000-000000000003', 'work', 'Báo giá', 3, 'deal_to_quote'),
  ('a1000000-0000-4000-8000-000000000074', 'a1000000-0000-4000-8000-000000000003', 'work', 'Hợp đồng', 4, 'deal_to_contract'),
  ('a1000000-0000-4000-8000-000000000075', 'a1000000-0000-4000-8000-000000000003', 'work', 'Sản xuất', 5, 'deal_producing'),
  ('a1000000-0000-4000-8000-000000000076', 'a1000000-0000-4000-8000-000000000003', 'work', 'VC / Lắp đặt', 6, 'deal_installing'),
  ('a1000000-0000-4000-8000-000000000077', 'a1000000-0000-4000-8000-000000000003', 'work', 'Hoàn thành', 7, 'deal_completed'),
  ('a1000000-0000-4000-8000-000000000078', 'a1000000-0000-4000-8000-000000000003', 'work', 'Quá hạn trong ngày', 8, 'deal_overdue')
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  order_index = EXCLUDED.order_index,
  metric_key = EXCLUDED.metric_key;

-- Mài dao + Đề xuất cho Sale-Deal
DELETE FROM crm_daily_report_template_items
WHERE template_id = 'a1000000-0000-4000-8000-000000000003'
  AND section IN ('sharpen', 'proposal');

INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000081', 'a1000000-0000-4000-8000-000000000003', 'sharpen', 'Học / đào tạo nội bộ', 1, NULL),
  ('a1000000-0000-4000-8000-000000000082', 'a1000000-0000-4000-8000-000000000003', 'sharpen', 'Cải tiến quy trình / tool', 2, NULL),
  ('a1000000-0000-4000-8000-000000000083', 'a1000000-0000-4000-8000-000000000003', 'sharpen', 'Khác (ghi chú)', 3, NULL),
  ('a1000000-0000-4000-8000-000000000091', 'a1000000-0000-4000-8000-000000000003', 'proposal', 'Về trí lực', 1, NULL),
  ('a1000000-0000-4000-8000-000000000092', 'a1000000-0000-4000-8000-000000000003', 'proposal', 'Về nguồn lực', 2, NULL),
  ('a1000000-0000-4000-8000-000000000093', 'a1000000-0000-4000-8000-000000000003', 'proposal', 'Về sức lực', 3, NULL)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, order_index = EXCLUDED.order_index;

COMMIT;
