-- Seed data: Quy trình nội bộ mẫu
-- Chạy SAU migration 22_company_workflows.sql
-- Dùng CTE để tạo data mẫu cho Công ty đầu tiên trong hệ sinh thái

-- ═══ TẠO QUY TRÌNH MẪU CHO TẤT CẢ CÔNG TY (depth=2) ═══
-- Mỗi Công ty sẽ có bộ quy trình gợi ý dựa trên Khối mà nó thuộc
-- Admin có thể chạy API: POST /api/company-processes/generate-suggestions/:unitId
-- Hoặc chạy seed SQL này để tạo sẵn

-- ═══ QUY TRÌNH MẪU: KHỐI KINH DOANH ═══
-- Áp dụng cho Cty thuộc Khối Kinh doanh / Tư vấn

DO $$ 
DECLARE
  v_unit RECORD;
  v_proc_id UUID;
  v_task_id UUID;
BEGIN
  -- Tìm tất cả company units (depth=2) 
  FOR v_unit IN 
    SELECT eu.id as unit_id, eu.name as unit_name, eu.parent_id,
           parent.name as parent_name
    FROM ecosystem_units eu
    JOIN ecosystem_units parent ON parent.id = eu.parent_id
    JOIN ecosystem_levels el ON el.id = eu.level_id
    WHERE el.depth = 2 AND eu.is_active = true
    LIMIT 3  -- Chỉ seed cho 3 Cty đầu
  LOOP
    -- Kiểm tra đã có quy trình chưa
    IF EXISTS (SELECT 1 FROM company_processes WHERE company_unit_id = v_unit.unit_id LIMIT 1) THEN
      CONTINUE;
    END IF;

    -- === QUY TRÌNH 1: Tiếp nhận & Tư vấn ===
    INSERT INTO company_processes (company_unit_id, name, description, color, icon, order_index)
    VALUES (v_unit.unit_id, 'Tiếp nhận & Tư vấn', 'Tiếp nhận yêu cầu khách hàng, tư vấn giải pháp', '#8B5CF6', '💬', 1)
    RETURNING id INTO v_proc_id;

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Tiếp nhận thông tin khách hàng', 'high', 1, 1);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 1;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_note) VALUES
    (v_task_id, 'Ghi nhận nhu cầu khách hàng', 1, true),
    (v_task_id, 'Xác nhận thông tin liên hệ', 2, false),
    (v_task_id, 'Phân loại khách hàng (VIP/Thường)', 3, true);

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Khảo sát hiện trạng', 'high', 2, 2);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 2;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_file, require_note) VALUES
    (v_task_id, 'Chụp ảnh hiện trạng', 1, true, false),
    (v_task_id, 'Đo kích thước', 2, false, true),
    (v_task_id, 'Ghi nhận yêu cầu đặc biệt', 3, false, true);

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Tư vấn giải pháp & vật liệu', 'medium', 3, 1);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 3;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_file) VALUES
    (v_task_id, 'Gửi catalogue sản phẩm', 1, true),
    (v_task_id, 'Tư vấn chất liệu phù hợp', 2, false);

    -- === QUY TRÌNH 2: Thiết kế ===
    INSERT INTO company_processes (company_unit_id, name, description, color, icon, order_index)
    VALUES (v_unit.unit_id, 'Thiết kế', 'Thiết kế bản vẽ 2D/3D cho khách duyệt', '#EC4899', '🎨', 2)
    RETURNING id INTO v_proc_id;

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Thiết kế bản vẽ 2D', 'high', 1, 3);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 1;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_file) VALUES
    (v_task_id, 'File bản vẽ 2D (PDF/DWG)', 1, true),
    (v_task_id, 'Bản vẽ mặt bằng bố trí', 2, true);

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Thiết kế 3D render', 'high', 2, 3);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 2;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_file) VALUES
    (v_task_id, 'File render 3D góc 1', 1, true),
    (v_task_id, 'File render 3D góc 2', 2, true),
    (v_task_id, 'File render 3D toàn cảnh', 3, true);

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Khách duyệt bản thiết kế', 'urgent', 3, 2);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 3;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_file, require_note) VALUES
    (v_task_id, 'Biên bản duyệt thiết kế có chữ ký', 1, true, false),
    (v_task_id, 'Ghi chú chỉnh sửa (nếu có)', 2, false, true);

    -- === QUY TRÌNH 3: Báo giá & Hợp đồng ===
    INSERT INTO company_processes (company_unit_id, name, description, color, icon, order_index)
    VALUES (v_unit.unit_id, 'Báo giá & Hợp đồng', 'Lập báo giá, ký hợp đồng, thu cọc', '#F59E0B', '💰', 3)
    RETURNING id INTO v_proc_id;

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Bóc tách vật tư & báo giá', 'high', 1, 2);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 1;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_file) VALUES
    (v_task_id, 'Bảng bóc tách vật tư', 1, true),
    (v_task_id, 'Bảng báo giá chi tiết', 2, true);

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Soạn & ký hợp đồng', 'urgent', 2, 2);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 2;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_file) VALUES
    (v_task_id, 'Hợp đồng đã ký scan', 1, true),
    (v_task_id, 'Biên nhận tiền cọc', 2, true);

    -- === QUY TRÌNH 4: Sản xuất ===
    INSERT INTO company_processes (company_unit_id, name, description, color, icon, order_index)
    VALUES (v_unit.unit_id, 'Sản xuất', 'Đặt vật tư, gia công, kiểm tra chất lượng', '#F97316', '🏭', 4)
    RETURNING id INTO v_proc_id;

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Đặt mua vật tư', 'high', 1, 3),
    (v_proc_id, 'Gia công CNC', 'high', 2, 5),
    (v_proc_id, 'Lắp ráp & hoàn thiện', 'high', 3, 3),
    (v_proc_id, 'Kiểm tra chất lượng (QC)', 'urgent', 4, 1);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 4;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_file, require_note) VALUES
    (v_task_id, 'Ảnh sản phẩm hoàn thiện', 1, true, false),
    (v_task_id, 'Biên bản nghiệm thu nội bộ', 2, true, false),
    (v_task_id, 'Ghi chú lỗi cần sửa (nếu có)', 3, false, true);

    -- === QUY TRÌNH 5: Giao hàng & Lắp đặt ===
    INSERT INTO company_processes (company_unit_id, name, description, color, icon, order_index)
    VALUES (v_unit.unit_id, 'Giao hàng & Lắp đặt', 'Đóng gói, vận chuyển, lắp đặt tại công trình', '#3B82F6', '🚛', 5)
    RETURNING id INTO v_proc_id;

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Đóng gói sản phẩm', 'medium', 1, 1),
    (v_proc_id, 'Vận chuyển đến công trình', 'high', 2, 1),
    (v_proc_id, 'Lắp đặt tại công trình', 'high', 3, 2),
    (v_proc_id, 'Nghiệm thu với khách hàng', 'urgent', 4, 1);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 4;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_file, require_note) VALUES
    (v_task_id, 'Ảnh lắp đặt hoàn thiện', 1, true, false),
    (v_task_id, 'Biên bản nghiệm thu có chữ ký KH', 2, true, false),
    (v_task_id, 'Feedback khách hàng', 3, false, true);

    -- === QUY TRÌNH 6: Chăm sóc khách hàng ===
    INSERT INTO company_processes (company_unit_id, name, description, color, icon, order_index)
    VALUES (v_unit.unit_id, 'Chăm sóc khách hàng', 'Bảo hành, hỗ trợ sau bán hàng', '#EF4444', '❤️', 6)
    RETURNING id INTO v_proc_id;

    INSERT INTO company_process_tasks (process_id, title, priority, order_index, deadline_days) VALUES
    (v_proc_id, 'Gọi điện hỏi thăm sau 7 ngày', 'medium', 1, 7),
    (v_proc_id, 'Xử lý bảo hành (nếu có)', 'high', 2, 3);
    SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id = v_proc_id AND order_index = 2;
    INSERT INTO company_process_checklists (task_id, title, order_index, require_file, require_note) VALUES
    (v_task_id, 'Ảnh lỗi/hư hỏng', 1, true, false),
    (v_task_id, 'Biên bản xử lý bảo hành', 2, true, true);

    RAISE NOTICE 'Đã tạo 6 quy trình mẫu cho Cty: % (%)', v_unit.unit_name, v_unit.unit_id;
  END LOOP;
END $$;
