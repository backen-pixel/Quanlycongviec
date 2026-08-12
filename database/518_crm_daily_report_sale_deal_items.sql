-- 518: Sale-Deal — deal mới, tương tác KS, BG, HĐ, SX, VC/LĐ, HT, quá hạn
BEGIN;

-- Đảm bảo tên mẫu
UPDATE crm_daily_report_templates
SET
  role_key = 'sale_deal',
  name = 'Sale - Deal',
  description = 'Deal mới, tương tác KS (sự kiện có liên kết), báo giá → hoàn thành, quá hạn trong ngày',
  updated_at = NOW()
WHERE id = 'a1000000-0000-4000-8000-000000000003';

DELETE FROM crm_daily_report_template_items
WHERE template_id = 'a1000000-0000-4000-8000-000000000003'
  AND section = 'work';

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
  metric_key = EXCLUDED.metric_key,
  section = EXCLUDED.section;

COMMIT;
