-- 516_crm_daily_report_design_template.sql
-- Mẫu theo vai trò: Sale Admin / Thiết kế / Sale-Deal (đúng Excel).
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- DESIGN (a…0002): 7 mục work đúng Excel
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM crm_daily_report_template_items
WHERE template_id = 'a1000000-0000-4000-8000-000000000002' AND section = 'work';

INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000021', 'a1000000-0000-4000-8000-000000000002', 'work', 'Đi hỗ trợ tư vấn', 1, 'design_consult'),
  ('a1000000-0000-4000-8000-000000000022', 'a1000000-0000-4000-8000-000000000002', 'work', 'Thiết kế mới', 2, 'design_new'),
  ('a1000000-0000-4000-8000-000000000023', 'a1000000-0000-4000-8000-000000000002', 'work', 'Sửa thiết kế', 3, 'design_edit'),
  ('a1000000-0000-4000-8000-000000000027', 'a1000000-0000-4000-8000-000000000002', 'work', 'Thiết kế Concept', 4, 'design_concept'),
  ('a1000000-0000-4000-8000-000000000028', 'a1000000-0000-4000-8000-000000000002', 'work', 'Duyệt TK - về sản xuất - Đặt hàng', 5, 'design_approve'),
  ('a1000000-0000-4000-8000-000000000029', 'a1000000-0000-4000-8000-000000000002', 'work', 'Theo dõi Lắp đặt', 6, 'install_follow'),
  ('a1000000-0000-4000-8000-000000000030', 'a1000000-0000-4000-8000-000000000002', 'work', 'Khảo sát', 7, 'survey_event')
ON CONFLICT (id) DO UPDATE SET
  template_id = EXCLUDED.template_id,
  section = 'work',
  label = EXCLUDED.label,
  order_index = EXCLUDED.order_index,
  metric_key = EXCLUDED.metric_key;

-- Design III: dòng trống để ghi (Excel), UI có Thêm dòng
DELETE FROM crm_daily_report_template_items
WHERE template_id = 'a1000000-0000-4000-8000-000000000002' AND section = 'sharpen';
INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000041', 'a1000000-0000-4000-8000-000000000002', 'sharpen', ' ', 1, NULL),
  ('a1000000-0000-4000-8000-000000000042', 'a1000000-0000-4000-8000-000000000002', 'sharpen', ' ', 2, NULL),
  ('a1000000-0000-4000-8000-000000000043', 'a1000000-0000-4000-8000-000000000002', 'sharpen', ' ', 3, NULL)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, order_index = EXCLUDED.order_index, section = 'sharpen';

-- ═══════════════════════════════════════════════════════════════════════════
-- SALE ADMIN (a…0001): III mài dao cố định Excel
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM crm_daily_report_template_items
WHERE template_id = 'a1000000-0000-4000-8000-000000000001' AND section = 'sharpen';
INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000031', 'a1000000-0000-4000-8000-000000000001', 'sharpen', 'Học sử dụng phần mềm CRM & quản lý Lead', 1, NULL),
  ('a1000000-0000-4000-8000-000000000032', 'a1000000-0000-4000-8000-000000000001', 'sharpen', 'Học sản phẩm tủ bếp Inox', 2, NULL),
  ('a1000000-0000-4000-8000-000000000033', 'a1000000-0000-4000-8000-000000000001', 'sharpen', 'Rèn kỹ năng gọi điện - chăm sóc khách hàng', 3, NULL)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, order_index = EXCLUDED.order_index;

-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN-DEAL (a…0003): III
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM crm_daily_report_template_items
WHERE template_id = 'a1000000-0000-4000-8000-000000000003' AND section = 'sharpen';
INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000081', 'a1000000-0000-4000-8000-000000000003', 'sharpen', 'Học / đào tạo nội bộ', 1, NULL),
  ('a1000000-0000-4000-8000-000000000082', 'a1000000-0000-4000-8000-000000000003', 'sharpen', 'Cải tiến quy trình / tool', 2, NULL),
  ('a1000000-0000-4000-8000-000000000083', 'a1000000-0000-4000-8000-000000000003', 'sharpen', ' ', 3, NULL)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, order_index = EXCLUDED.order_index;

-- ═══════════════════════════════════════════════════════════════════════════
-- IV Đề xuất: 3 danh mục cố định + 1 dòng trống ghi thêm (mọi role)
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM crm_daily_report_template_items
WHERE section = 'proposal'
  AND template_id IN (
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000003'
  );

INSERT INTO crm_daily_report_template_items
  (id, template_id, section, label, order_index, metric_key)
VALUES
  ('a1000000-0000-4000-8000-000000000051', 'a1000000-0000-4000-8000-000000000001', 'proposal', 'Về trí lực', 1, NULL),
  ('a1000000-0000-4000-8000-000000000052', 'a1000000-0000-4000-8000-000000000001', 'proposal', 'Về nguồn lực', 2, NULL),
  ('a1000000-0000-4000-8000-000000000053', 'a1000000-0000-4000-8000-000000000001', 'proposal', 'Về sức lực', 3, NULL),
  ('a1000000-0000-4000-8000-000000000054', 'a1000000-0000-4000-8000-000000000001', 'proposal', ' ', 4, NULL),
  ('a1000000-0000-4000-8000-000000000061', 'a1000000-0000-4000-8000-000000000002', 'proposal', 'Về trí lực', 1, NULL),
  ('a1000000-0000-4000-8000-000000000062', 'a1000000-0000-4000-8000-000000000002', 'proposal', 'Về nguồn lực', 2, NULL),
  ('a1000000-0000-4000-8000-000000000063', 'a1000000-0000-4000-8000-000000000002', 'proposal', 'Về sức lực', 3, NULL),
  ('a1000000-0000-4000-8000-000000000064', 'a1000000-0000-4000-8000-000000000002', 'proposal', ' ', 4, NULL),
  ('a1000000-0000-4000-8000-000000000091', 'a1000000-0000-4000-8000-000000000003', 'proposal', 'Về trí lực', 1, NULL),
  ('a1000000-0000-4000-8000-000000000092', 'a1000000-0000-4000-8000-000000000003', 'proposal', 'Về nguồn lực', 2, NULL),
  ('a1000000-0000-4000-8000-000000000093', 'a1000000-0000-4000-8000-000000000003', 'proposal', 'Về sức lực', 3, NULL),
  ('a1000000-0000-4000-8000-000000000094', 'a1000000-0000-4000-8000-000000000003', 'proposal', ' ', 4, NULL)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, order_index = EXCLUDED.order_index, section = 'proposal';

COMMIT;
