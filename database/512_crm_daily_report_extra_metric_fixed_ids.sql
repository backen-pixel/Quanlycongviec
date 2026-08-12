-- 512_crm_daily_report_extra_metric_fixed_ids.sql
-- Đồng bộ UUID hạng mục thêm (events/interactions/stage_moves) primary ↔ backup
-- để replication không 409 vì FK template_item_id lệch.

BEGIN;

DELETE FROM crm_daily_report_template_items
WHERE metric_key IN ('events_count', 'interactions', 'stage_moves');

INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'work', 'Số sự kiện trong ngày', 7, 'events_count'),
  ('a1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'work', 'Tương tác Lead/Deal', 8, 'interactions'),
  ('a1000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000001', 'work', 'Chuyển đổi cột Lead/Deal', 9, 'stage_moves'),
  ('a1000000-0000-4000-8000-000000000021', 'a1000000-0000-4000-8000-000000000002', 'work', 'Số sự kiện trong ngày', 8, 'events_count'),
  ('a1000000-0000-4000-8000-000000000022', 'a1000000-0000-4000-8000-000000000002', 'work', 'Tương tác Lead/Deal', 9, 'interactions'),
  ('a1000000-0000-4000-8000-000000000023', 'a1000000-0000-4000-8000-000000000002', 'work', 'Chuyển đổi cột Lead/Deal', 10, 'stage_moves')
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  order_index = EXCLUDED.order_index,
  metric_key = EXCLUDED.metric_key,
  section = EXCLUDED.section;

UPDATE crm_daily_report_lines l
SET metric_key = CASE
  WHEN l.label ILIKE '%sự kiện%' THEN 'events_count'
  WHEN l.label ILIKE '%tương tác%' THEN 'interactions'
  WHEN l.label ILIKE '%chuyển đổi%' OR l.label ILIKE '%chuyển cột%' THEN 'stage_moves'
  ELSE l.metric_key
END
WHERE l.metric_key IS NULL
  AND (
    l.label ILIKE '%sự kiện%'
    OR l.label ILIKE '%tương tác%'
    OR l.label ILIKE '%chuyển đổi%'
    OR l.label ILIKE '%chuyển cột%'
  );

UPDATE crm_daily_report_lines l
SET template_item_id = i.id
FROM crm_daily_reports r,
     crm_daily_report_template_items i
WHERE l.report_id = r.id
  AND i.template_id = r.template_id
  AND i.metric_key = l.metric_key
  AND l.metric_key IN ('events_count', 'interactions', 'stage_moves');

COMMIT;
