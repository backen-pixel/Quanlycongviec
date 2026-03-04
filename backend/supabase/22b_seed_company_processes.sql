-- ═══════════════════════════════════════════════════════════════
-- SEED: QT nội bộ Cty — đầy đủ NV + CL
-- Chạy SAU: 22_company_workflows.sql
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_unit RECORD;
  v_pname TEXT;
  v_proc_id UUID;
  v_task_id UUID;
BEGIN
  FOR v_unit IN
    SELECT eu.id as uid, eu.name as uname, parent.name as pname
    FROM ecosystem_units eu
    JOIN ecosystem_units parent ON parent.id = eu.parent_id
    JOIN ecosystem_levels el ON el.id = eu.level_id
    WHERE el.depth = 2 AND eu.is_active = true
    ORDER BY parent.name, eu.name
  LOOP
    IF EXISTS (SELECT 1 FROM company_processes WHERE company_unit_id = v_unit.uid LIMIT 1) THEN CONTINUE; END IF;
    v_pname := LOWER(v_unit.pname);

    -- ═══ KHỐI KINH DOANH / TƯ VẤN ═══
    IF v_pname LIKE '%kinh doanh%' OR v_pname LIKE '%tư vấn%' OR v_pname LIKE '%sales%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Tiếp nhận khách hàng','Tiếp nhận, phân loại, ghi nhận nhu cầu','#8B5CF6','💬',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Tiếp nhận thông tin KH','high',1,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id ORDER BY order_index LIMIT 1;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_note) VALUES (v_task_id,'Ghi nhận nhu cầu KH',1,true),(v_task_id,'Xác nhận thông tin liên hệ',2,false),(v_task_id,'Phân loại KH (VIP/Thường)',3,true);
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Khảo sát hiện trạng','high',2,2);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Chụp ảnh hiện trạng',1,true,false),(v_task_id,'Đo kích thước',2,false,true),(v_task_id,'Ghi nhận yêu cầu đặc biệt',3,false,true);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Tư vấn giải pháp','Tư vấn vật liệu, phong cách','#6366F1','🔍',2) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Tư vấn chất liệu & phong cách','medium',1,1),(v_proc_id,'Gửi catalogue & mẫu sản phẩm','medium',2,1),(v_proc_id,'Xác nhận phương án KH chọn','high',3,2);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_note) VALUES (v_task_id,'Xác nhận phong cách đã chọn',1,true),(v_task_id,'Xác nhận vật liệu đã chọn',2,true);

    ELSIF v_pname LIKE '%thiết kế%' OR v_pname LIKE '%design%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Thiết kế 2D','Bản vẽ mặt bằng, mặt đứng, mặt cắt','#EC4899','📐',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Vẽ mặt bằng bố trí','high',1,2),(v_proc_id,'Vẽ mặt đứng + cắt','high',2,2),(v_proc_id,'Duyệt nội bộ 2D','medium',3,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=1;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'File bản vẽ mặt bằng (DWG/PDF)',1,true),(v_task_id,'Bản vẽ tỷ lệ đúng',2,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'File mặt đứng (PDF)',1,true),(v_task_id,'File mặt cắt (PDF)',2,true);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Thiết kế 3D','Render phối cảnh cho KH duyệt','#F472B6','🎨',2) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Dựng mô hình 3D','high',1,3),(v_proc_id,'Render 4 góc phối cảnh','high',2,2),(v_proc_id,'KH duyệt & xác nhận','urgent',3,2);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Render góc 1 (1920x1080)',1,true),(v_task_id,'Render góc 2',2,true),(v_task_id,'Render góc 3',3,true),(v_task_id,'Render toàn cảnh',4,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Biên bản duyệt TK (có chữ ký KH)',1,true,false),(v_task_id,'Ghi chú chỉnh sửa (nếu có)',2,false,true);

    ELSIF v_pname LIKE '%báo giá%' OR v_pname LIKE '%quotation%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Bóc tách & Báo giá','Bóc tách vật tư, lập báo giá chi tiết','#F59E0B','💰',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Bóc tách vật tư theo TK','high',1,2),(v_proc_id,'Lấy giá NCC','medium',2,1),(v_proc_id,'Lập bảng báo giá chi tiết','high',3,1),(v_proc_id,'Review & gửi cho KH','urgent',4,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=1;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'File bóc tách vật tư (Excel)',1,true),(v_task_id,'Tính toán khối lượng',2,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Bảng báo giá có tỷ lệ margin',1,true),(v_task_id,'Điều kiện thanh toán rõ ràng',2,true);

    ELSIF v_pname LIKE '%hợp đồng%' OR v_pname LIKE '%contract%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Soạn & Ký hợp đồng','Soạn HĐ, đàm phán, ký, thu cọc','#10B981','📝',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Soạn hợp đồng','high',1,2),(v_proc_id,'Đàm phán điều khoản','medium',2,2),(v_proc_id,'Ký HĐ & thu cọc','urgent',3,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=1;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Draft HĐ theo template',1,true),(v_task_id,'Gắn TK + BG vào HĐ',2,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'HĐ đã ký 2 bên (scan PDF)',1,true),(v_task_id,'Biên nhận tiền cọc / UNC',2,true);

    ELSIF v_pname LIKE '%sản xuất%' OR v_pname LIKE '%production%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Chuẩn bị SX','Triển khai bản vẽ SX, đặt vật tư','#F97316','📦',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Triển khai bản vẽ SX','high',1,2),(v_proc_id,'Đặt mua vật tư','high',2,3),(v_proc_id,'Kiểm tra vật tư nhập kho','medium',3,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Đơn đặt hàng NCC ký',1,true),(v_task_id,'Phiếu nhập kho & kiểm tra',2,true);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Gia công','CNC, dán cạnh, sơn, lắp ráp','#EA580C','🏭',2) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Cắt CNC theo bản vẽ','high',1,3),(v_proc_id,'Dán cạnh PVC/chạm','high',2,2),(v_proc_id,'Sơn/phủ bề mặt','high',3,2),(v_proc_id,'Lắp ráp bán thành phẩm','high',4,2);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=1;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Vật liệu cắt ở kho',1,false,true);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'QC','Kiểm tra chất lượng trước giao','#DC2626','✅',3) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Kiểm tra kích thước','high',1,1),(v_proc_id,'Kiểm tra bề mặt & màu sắc','high',2,1),(v_proc_id,'Chụp ảnh 3 góc hoàn thiện','medium',3,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Ảnh thành phẩm góc 1 (tối thiểu)',1,true),(v_task_id,'Ảnh thành phẩm góc 2',2,true),(v_task_id,'Ảnh bao quát toàn cảnh',3,true);

    ELSIF v_pname LIKE '%vận chuyển%' OR v_pname LIKE '%shipping%' OR v_pname LIKE '%giao hàng%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Đóng gói & Vận chuyển','Đóng gói, lên xe, giao đến CT','#06B6D4','🚛',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Đóng gói sản phẩm','high',1,1),(v_proc_id,'Lập phiếu xuất kho','medium',2,1),(v_proc_id,'Vận chuyển đến công trình','high',3,1),(v_proc_id,'Bàn giao & chụp ảnh','urgent',4,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Phiếu xuất kho ký duyệt',1,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=4;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Ảnh hàng tại công trình',1,true,false),(v_task_id,'Biên bản giao nhận ký 2 bên',2,true,false),(v_task_id,'Ghi chú hư hỏng nếu có',3,false,true);

    ELSIF v_pname LIKE '%lắp đặt%' OR v_pname LIKE '%install%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Lắp đặt','Lắp đặt, hiệu chỉnh, nghiệm thu','#3B82F6','🔧',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Chuẩn bị mặt bằng','medium',1,1),(v_proc_id,'Lắp cơ sở tủ bếp','high',2,2),(v_proc_id,'Lắp phụ kiện & thiết bị','high',3,1),(v_proc_id,'Hiệu chỉnh & vệ sinh','medium',4,1),(v_proc_id,'Nghiệm thu với KH','urgent',5,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=5;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Ảnh lắp đặt hoàn thiện 3 góc',1,true,false),(v_task_id,'Biên bản nghiệm thu ký KH',2,true,false),(v_task_id,'Hướng dẫn sử dụng',3,false,true),(v_task_id,'Phản hồi chất lượng KH',4,false,true);

    ELSIF v_pname LIKE '%cskh%' OR v_pname LIKE '%chăm sóc%' OR v_pname LIKE '%customer%' OR v_pname LIKE '%care%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Bàn giao & Hướng dẫn','Hướng dẫn sử dụng, bàn giao bảo hành','#EF4444','📋',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Hướng dẫn sử dụng & bảo quản','high',1,1),(v_proc_id,'Bàn giao phiếu bảo hành','high',2,1),(v_proc_id,'Thu công nợ còn lại','urgent',3,3);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Phiếu bảo hành 24 tháng ký',1,true),(v_task_id,'Hướng dẫn bảo trì file/video',2,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Biên nhận thanh toán 100% / UNC',1,true);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Chăm sóc sau bán','Bảo hành, hỗ trợ, khảo sát','#F87171','❤️',2) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Gọi hỏi thăm sau 7 ngày','medium',1,7),(v_proc_id,'Gọi hỏi thăm sau 30 ngày','low',2,30),(v_proc_id,'Xử lý bảo hành nếu có lỗi','high',3,3);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Ảnh lỗi/hư hỏng (nếu có)',1,true,false),(v_task_id,'Biên bản xử lý bảo hành',2,true,true);

    ELSE
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Tiếp nhận & Xử lý','Tiếp nhận, phân công, thực hiện','#6366F1','📋',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Tiếp nhận yêu cầu','high',1,1),(v_proc_id,'Phân công nhân viên','medium',2,1),(v_proc_id,'Thực hiện công việc','high',3,3);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Kiểm tra & Bàn giao','Kiểm tra, bàn giao kết quả','#10B981','✅',2) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Kiểm tra chất lượng','high',1,1),(v_proc_id,'Bàn giao cho KH','urgent',2,1);
    END IF;

    RAISE NOTICE 'QT [%] → Khối [%]', v_unit.uname, v_unit.pname;
  END LOOP;
END $$;
