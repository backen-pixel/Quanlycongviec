-- Bộ nhiệm vụ mẫu sản xuất nâng cao — chạy sau 56_seed_workshop_task_templates.sql
-- Idempotent: bỏ qua nếu tên bộ mẫu đã tồn tại.

-- ═══════════════════════════════════════════════════════
-- BỘ 1: Tủ bếp tiêu chuẩn (8 nhiệm vụ)
-- ═══════════════════════════════════════════════════════
INSERT INTO workshop_task_templates (name, workshop_area, description, is_active, is_default, order_index)
SELECT
  'Tủ bếp tiêu chuẩn',
  'production',
  'Quy trình đầy đủ sản xuất tủ bếp: từ nhận bản vẽ → đóng gói xuất xưởng',
  true,
  true,   -- đặt làm mặc định
  2
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_task_templates
  WHERE workshop_area = 'production' AND name = 'Tủ bếp tiêu chuẩn'
);

INSERT INTO workshop_task_template_items (template_id, title, description, priority, deadline_days, order_index, checklist)
SELECT t.id, v.title, v.description, v.priority, v.deadline_days, v.order_index, v.checklist::jsonb
FROM workshop_task_templates t,
(VALUES
  ('Tủ bếp tiêu chuẩn',
   'Nhận & kiểm tra hồ sơ kỹ thuật',
   'Đối chiếu bản vẽ, BOM, danh sách màu sắc với hợp đồng đã ký',
   'high', 0, 1,
   '[{"text":"Nhận đủ bản vẽ autocad / 3D"},{"text":"Đối chiếu BOM với báo giá"},{"text":"Xác nhận màu laminate / acrylic"},{"text":"Ghi nhận kích thước thực đo tại công trình"},{"text":"Ký xác nhận với kỹ thuật"}]'),

  ('Tủ bếp tiêu chuẩn',
   'Chuẩn bị & xuất vật liệu',
   'Lên lịch đặt vật tư, kiểm tra tồn kho, xuất phiếu',
   'high', 1, 2,
   '[{"text":"Kiểm tra tồn ván HDF/MFC/Acrylic"},{"text":"Đặt mua bổ sung nếu thiếu"},{"text":"Xuất phiếu kho vật liệu"},{"text":"Chuẩn bị phụ kiện: bản lề, ray, tay nắm"},{"text":"Ghi nhận ngày nhận vật liệu"}]'),

  ('Tủ bếp tiêu chuẩn',
   'Cắt & gia công CNC',
   'Lập trình CNC, cắt theo bản vẽ, kiểm tra kích thước từng tấm',
   'high', 1, 3,
   '[{"text":"Lập file chương trình CNC"},{"text":"Cắt thử 1 tấm kiểm tra kích thước"},{"text":"Gia công toàn bộ chi tiết"},{"text":"Đánh số chi tiết theo bản vẽ"},{"text":"Kiểm tra dung sai ± 0.5mm"}]'),

  ('Tủ bếp tiêu chuẩn',
   'Dán & phủ bề mặt',
   'Dán cạnh, phủ laminate/acrylic/sơn theo đơn hàng',
   'medium', 1, 4,
   '[{"text":"Dán cạnh ABS toàn bộ chi tiết"},{"text":"Phủ bề mặt theo yêu cầu màu sắc"},{"text":"Kiểm tra bong tróc, khí bọt"},{"text":"Đánh bóng / mài nhẹ nếu cần"},{"text":"Bảo vệ bề mặt bằng màng PE"}]'),

  ('Tủ bếp tiêu chuẩn',
   'Lắp ráp module & tủ hoàn chỉnh',
   'Lắp các module tủ trên, tủ dưới, tủ cao, kiểm tra vuông góc',
   'high', 2, 5,
   '[{"text":"Lắp hộp tủ dưới (lower cabinet)"},{"text":"Lắp hộp tủ trên (upper cabinet)"},{"text":"Lắp cánh tủ, bản lề, điều chỉnh thăng bằng"},{"text":"Lắp ray ngăn kéo và kiểm tra trơn tru"},{"text":"Lắp phụ kiện: tay nắm, chân tủ, đèn LED (nếu có)"},{"text":"Kiểm tra vuông góc và đồng phẳng toàn bộ"}]'),

  ('Tủ bếp tiêu chuẩn',
   'QC nội bộ xưởng',
   'Kiểm tra chất lượng toàn bộ, chụp ảnh biên bản QC',
   'high', 0, 6,
   '[{"text":"Kiểm tra bề mặt: không trầy, không bong"},{"text":"Kiểm tra khe hở cánh tủ đồng đều"},{"text":"Kiểm tra ray ngăn kéo mở nhẹ 100%"},{"text":"Đo kiểm kích thước tổng thể so với bản vẽ"},{"text":"Chụp ảnh QC đầy đủ 4 góc"},{"text":"Ghi biên bản nghiệm thu nội bộ"}]'),

  ('Tủ bếp tiêu chuẩn',
   'Sửa lỗi phát sinh (nếu có)',
   'Xử lý các lỗi phát hiện qua QC trước khi đóng gói',
   'medium', 0, 7,
   '[{"text":"Liệt kê danh sách lỗi cần sửa"},{"text":"Phân công thợ xử lý"},{"text":"Kiểm tra lại sau khi sửa"},{"text":"Ký xác nhận hoàn thành sửa lỗi"}]'),

  ('Tủ bếp tiêu chuẩn',
   'Đóng gói & nhập kho thành phẩm',
   'Đóng gói đúng quy cách, dán nhãn công trình, cập nhật kho',
   'medium', 1, 8,
   '[{"text":"Bọc xốp bảo vệ từng module"},{"text":"Đóng kiện theo quy cách vận chuyển"},{"text":"Dán nhãn: tên công trình, mã đơn hàng, số thứ tự kiện"},{"text":"Chụp ảnh toàn bộ kiện hàng"},{"text":"Cập nhật số lượng nhập kho thành phẩm"},{"text":"Bàn giao biên bản cho bộ phận VC/LĐ"}]')
) AS v(tpl_name, title, description, priority, deadline_days, order_index, checklist)
WHERE t.name = v.tpl_name AND t.workshop_area = 'production'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = t.id AND i.title = v.title
  );

