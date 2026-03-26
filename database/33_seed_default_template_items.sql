-- 33_seed_default_template_items.sql
-- Đảm bảo tất cả template default đều có items
-- Nếu template đã có items thì bỏ qua

-- Seed items cho template "consulting" (nếu chưa có)
INSERT INTO crm_task_template_items (template_id, title, description, priority, deadline_days, order_index)
SELECT t.id, item.title, item.description, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Tiếp nhận yêu cầu khách hàng', 'Ghi nhận thông tin KH, nhu cầu sử dụng, phong cách mong muốn', 'high', 0, 1),
  ('Tư vấn sản phẩm & vật liệu', 'Tư vấn chất liệu gỗ, phụ kiện, thiết bị phù hợp', 'high', 1, 2),
  ('Khảo sát thực tế', 'Đo đạc kích thước, kiểm tra hiện trạng công trình', 'medium', 2, 3),
  ('Ghi nhận nhu cầu chi tiết', 'Tổng hợp yêu cầu, xác nhận lại với khách hàng', 'medium', 2, 4)
) AS item(title, description, priority, deadline_days, order_index)
WHERE t.stage_slug = 'consulting' AND t.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM crm_task_template_items tti WHERE tti.template_id = t.id
  );

-- Seed items cho template "design" (nếu chưa có)
INSERT INTO crm_task_template_items (template_id, title, description, priority, deadline_days, order_index)
SELECT t.id, item.title, item.description, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Thiết kế bản vẽ sơ bộ', 'Bản vẽ 2D/3D sơ bộ theo yêu cầu KH', 'high', 3, 1),
  ('Gửi bản vẽ cho KH duyệt', 'Email/Zalo gửi bản vẽ, hẹn thời gian feedback', 'high', 4, 2),
  ('Chỉnh sửa theo feedback KH', 'Cập nhật bản vẽ theo góp ý của khách', 'medium', 5, 3),
  ('Hoàn thiện bản vẽ kỹ thuật', 'Bản vẽ kỹ thuật chi tiết cho sản xuất', 'high', 7, 4)
) AS item(title, description, priority, deadline_days, order_index)
WHERE t.stage_slug = 'design' AND t.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM crm_task_template_items tti WHERE tti.template_id = t.id
  );

-- Seed items cho template "quotation" (nếu chưa có)
INSERT INTO crm_task_template_items (template_id, title, description, priority, deadline_days, order_index)
SELECT t.id, item.title, item.description, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Tính toán chi phí vật liệu', 'Bảng tính vật liệu, phụ kiện, nhân công', 'high', 1, 1),
  ('Lập báo giá chi tiết', 'Báo giá theo hạng mục, có breakdown chi tiết', 'high', 2, 2),
  ('Gửi báo giá cho KH', 'Gửi báo giá qua email/Zalo, giải thích', 'high', 2, 3),
  ('Thương lượng & chốt giá', 'Đàm phán chiết khấu, điều khoản thanh toán', 'medium', 5, 4)
) AS item(title, description, priority, deadline_days, order_index)
WHERE t.stage_slug = 'quotation' AND t.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM crm_task_template_items tti WHERE tti.template_id = t.id
  );

-- Seed items cho template "contract" (nếu chưa có)
INSERT INTO crm_task_template_items (template_id, title, description, priority, deadline_days, order_index)
SELECT t.id, item.title, item.description, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Soạn hợp đồng', 'Soạn HĐ từ mẫu, điền thông tin KH + báo giá', 'high', 1, 1),
  ('KH review hợp đồng', 'Gửi HĐ cho KH xem, chờ feedback', 'high', 3, 2),
  ('Ký hợp đồng', 'Hẹn KH ký HĐ, xác nhận điều khoản cuối', 'urgent', 5, 3),
  ('Thu tiền đặt cọc', 'Thu cọc theo tỷ lệ đã thỏa thuận trong HĐ', 'urgent', 5, 4)
) AS item(title, description, priority, deadline_days, order_index)
WHERE t.stage_slug = 'contract' AND t.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM crm_task_template_items tti WHERE tti.template_id = t.id
  );

