-- ═══════════════════════════════════════════════════════════════════════
-- RESET & SEED: Quy trình + Nhiệm vụ + Checklist
-- GIỮ NGUYÊN: ecosystem, workflow_stages, tasks, projects, companies
-- Chạy trên Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. XÓA DỮ LIỆU CŨ ───
DELETE FROM flow_step_processes;
DELETE FROM workflow_flow_steps;
DELETE FROM workflow_flows;
DELETE FROM company_template_checklists;
DELETE FROM company_template_tasks;
DELETE FROM company_template_sets;
DELETE FROM company_process_checklists;
DELETE FROM company_process_tasks;
DELETE FROM company_processes;

-- ─── 2. SEED QUY TRÌNH + NHIỆM VỤ + CHECKLIST ───

-- ════════════════════════════════════════════
-- KHỐI KINH DOANH
-- ════════════════════════════════════════════
DO $$
DECLARE
  cty RECORD;
  proc_id UUID;
  task_id UUID;
BEGIN
  FOR cty IN
    SELECT u.id FROM ecosystem_units u
    JOIN ecosystem_units parent ON u.parent_id = parent.id
    WHERE parent.name ILIKE '%Kinh Doanh%' AND u.is_active = true
  LOOP
    -- ─── QT1: Tiếp nhận & Tư vấn ───
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Tiếp nhận & Tư vấn', 'Tiếp nhận KH, tư vấn sản phẩm, khảo sát nhu cầu', '#8B5CF6', '💬', 1, cty.id, true)
    RETURNING id INTO proc_id;

    -- Nhiệm vụ 1.1
    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Tiếp nhận yêu cầu khách hàng', 'high', 1) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Ghi nhận tên, SĐT, email KH', true, 1),
      (task_id, 'Xác nhận nhu cầu (loại tủ, phong cách)', true, 2),
      (task_id, 'Ghi nhận ngân sách dự kiến', false, 3);

    -- Nhiệm vụ 1.2
    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Tư vấn sản phẩm & vật liệu', 'high', 2) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Giới thiệu các dòng sản phẩm phù hợp', true, 1),
      (task_id, 'Tư vấn vật liệu (gỗ, phụ kiện, mặt đá)', true, 2),
      (task_id, 'Gửi catalog / hình ảnh mẫu', false, 3);

    -- Nhiệm vụ 1.3
    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Khảo sát thực tế', 'medium', 3) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Hẹn lịch khảo sát với KH', true, 1),
      (task_id, 'Đo kích thước thực tế', true, 2),
      (task_id, 'Chụp ảnh hiện trạng', true, 3),
      (task_id, 'Ghi nhận yêu cầu đặc biệt', false, 4);

    -- Nhiệm vụ 1.4
    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Ghi nhận nhu cầu chi tiết', 'medium', 4) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Tổng hợp yêu cầu KH vào hồ sơ', true, 1),
      (task_id, 'Xác nhận lại với KH qua điện thoại/Zalo', true, 2);

    -- ─── QT2: Thiết kế ───
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Thiết kế', 'Thiết kế bản vẽ 2D/3D, KH duyệt, xuất bản vẽ kỹ thuật', '#EC4899', '🎨', 2, cty.id, true)
    RETURNING id INTO proc_id;

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Thiết kế bản vẽ sơ bộ', 'high', 1) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Vẽ layout 2D từ số đo', true, 1),
      (task_id, 'Chọn phong cách & màu sắc', true, 2);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Thiết kế 3D render', 'high', 2) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Dựng 3D từ bản vẽ 2D', true, 1),
      (task_id, 'Render hình ảnh chất lượng cao', true, 2),
      (task_id, 'Gửi cho KH xem trước', true, 3);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Chỉnh sửa theo feedback KH', 'medium', 3) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Ghi nhận feedback từ KH', true, 1),
      (task_id, 'Chỉnh sửa bản vẽ', true, 2),
      (task_id, 'KH duyệt bản vẽ cuối', true, 3);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Xuất bản vẽ kỹ thuật & CNC', 'high', 4) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Hoàn thiện bản vẽ kỹ thuật chi tiết', true, 1),
      (task_id, 'Xuất file CNC cho sản xuất', true, 2);

    -- ─── QT3: Báo giá & Hợp đồng ───
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Báo giá & Hợp đồng', 'Bóc tách vật tư, lập báo giá, ký HĐ, thu cọc', '#F59E0B', '💰', 3, cty.id, true)
    RETURNING id INTO proc_id;

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Bóc tách & lập báo giá', 'high', 1) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Bóc tách vật tư từ bản vẽ kỹ thuật', true, 1),
      (task_id, 'Tính toán chi phí vật liệu + gia công', true, 2),
      (task_id, 'Lập báo giá chi tiết', true, 3),
      (task_id, 'Gửi báo giá cho KH', true, 4);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Thương lượng & chốt giá', 'medium', 2) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Thương lượng giá với KH', true, 1),
      (task_id, 'Chốt giá cuối cùng', true, 2);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Ký hợp đồng & thu cọc', 'urgent', 3) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Soạn hợp đồng', true, 1),
      (task_id, 'KH review & ký hợp đồng', true, 2),
      (task_id, 'Thu tiền đặt cọc', true, 3),
      (task_id, 'Scan / lưu HĐ đã ký', true, 4);

  END LOOP;
END $$;

