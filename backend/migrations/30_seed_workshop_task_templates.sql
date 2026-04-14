-- Seed workshop templates (same as database/56_seed_workshop_task_templates.sql)

INSERT INTO workshop_task_templates (name, workshop_area, description, is_active, order_index)
SELECT
  'Bộ mẫu Sản xuất tiêu chuẩn',
  'production',
  'Quy trình nội bộ xưởng từ nhận hồ sơ đến đóng gói',
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_task_templates
  WHERE workshop_area = 'production' AND name = 'Bộ mẫu Sản xuất tiêu chuẩn'
);

INSERT INTO workshop_task_template_items (template_id, title, description, priority, deadline_days, order_index)
SELECT t.id, v.title, v.description, v.priority, v.deadline_days, v.order_index
FROM workshop_task_templates t,
(VALUES
  ('Bộ mẫu Sản xuất tiêu chuẩn', 'Nhận bản vẽ, BOM và danh mục vật tư', 'Đối chiếu với hợp đồng / báo giá đã chốt', 'high', 0, 1),
  ('Bộ mẫu Sản xuất tiêu chuẩn', 'Dự trù & xuất vật liệu theo đợt SX', 'Ghi nhận tồn kho, đặt bổ sung nếu thiếu', 'high', 1, 2),
  ('Bộ mẫu Sản xuất tiêu chuẩn', 'Cắt / CNC theo quy trình và biên bản máy', 'Lưu file chương trình, kiểm tra kích thước mẫu', 'high', 2, 3),
  ('Bộ mẫu Sản xuất tiêu chuẩn', 'Lắp ráp module & hoàn thiện bề mặt', 'Theo checklist QC từng cấu kiện', 'medium', 3, 4),
  ('Bộ mẫu Sản xuất tiêu chuẩn', 'Kiểm tra chất lượng nội bộ (QC xưởng)', 'Đánh dấu lỗi, chụp ảnh hiện trường nếu có', 'high', 1, 5),
  ('Bộ mẫu Sản xuất tiêu chuẩn', 'Đóng gói, dán nhãn công trình & nhập kho thành phẩm', 'Sẵn sàng bàn giao cho VC/LĐ', 'medium', 1, 6)
) AS v(tpl_name, title, description, priority, deadline_days, order_index)
WHERE t.name = v.tpl_name AND t.workshop_area = 'production'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = t.id AND i.title = v.title
  );

INSERT INTO workshop_task_templates (name, workshop_area, description, is_active, order_index)
SELECT
  'Bộ mẫu Vận chuyển & Lắp đặt',
  'logistics',
  'Từ xuất kho đến bàn giao tại công trình',
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_task_templates
  WHERE workshop_area = 'logistics' AND name = 'Bộ mẫu Vận chuyển & Lắp đặt'
);

INSERT INTO workshop_task_template_items (template_id, title, description, priority, deadline_days, order_index)
SELECT t.id, v.title, v.description, v.priority, v.deadline_days, v.order_index
FROM workshop_task_templates t,
(VALUES
  ('Bộ mẫu Vận chuyển & Lắp đặt', 'Xác nhận lịch giao / lắp với khách & đơn vị VC', 'Địa chỉ, giờ làm việc, thang máy / chỗ đỗ xe', 'high', 0, 1),
  ('Bộ mẫu Vận chuyển & Lắp đặt', 'Kiểm tra đủ kiện, biên bản xuất kho & ảnh hàng', 'Đối chiếu packing list với thực tế', 'high', 1, 2),
  ('Bộ mẫu Vận chuyển & Lắp đặt', 'Vận chuyển an toàn tới công trình', 'Bảo vệ góc cạnh, chống trầy trong lúc di chuyển', 'high', 2, 3),
  ('Bộ mẫu Vận chuyển & Lắp đặt', 'Lắp đặt theo bản vẽ hiện trường', 'Ghi nhận sai lệch so với khảo sát (nếu có)', 'high', 2, 4),
  ('Bộ mẫu Vận chuyển & Lắp đặt', 'Nghiệm thu với khách & danh sách việc còn lại', 'Ký biên bản, hẹn xử lý phát sinh', 'high', 1, 5),
  ('Bộ mẫu Vận chuyển & Lắp đặt', 'Thu dọn bao bì, bàn giao bảo hành & hướng dẫn sử dụng', 'Giao tài liệu, số hotline CSKH', 'medium', 0, 6)
) AS v(tpl_name, title, description, priority, deadline_days, order_index)
WHERE t.name = v.tpl_name AND t.workshop_area = 'logistics'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = t.id AND i.title = v.title
  );
