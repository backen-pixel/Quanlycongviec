-- 418: Bộ nhiệm vụ VC/LĐ Phúc Đạt — kiểm tra nhân chở, giao hàng, bàn giao
-- Chạy sau 415_logistics_handover_settings_ngoc_linh.sql
-- Idempotent: tắt bộ mẫu cũ 6 bước, thêm bộ quy trình chi tiết (nếu chưa có).

BEGIN;

-- Phúc Đạt + Nguyễn Ngọc Linh (admin VC/LĐ)
-- company: 29677f68-967e-4256-92fd-492bb580e888
-- user:    5e07fb3b-3286-4ca3-a167-4edef16f3866

UPDATE workshop_task_templates
SET is_active = false,
    is_default = false
WHERE workshop_area = 'logistics'
  AND company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND name = 'Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt';

INSERT INTO workshop_task_templates (name, workshop_area, description, company_id, is_active, is_default, order_index)
SELECT
  'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
  'logistics',
  'Quy trình vận chuyển lắp đặt Phúc Đạt: tiếp nhận SX → kiểm tra nhân chở → xuất kho → giao hàng → lắp → nghiệm thu bàn giao.',
  '29677f68-967e-4256-92fd-492bb580e888',
  true,
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_task_templates
  WHERE workshop_area = 'logistics'
    AND company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND name = 'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao'
);

INSERT INTO workshop_task_template_items (
  template_id, title, description, priority, deadline_days, order_index,
  checklist, default_assignee_id, blocks_stage_advance
)
SELECT t.id, v.title, v.description, v.priority, v.deadline_days, v.order_index,
       v.checklist::jsonb,
       '5e07fb3b-3286-4ca3-a167-4edef16f3866'::uuid,
       v.blocks_stage_advance