-- ═══════════════════════════════════════════════════════
-- BỘ 2: Cửa nhôm / nhôm kính (6 nhiệm vụ)
-- ═══════════════════════════════════════════════════════
INSERT INTO workshop_task_templates (name, workshop_area, description, is_active, is_default, order_index)
SELECT
  'Cửa nhôm / nhôm kính',
  'production',
  'Quy trình sản xuất cửa nhôm, vách kính, cửa trượt nhôm kính',
  true,
  false,
  3
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_task_templates
  WHERE workshop_area = 'production' AND name = 'Cửa nhôm / nhôm kính'
);

INSERT INTO workshop_task_template_items (template_id, title, description, priority, deadline_days, order_index, checklist)
SELECT t.id, v.title, v.description, v.priority, v.deadline_days, v.order_index, v.checklist::jsonb
FROM workshop_task_templates t,
(VALUES
  ('Cửa nhôm / nhôm kính',
   'Nhận hồ sơ & tính toán kỹ thuật',
   'Nhận kích thước thực đo, tính toán thanh nhôm, đặt kính',
   'high', 0, 1,
   '[{"text":"Nhận kích thước đo đạc thực tế"},{"text":"Xác nhận màu nhôm và loại kính"},{"text":"Tính toán số lượng thanh nhôm cần cắt"},{"text":"Đặt hàng kính (tempered / laminated)"},{"text":"Xác nhận phụ kiện: bánh xe, khóa, ray"}]'),

  ('Cửa nhôm / nhôm kính',
   'Cắt & gia công thanh nhôm',
   'Cắt góc 45° / 90°, khoan lỗ, mài nhẵn đầu thanh',
   'high', 1, 2,
   '[{"text":"Cắt thanh nhôm đúng kích thước"},{"text":"Cắt góc theo thiết kế (45° hoặc 90°)"},{"text":"Khoan lỗ lắp phụ kiện"},{"text":"Mài nhẵn đầu thanh, không bavia"},{"text":"Kiểm tra độ thẳng từng thanh"}]'),

  ('Cửa nhôm / nhôm kính',
   'Lắp ráp khung cửa',
   'Ghép khung, lắp ron cao su, cân chỉnh vuông góc',
   'high', 1, 3,
   '[{"text":"Ghép 4 thanh khung bằng góc nối"},{"text":"Lắp ron EPDM chống nước"},{"text":"Kiểm tra vuông góc bằng thước"},{"text":"Bắt vít cố định góc nối"},{"text":"Kiểm tra độ phẳng mặt khung"}]'),

  ('Cửa nhôm / nhôm kính',
   'Lắp kính & phụ kiện',
   'Lắp kính đúng chiều, lắp bánh xe, khóa, tay nắm',
   'high', 1, 4,
   '[{"text":"Lắp kính vào rãnh nhôm, đặt đệm cao su"},{"text":"Lắp bánh xe (với cửa trượt)"},{"text":"Lắp khóa và tay nắm"},{"text":"Thử đóng mở cửa 10 lần"},{"text":"Điều chỉnh bánh xe cho cửa chạy êm"}]'),

  ('Cửa nhôm / nhôm kính',
   'QC & kiểm tra kín nước',
   'Kiểm tra tổng thể, phun nước thử (nếu cần)',
   'high', 0, 5,
   '[{"text":"Kiểm tra bề mặt nhôm không trầy"},{"text":"Kiểm tra khe hở đều hai bên"},{"text":"Thử đóng mở nhiều lần"},{"text":"Kiểm tra ron kín khít"},{"text":"Chụp ảnh nghiệm thu"}]'),

  ('Cửa nhôm / nhôm kính',
   'Bọc bảo vệ & xuất xưởng',
   'Bọc màng PE, dán nhãn, xếp lên xe hoặc nhập kho',
   'medium', 1, 6,
   '[{"text":"Bọc màng PE bảo vệ mặt nhôm"},{"text":"Bảo vệ kính bằng xốp hai mặt"},{"text":"Dán nhãn công trình và số cửa"},{"text":"Lập biên bản giao hàng cho VC/LĐ"}]')
) AS v(tpl_name, title, description, priority, deadline_days, order_index, checklist)
WHERE t.name = v.tpl_name AND t.workshop_area = 'production'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = t.id AND i.title = v.title
  );