-- ════════════════════════════════════════════
-- KHỐI SẢN XUẤT
-- ════════════════════════════════════════════
DO $$
DECLARE
  cty RECORD;
  proc_id UUID;
  task_id UUID;
BEGIN
  FOR cty IN
    SELECT u.id FROM ecosystem_units u
    JOIN ecosystem_units parent ON u.parent_id = parent.id
    WHERE parent.name ILIKE '%Sản Xuất%' AND u.is_active = true
  LOOP
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Sản xuất', 'Quy trình sản xuất từ NVL đến thành phẩm đóng gói', '#F97316', '🏭', 1, cty.id, true)
    RETURNING id INTO proc_id;

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Chuẩn bị nguyên vật liệu', 'high', 1) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Đặt mua NVL theo bảng bóc tách', true, 1),
      (task_id, 'Kiểm tra NVL nhập kho', true, 2),
      (task_id, 'Phân loại & sắp xếp NVL', true, 3);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Gia công CNC & dán cạnh', 'high', 2) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Cắt CNC theo bản vẽ kỹ thuật', true, 1),
      (task_id, 'Dán cạnh / phủ bề mặt', true, 2),
      (task_id, 'Kiểm tra kích thước sau cắt', true, 3);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Lắp ráp & hoàn thiện', 'high', 3) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Lắp ráp khung tủ', true, 1),
      (task_id, 'Lắp phụ kiện (bản lề, ray, giảm chấn)', true, 2),
      (task_id, 'Sơn / hoàn thiện bề mặt (nếu có)', false, 3);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Kiểm tra QC & đóng gói', 'urgent', 4) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Kiểm tra chất lượng tổng thể', true, 1),
      (task_id, 'Đối chiếu với bản vẽ kỹ thuật', true, 2),
      (task_id, 'Đóng gói & dán nhãn', true, 3),
      (task_id, 'Chuyển kho chờ xuất', true, 4);

  END LOOP;
END $$;

-- ════════════════════════════════════════════
-- KHỐI VẬN CHUYỂN & LẮP ĐẶT
-- ════════════════════════════════════════════
DO $$
DECLARE
  cty RECORD;
  proc_id UUID;
  task_id UUID;
BEGIN
  FOR cty IN
    SELECT u.id FROM ecosystem_units u
    JOIN ecosystem_units parent ON u.parent_id = parent.id
    WHERE (parent.name ILIKE '%Vận Chuyển%' OR parent.name ILIKE '%Lắp Đặt%'
           OR parent.name ILIKE '%VCLD%' OR parent.name ILIKE '%Giao hàng%')
    AND u.is_active = true
  LOOP
    -- ─── QT: Vận chuyển & Lắp đặt ───
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Vận chuyển & Lắp đặt', 'Giao hàng, lắp đặt, nghiệm thu tại công trình', '#06B6D4', '🚚', 1, cty.id, true)
    RETURNING id INTO proc_id;

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Chuẩn bị & vận chuyển', 'high', 1) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Kiểm tra hàng trước khi xuất kho', true, 1),
      (task_id, 'Đối chiếu với danh sách đóng gói', true, 2),
      (task_id, 'Sắp xếp xe vận chuyển', true, 3),
      (task_id, 'Giao hàng đến công trình', true, 4);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Lắp đặt tại công trình', 'high', 2) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Kiểm tra hiện trạng công trình', true, 1),
      (task_id, 'Lắp đặt tủ bếp theo bản vẽ', true, 2),
      (task_id, 'Lắp đặt mặt đá / thiết bị', true, 3),
      (task_id, 'Căn chỉnh & hoàn thiện chi tiết', true, 4);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Nghiệm thu & bàn giao', 'urgent', 3) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Nghiệm thu với khách hàng', true, 1),
      (task_id, 'Chụp ảnh hoàn thiện công trình', true, 2),
      (task_id, 'KH ký biên bản nghiệm thu', true, 3),
      (task_id, 'Dọn dẹp vệ sinh công trình', true, 4);

    -- ─── QT: Bảo hành & CSKH ───
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Bảo hành & CSKH', 'Chăm sóc sau bán hàng, xử lý bảo hành', '#EF4444', '❤️', 2, cty.id, true)
    RETURNING id INTO proc_id;

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Chăm sóc sau lắp đặt', 'medium', 1) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Gọi điện hỏi thăm sau 3 ngày', true, 1),
      (task_id, 'Gọi điện hỏi thăm sau 1 tháng', true, 2),
      (task_id, 'Ghi nhận phản hồi / khiếu nại', true, 3);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Xử lý bảo hành', 'high', 2) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Tiếp nhận yêu cầu bảo hành', true, 1),
      (task_id, 'Đánh giá & lên phương án xử lý', true, 2),
      (task_id, 'Thực hiện bảo hành', true, 3),
      (task_id, 'KH xác nhận hoàn thành', true, 4);

    INSERT INTO company_process_tasks (id, process_id, title, priority, order_index)
    VALUES (gen_random_uuid(), proc_id, 'Xin đánh giá & giới thiệu', 'low', 3) RETURNING id INTO task_id;
    INSERT INTO company_process_checklists (task_id, title, is_required, order_index) VALUES
      (task_id, 'Xin review / đánh giá từ KH', false, 1),
      (task_id, 'Đề xuất cross-sell / upsell', false, 2),
      (task_id, 'Xin giới thiệu KH mới', false, 3);

  END LOOP;
END $$;
