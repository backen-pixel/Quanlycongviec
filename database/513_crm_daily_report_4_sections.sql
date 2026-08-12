-- 513_crm_daily_report_4_sections.sql
-- Cấu trúc 4 phần Excel: work / sharpen / proposal + hạng mục Deal.
BEGIN;

-- Cho phép section proposal
ALTER TABLE crm_daily_report_template_items DROP CONSTRAINT IF EXISTS crm_daily_report_template_items_section_check;
ALTER TABLE crm_daily_report_template_items
  ADD CONSTRAINT crm_daily_report_template_items_section_check
  CHECK (section IN ('work', 'sharpen', 'proposal'));

ALTER TABLE crm_daily_report_lines DROP CONSTRAINT IF EXISTS crm_daily_report_lines_section_check;
ALTER TABLE crm_daily_report_lines
  ADD CONSTRAINT crm_daily_report_lines_section_check
  CHECK (section IN ('work', 'sharpen', 'proposal'));

UPDATE crm_daily_report_templates
SET has_sharpen_section = true, updated_at = now()
WHERE id = 'a1000000-0000-4000-8000-000000000001';

-- Deal metrics (Sale Admin)
INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000014', 'a1000000-0000-4000-8000-000000000001', 'work', 'Deal mới / tiếp nhận', 10, 'deal_new'),
  ('a1000000-0000-4000-8000-000000000015', 'a1000000-0000-4000-8000-000000000001', 'work', 'Tương tác Deal', 11, 'deal_interactions'),
  ('a1000000-0000-4000-8000-000000000016', 'a1000000-0000-4000-8000-000000000001', 'work', 'Chuyển đổi cột Deal', 12, 'deal_stage_moves')
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  order_index = EXCLUDED.order_index,
  metric_key = EXCLUDED.metric_key;

-- Deal metrics (Design) — optional useful
INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000024', 'a1000000-0000-4000-8000-000000000002', 'work', 'Deal mới / tiếp nhận', 11, 'deal_new'),
  ('a1000000-0000-4000-8000-000000000025', 'a1000000-0000-4000-8000-000000000002', 'work', 'Tương tác Deal', 12, 'deal_interactions'),
  ('a1000000-0000-4000-8000-000000000026', 'a1000000-0000-4000-8000-000000000002', 'work', 'Chuyển đổi cột Deal', 13, 'deal_stage_moves')
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  order_index = EXCLUDED.order_index,
  metric_key = EXCLUDED.metric_key;

-- Mài dao Sale Admin (đúng mẫu Excel)
DELETE FROM crm_daily_report_template_items
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND section = 'sharpen';

INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000031', 'a1000000-0000-4000-8000-000000000001', 'sharpen', 'Học sử dụng phần mềm CRM & quản lý Lead', 1, NULL),
  ('a1000000-0000-4000-8000-000000000032', 'a1000000-0000-4000-8000-000000000001', 'sharpen', 'Học sản phẩm tủ bếp Inox', 2, NULL),
  ('a1000000-0000-4000-8000-000000000033', 'a1000000-0000-4000-8000-000000000001', 'sharpen', 'Rèn kỹ năng gọi điện - chăm sóc khách hàng', 3, NULL)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, order_index = EXCLUDED.order_index;

-- Mài dao Design — chuẩn hoá nếu còn generic
DELETE FROM crm_daily_report_template_items
WHERE template_id = 'a1000000-0000-4000-8000-000000000002'
  AND section = 'sharpen'
  AND id NOT IN (
    'a1000000-0000-4000-8000-000000000041',
    'a1000000-0000-4000-8000-000000000042',
    'a1000000-0000-4000-8000-000000000043'
  );

INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000041', 'a1000000-0000-4000-8000-000000000002', 'sharpen', 'Học / đào tạo nội bộ', 1, NULL),
  ('a1000000-0000-4000-8000-000000000042', 'a1000000-0000-4000-8000-000000000002', 'sharpen', 'Cải tiến quy trình / tool', 2, NULL),
  ('a1000000-0000-4000-8000-000000000043', 'a1000000-0000-4000-8000-000000000002', 'sharpen', 'Khác (ghi chú)', 3, NULL)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, order_index = EXCLUDED.order_index;

-- Đề xuất (cả 2 template)
DELETE FROM crm_daily_report_template_items
WHERE section = 'proposal'
  AND template_id IN (
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002'
  );

INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000051', 'a1000000-0000-4000-8000-000000000001', 'proposal', 'Về trí lực', 1, NULL),
  ('a1000000-0000-4000-8000-000000000052', 'a1000000-0000-4000-8000-000000000001', 'proposal', 'Về nguồn lực', 2, NULL),
  ('a1000000-0000-4000-8000-000000000053', 'a1000000-0000-4000-8000-000000000001', 'proposal', 'Về sức lực', 3, NULL),
  ('a1000000-0000-4000-8000-000000000061', 'a1000000-0000-4000-8000-000000000002', 'proposal', 'Về trí lực', 1, NULL),
  ('a1000000-0000-4000-8000-000000000062', 'a1000000-0000-4000-8000-000000000002', 'proposal', 'Về nguồn lực', 2, NULL),
  ('a1000000-0000-4000-8000-000000000063', 'a1000000-0000-4000-8000-000000000002', 'proposal', 'Về sức lực', 3, NULL)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, order_index = EXCLUDED.order_index;

COMMIT;