-- Thêm template cho giai đoạn sản xuất + lắp đặt (thường dùng cho Deal)
INSERT INTO crm_task_templates (name, stage_slug, is_default, order_index, pipeline_type)
VALUES
  ('Bộ mẫu Sản xuất', 'production', true, 5, 'deal'),
  ('Bộ mẫu Giao hàng', 'shipping', true, 6, 'deal'),
  ('Bộ mẫu Lắp đặt', 'installation', true, 7, 'deal'),
  ('Bộ mẫu CSKH', 'customer_care', true, 8, 'deal')
ON CONFLICT DO NOTHING;

-- Seed items cho Sản xuất
INSERT INTO crm_task_template_items (template_id, title, description, priority, deadline_days, order_index)
SELECT t.id, item.title, item.description, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Đặt vật liệu', 'Đặt mua gỗ, phụ kiện, thiết bị theo bảng vật liệu', 'urgent', 1, 1),
  ('Gia công cắt CNC', 'Cắt gỗ theo bản vẽ kỹ thuật', 'high', 5, 2),
  ('Lắp ráp bán thành phẩm', 'Lắp ráp tủ, kiểm tra kích thước', 'high', 10, 3),
  ('Hoàn thiện bề mặt', 'Sơn/dán laminate/veneer, kiểm tra chất lượng', 'high', 14, 4),
  ('QC kiểm tra chất lượng', 'Kiểm tra tổng thể trước khi giao', 'urgent', 15, 5)
) AS item(title, description, priority, deadline_days, order_index)
WHERE t.stage_slug = 'production' AND t.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM crm_task_template_items tti WHERE tti.template_id = t.id
  );

-- Seed items cho Giao hàng
INSERT INTO crm_task_template_items (template_id, title, description, priority, deadline_days, order_index)
SELECT t.id, item.title, item.description, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Đóng gói sản phẩm', 'Đóng gói cẩn thận, dán nhãn từng kiện', 'high', 0, 1),
  ('Sắp xếp xe vận chuyển', 'Book xe tải, xác nhận lịch giao', 'high', 1, 2),
  ('Giao hàng & bàn giao', 'Giao hàng tận nơi, kiểm đếm với KH', 'urgent', 2, 3)
) AS item(title, description, priority, deadline_days, order_index)
WHERE t.stage_slug = 'shipping' AND t.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM crm_task_template_items tti WHERE tti.template_id = t.id
  );

-- Seed items cho Lắp đặt
INSERT INTO crm_task_template_items (template_id, title, description, priority, deadline_days, order_index)
SELECT t.id, item.title, item.description, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Lắp đặt tủ bếp', 'Lắp đặt theo bản vẽ, cân chỉnh', 'urgent', 0, 1),
  ('Lắp phụ kiện & thiết bị', 'Bản lề, ray, bếp, chậu, máy hút', 'high', 1, 2),
  ('Kiểm tra & hiệu chỉnh', 'Test đóng mở, chỉnh cánh, kiểm tra khe hở', 'high', 2, 3),
  ('Vệ sinh công trình', 'Dọn dẹp sạch sẽ sau lắp đặt', 'medium', 2, 4),
  ('Nghiệm thu với KH', 'KH kiểm tra, ký biên bản nghiệm thu', 'urgent', 3, 5)
) AS item(title, description, priority, deadline_days, order_index)
WHERE t.stage_slug = 'installation' AND t.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM crm_task_template_items tti WHERE tti.template_id = t.id
  );

-- Seed items cho CSKH
INSERT INTO crm_task_template_items (template_id, title, description, priority, deadline_days, order_index)
SELECT t.id, item.title, item.description, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Gọi hỏi thăm sau lắp đặt', 'Gọi KH sau 3 ngày hỏi tình trạng sử dụng', 'medium', 3, 1),
  ('Xử lý phản hồi (nếu có)', 'Ghi nhận và xử lý feedback từ KH', 'high', 7, 2),
  ('Thu tiền đợt cuối', 'Thu nốt công nợ còn lại theo HĐ', 'urgent', 7, 3),
  ('Yêu cầu đánh giá / review', 'Mời KH đánh giá trên Zalo/Google', 'low', 14, 4)
) AS item(title, description, priority, deadline_days, order_index)
WHERE t.stage_slug = 'customer_care' AND t.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM crm_task_template_items tti WHERE tti.template_id = t.id
  );