FROM workshop_task_templates t,
(VALUES
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Tiếp nhận bàn giao từ sản xuất',
    'Đối chiếu mã dự án, packing list và biên bản QA xưởng trước khi lập lệnh giao.',
    'high', 0, 1,
    '[{"text":"Nhận đủ hồ sơ: bản vẽ lắp, packing list, biên bản QC xưởng"},{"text":"Đối chiếu mã dự án / mã đơn trên phiếu và thùng hàng"},{"text":"Xác nhận tổng số kiện và phụ kiện đi kèm"},{"text":"Chụp ảnh tổng quan hàng tại kho thành phẩm"},{"text":"Ghi nhận hạng mục thiếu / cần bổ sung (nếu có)"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Xác nhận lịch giao / lắp với khách',
    'Liên hệ khách trước giờ giao: địa chỉ, người nhận, điều kiện công trình.',
    'high', 0, 2,
    '[{"text":"Xác nhận địa chỉ giao / lắp chính xác (số nhà, tầng, block)"},{"text":"Lấy SĐT người nhận và người giám sát công trình"},{"text":"Hỏi thang máy, lối vào, chỗ đỗ xe / bãi tập kết"},{"text":"Xác nhận khung giờ được phép thi công"},{"text":"Lưu log cuộc gọi / tin nhắn xác nhận"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Lập kế hoạch vận chuyển & phân xe',
    'Chốt xe, tuyến, ghép chuyến và thời gian dự kiến đến công trình.',
    'high', 0, 3,
    '[{"text":"Chọn loại xe phù hợp kích thước / số kiện"},{"text":"Lập tuyến và ước tính ETA đến công trình"},{"text":"Ghép chuyến (nếu có) và kiểm tra không trùng lịch xe"},{"text":"Ghi nhận chi phí vận chuyển dự kiến"},{"text":"Tạo phiếu / lệnh điều phối giao hàng"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Kiểm tra & phân công nhân chở / giao hàng',
    'Xác nhận tài xế, phụ xe/đội giao; briefing hàng hóa và quy tắc bảo quản.',
    'high', 0, 4,
    '[{"text":"Chốt tài xế / nhân viên chở hàng chính và phụ (nếu có)"},{"text":"Kiểm tra giấy tờ lái xe / CMND (đối tác ngoài nếu thuê xe)"},{"text":"Briefing nội dung hàng: loại sản phẩm, kiện dễ vỡ, góc cạnh cần bảo vệ"},{"text":"Giao packing list và SĐT liên hệ công trình cho tài xế"},{"text":"Xác nhận tài xế đã hiểu quy trình giao — ký / tick nhận nhiệm vụ"}]',
    true
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Kiểm tra đủ kiện & phụ kiện trước xuất kho',
    'Đếm kiện, đối chiếu phụ kiện — không xuất kho nếu thiếu hoặc sai.',
    'high', 1, 5,
    '[{"text":"Đối chiếu packing list với kiện thực tế (mã kiện, số lượng)"},{"text":"Kiểm tra phụ kiện, bulong, kính, tay nắm đi kèm"},{"text":"Kiểm tra tình trạng đóng gói, dán nhãn công trình"},{"text":"Chụp ảnh từng kiện trước khi lên xe"},{"text":"Ghi nhận kiện lỗi / hư — không xuất nếu chưa xử lý"}]',
    true
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Bàn giao hàng kho → tài xế (biên bản xuất kho)',
    'Ký biên bản bàn giao từ kho cho nhân chở; ghi thời gian xuất phát.',
    'high', 1, 6,
    '[{"text":"Lập biên bản xuất kho / phiếu giao hàng cho tài xế"},{"text":"Ghi rõ số kiện bàn giao và tình trạng từng kiện"},{"text":"Tài xế ký xác nhận đã nhận đủ hàng"},{"text":"Ghi thời gian xuất phát thực tế"},{"text":"Chụp ảnh hàng trên xe trước khi rời kho"}]',
    true
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Vận chuyển & theo dõi hành trình',
    'Theo dõi ETA, báo khách khi trễ; bảo vệ hàng trong suốt hành trình.',
    'high', 2, 7,
    '[{"text":"Gọi khách trước khi đến 30–60 phút"},{"text":"Cập nhật ETA nếu trễ so với lịch đã hẹn"},{"text":"Bảo vệ góc cạnh, chống trầy khi di chuyển / qua cầu thang"},{"text":"Không để hàng lộ nắng mưa không che chắn"},{"text":"Báo ngay nếu va quệt / hư hỏng trên đường"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Giao hàng tại công trình (POD)',
    'Kiểm đếm cùng khách; biên bản giao nhận, ảnh và chữ ký/OTP.',
    'high', 2, 8,
    '[{"text":"Kiểm đếm số kiện cùng người nhận tại công trình"},{"text":"Ghi nhận thiếu / hư / từ chối nhận (nếu có) + ảnh hiện trường"},{"text":"Xác nhận khu vực tập kết hàng trên công trình"},{"text":"Khách ký biên bản giao hàng hoặc OTP xác nhận"},{"text":"Chụp ảnh proof of delivery (POD)"}]',
    true
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Kiểm tra mặt bằng trước lắp đặt',
    'Site readiness: điện, nước, nền, lối thi công, kích thước thực tế.',
    'high', 2, 9,
    '[{"text":"Kiểm tra mặt bằng trống, sạch, đủ ánh sáng thi công"},{"text":"Xác nhận điện / nước / thoát nước (nếu liên quan)"},{"text":"Đo lại kích thước thực tế so với bản vẽ"},{"text":"Chụp ảnh hiện trạng trước lắp"},{"text":"Dừng lắp nếu mặt bằng chưa đạt — báo điều phối"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Lắp đặt tại công trình',
    'Thi công theo bản vẽ; ghi nhận phát sinh và bảo vệ tài sản khách.',
    'high', 3, 10,
    '[{"text":"Lắp theo bản vẽ hiện trường đã duyệt"},{"text":"Bảo vệ sàn, tường, nội thất khách khi thi công"},{"text":"Ghi nhận sai lệch / phát sinh ngoài phạm vi"},{"text":"Cập nhật tiến độ lắp trong ngày"},{"text":"Thu gom rác thi công, giữ vệ sinh công trình"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'QA nội bộ & xử lý tồn (punch list)',
    'Kiểm tra chất lượng trước khi mời khách nghiệm thu.',
    'high', 1, 11,
    '[{"text":"Checklist QA: thẩm mỹ, vận hành, an toàn, vệ sinh"},{"text":"Lập punch list hạng mục còn tồn (nếu có)"},{"text":"Chụp ảnh lỗi và ảnh sau khi sửa"},{"text":"Không mời nghiệm thu nếu còn lỗi nghiêm trọng"},{"text":"Giao việc xử lý tồn và hạn hoàn thành"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Nghiệm thu & bàn giao với khách',
    'Hướng dẫn sử dụng, ký biên bản nghiệm thu, xác nhận hạng mục còn lại.',
    'high', 1, 12,
    '[{"text":"Hướng dẫn khách sử dụng / bảo quản sản phẩm"},{"text":"Khách kiểm tra và ký biên bản nghiệm thu"},{"text":"Ghi rõ hạng mục tồn / hẹn xử lý phát sinh (nếu có)"},{"text":"Chụp ảnh công trình hoàn thiện"},{"text":"Xác nhận giá trị / phạm vi đã bàn giao"}]',
    true
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Kích hoạt bảo hành & hướng dẫn CSKH',
    'Gửi phiếu bảo hành, hotline và tài liệu hướng dẫn cho khách.',
    'medium', 0, 13,
    '[{"text":"Tạo / gửi phiếu bảo hành điện tử cho khách"},{"text":"Giao tài liệu hướng dẫn vệ sinh, bảo quản"},{"text":"Cung cấp hotline CSKH / kỹ thuật"},{"text":"Lưu timestamp đã gửi bảo hành"},{"text":"Chuyển hồ sơ sang CSKH chăm sóc hậu kỳ (ngày 3/7/30)"}]',
    false
  )
) AS v(tpl_name, title, description, priority, deadline_days, order_index, checklist, blocks_stage_advance)
WHERE t.name = v.tpl_name
  AND t.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = t.id AND i.title = v.title
  );

COMMIT;