-- ═══════════════════════════════════════════════════════
-- BỘ 3: Sản xuất nhanh / Rush order (5 nhiệm vụ)
-- ═══════════════════════════════════════════════════════
INSERT INTO workshop_task_templates (name, workshop_area, description, is_active, is_default, order_index)
SELECT
  'Sản xuất nhanh (Rush)',
  'production',
  'Quy trình rút gọn cho đơn hàng gấp, ưu tiên cao',
  true,
  false,
  4
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_task_templates
  WHERE workshop_area = 'production' AND name = 'Sản xuất nhanh (Rush)'
);

INSERT INTO workshop_task_template_items (template_id, title, description, priority, deadline_days, order_index, checklist)
SELECT t.id, v.title, v.description, v.priority, v.deadline_days, v.order_index, v.checklist::jsonb
FROM workshop_task_templates t,
(VALUES
  ('Sản xuất nhanh (Rush)',
   'Xác nhận kỹ thuật khẩn',
   'Review nhanh bản vẽ, xác nhận ngay với khách nếu có thay đổi',
   'urgent', 0, 1,
   '[{"text":"Đọc và xác nhận bản vẽ trong 2 giờ"},{"text":"Gọi xác nhận kích thước với khách (nếu nghi ngờ)"},{"text":"Chuẩn bị vật liệu sẵn có từ kho"}]'),

  ('Sản xuất nhanh (Rush)',
   'Cắt & gia công ưu tiên',
   'Sắp xếp máy CNC ưu tiên cho đơn rush',
   'urgent', 0, 2,
   '[{"text":"Book máy CNC ưu tiên"},{"text":"Gia công liên tục, không nghỉ giữa giờ"},{"text":"Kiểm tra nhanh kích thước quan trọng"}]'),

  ('Sản xuất nhanh (Rush)',
   'Lắp ráp & hoàn thiện tốc độ',
   'Bố trí đủ thợ, làm song song các hạng mục',
   'urgent', 1, 3,
   '[{"text":"Phân công 2 nhóm làm song song"},{"text":"Kiểm tra tiến độ mỗi 2 giờ"},{"text":"Xử lý phát sinh ngay trong ca"}]'),

  ('Sản xuất nhanh (Rush)',
   'QC nhanh & chụp ảnh',
   'QC rút gọn các điểm trọng yếu, chụp ảnh toàn bộ',
   'high', 0, 4,
   '[{"text":"Kiểm tra 5 điểm chất lượng quan trọng nhất"},{"text":"Chụp ảnh 360° sản phẩm"},{"text":"Gửi ảnh cho khách xác nhận"}]'),

  ('Sản xuất nhanh (Rush)',
   'Đóng gói & thông báo VC',
   'Đóng gói ngay, thông báo bộ phận vận chuyển sẵn sàng',
   'urgent', 0, 5,
   '[{"text":"Đóng gói ngay sau QC"},{"text":"Gọi/nhắn bộ phận VC lấy hàng"},{"text":"Cập nhật trạng thái đơn hàng lên hệ thống"}]')
) AS v(tpl_name, title, description, priority, deadline_days, order_index, checklist)
WHERE t.name = v.tpl_name AND t.workshop_area = 'production'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = t.id AND i.title = v.title
  );

-- ═══════════════════════════════════════════════════════
-- BỘ 4: Nội thất phòng ngủ / phòng khách (7 nhiệm vụ)
-- ═══════════════════════════════════════════════════════
INSERT INTO workshop_task_templates (name, workshop_area, description, is_active, is_default, order_index)
SELECT
  'Nội thất phòng ngủ / phòng khách',
  'production',
  'Tủ quần áo, giường, kệ TV, tủ trang trí — gỗ công nghiệp',
  true,
  false,
  5
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_task_templates
  WHERE workshop_area = 'production' AND name = 'Nội thất phòng ngủ / phòng khách'
);

