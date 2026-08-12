-- 511_crm_daily_report_extra_metrics.sql
-- Thêm hạng mục: sự kiện, tương tác, chuyển đổi lead/deal (UUID cố định).
BEGIN;

INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'work', 'Số sự kiện trong ngày', 7, 'events_count'),
  ('a1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'work', 'Tương tác Lead/Deal', 8, 'interactions'),
  ('a1000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000001', 'work', 'Chuyển đổi cột Lead/Deal', 9, 'stage_moves'),
  ('a1000000-0000-4000-8000-000000000021', 'a1000000-0000-4000-8000-000000000002', 'work', 'Số sự kiện trong ngày', 8, 'events_count'),
  ('a1000000-0000-4000-8000-000000000022', 'a1000000-0000-4000-8000-000000000002', 'work', 'Tương tác Lead/Deal', 9, 'interactions'),
  ('a1000000-0000-4000-8000-000000000023', 'a1000000-0000-4000-8000-000000000002', 'work', 'Chuyển đổi cột Lead/Deal', 10, 'stage_moves')
ON CONFLICT (id) DO NOTHING;

-- Nếu đã seed bằng UUID random trước đó, dọn bản trùng metric_key (giữ UUID cố định)
DELETE FROM crm_daily_report_template_items t
WHERE t.metric_key IN ('events_count', 'interactions', 'stage_moves')
  AND t.id NOT IN (
    'a1000000-0000-4000-8000-000000000011',
    'a1000000-0000-4000-8000-000000000012',
    'a1000000-0000-4000-8000-000000000013',
    'a1000000-0000-4000-8000-000000000021',
    'a1000000-0000-4000-8000-000000000022',
    'a1000000-0000-4000-8000-000000000023'
  );

COMMIT;