INSERT INTO workshop_task_template_items (template_id, title, description, priority, deadline_days, order_index, checklist)
SELECT t.id, v.title, v.description, v.priority, v.deadline_days, v.order_index, v.checklist::jsonb
FROM workshop_task_templates t,
(VALUES
  ('Nội thất phòng ngủ / phòng khách',
   'Nhận hồ sơ thiết kế nội thất',
   'Bản vẽ 3D, ảnh phối cảnh, danh sách vật liệu hoàn thiện',
   'high', 0, 1,
   '[{"text":"Nhận đủ bản vẽ 2D kỹ thuật"},{"text":"Xem 3D để hiểu thiết kế tổng thể"},{"text":"Xác nhận loại ván (MDF/HDF/Plywood)"},{"text":"Xác nhận màu laminate/sơn/veneer"},{"text":"Đối chiếu số lượng với BOM"}]'),

  ('Nội thất phòng ngủ / phòng khách',
   'Xuất vật liệu & phụ kiện',
   'Kiểm tra kho, xuất vật liệu đúng quy cách cho từng hạng mục',
   'high', 1, 2,
   '[{"text":"Xuất ván theo số lượng BOM"},{"text":"Xuất phụ kiện: bản lề Blum, ray hộp, tay nắm"},{"text":"Kiểm tra gương, vách ngăn (nếu có)"},{"text":"Ghi nhận vật liệu xuất kho"}]'),

  ('Nội thất phòng ngủ / phòng khách',
   'Cắt CNC & khoan tổ hợp',
   'Cắt theo bản vẽ, khoan lỗ bản lề, lỗ dowel tự động',
   'high', 2, 3,
   '[{"text":"Cắt CNC theo file bản vẽ"},{"text":"Khoan lỗ bản lề bằng máy khoan tổ hợp"},{"text":"Khoan lỗ dowel lắp ghép"},{"text":"Kiểm tra kích thước 10% số lượng tấm"},{"text":"Phân nhóm chi tiết theo từng hạng mục"}]'),

  ('Nội thất phòng ngủ / phòng khách',
   'Dán cạnh & xử lý bề mặt',
   'Dán cạnh ABS, phủ laminate, sơn PU theo đơn hàng',
   'medium', 2, 4,
   '[{"text":"Dán cạnh ABS 0.4mm/1mm theo yêu cầu"},{"text":"Phủ laminate / veneer bề mặt"},{"text":"Sơn PU các chi tiết cần sơn"},{"text":"Kiểm tra chất lượng dán cạnh toàn bộ"},{"text":"Bảo vệ bề mặt bằng màng PE"}]'),

  ('Nội thất phòng ngủ / phòng khách',
   'Lắp ráp tổng thể',
   'Lắp ghép các module theo bản vẽ, kiểm tra từng hạng mục',
   'high', 2, 5,
   '[{"text":"Lắp tủ quần áo: thân + ngăn + cánh"},{"text":"Lắp giường: đầu giường + hộc tủ (nếu có)"},{"text":"Lắp kệ TV + tủ trang trí"},{"text":"Điều chỉnh bản lề và cánh tủ"},{"text":"Kiểm tra ray ngăn kéo trơn tru"},{"text":"Lắp đèn LED trang trí (nếu có)"}]'),

  ('Nội thất phòng ngủ / phòng khách',
   'Kiểm tra chất lượng (QC)',
   'Kiểm tra toàn bộ theo checklist, chụp ảnh, biên bản QC',
   'high', 0, 6,
   '[{"text":"Kiểm tra bề mặt: không trầy, bong, bọng"},{"text":"Kiểm tra khe hở cánh tủ đồng đều ≤ 2mm"},{"text":"Kiểm tra ngăn kéo đóng mở hoàn toàn"},{"text":"Kiểm tra vuông góc tổng thể"},{"text":"Chụp ảnh QC đầy đủ"},{"text":"Lập biên bản QC nội bộ"}]'),

  ('Nội thất phòng ngủ / phòng khách',
   'Đóng gói theo công trình',
   'Bọc bảo vệ, đóng kiện, dán nhãn đầy đủ trước khi xuất xưởng',
   'medium', 1, 7,
   '[{"text":"Bọc xốp PE foam từng module"},{"text":"Bọc carton các góc dễ vỡ"},{"text":"Đóng kiện gỗ/palet (nếu vận chuyển xa)"},{"text":"Dán nhãn: phòng ngủ / phòng khách + số kiện"},{"text":"Chụp ảnh toàn bộ kiện hàng"},{"text":"Bàn giao biên bản xuất kho cho VC/LĐ"}]')
) AS v(tpl_name, title, description, priority, deadline_days, order_index, checklist)
WHERE t.name = v.tpl_name AND t.workshop_area = 'production'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = t.id AND i.title = v.title
  );
