-- ═══════════════════════════════════════════════════════════════
-- SEED: QT nội bộ Cty + Luồng mẫu hoàn chỉnh
-- Chạy SAU: 22_company_workflows.sql
-- Thứ tự 8 Khối: KD → TK → BG → HĐ → SX → VC → LĐ → CSKH
-- ═══════════════════════════════════════════════════════════════

-- ═══ PHẦN 1: QT NỘI BỘ THEO KHỐI ═══
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

    IF v_pname LIKE '%kinh doanh%' OR v_pname LIKE '%tư vấn%' OR v_pname LIKE '%sales%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Tiếp nhận khách hàng','Tiếp nhận, phân loại, ghi nhận nhu cầu','#8B5CF6','💬',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Tiếp nhận thông tin KH','high',1,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=1;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_note) VALUES (v_task_id,'Ghi nhận nhu cầu KH',1,true),(v_task_id,'Xác nhận liên hệ',2,false),(v_task_id,'Phân loại KH',3,true);
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Khảo sát hiện trạng','high',2,2);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Chụp ảnh hiện trạng',1,true,false),(v_task_id,'Đo kích thước',2,false,true);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Tư vấn giải pháp','Tư vấn vật liệu, phong cách','#6366F1','🔍',2) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Tư vấn chất liệu','medium',1,1),(v_proc_id,'Gửi catalogue','medium',2,1),(v_proc_id,'KH xác nhận phương án','high',3,2);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_note) VALUES (v_task_id,'Xác nhận phong cách',1,true),(v_task_id,'Xác nhận vật liệu',2,true);

    ELSIF v_pname LIKE '%thiết kế%' OR v_pname LIKE '%design%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Thiết kế 2D','Bản vẽ mặt bằng, mặt đứng, mặt cắt','#EC4899','📐',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Vẽ mặt bằng bố trí','high',1,2),(v_proc_id,'Vẽ mặt đứng + cắt','high',2,2),(v_proc_id,'Duyệt nội bộ 2D','medium',3,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=1;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'File bản vẽ mặt bằng',1,true);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Thiết kế 3D','Render phối cảnh cho KH duyệt','#F472B6','🎨',2) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Dựng mô hình 3D','high',1,3),(v_proc_id,'Render phối cảnh','high',2,2),(v_proc_id,'KH duyệt thiết kế','urgent',3,2);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Render góc 1',1,true),(v_task_id,'Render góc 2',2,true),(v_task_id,'Render toàn cảnh',3,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Biên bản duyệt TK có chữ ký',1,true,false),(v_task_id,'Ghi chú chỉnh sửa',2,false,true);

    ELSIF v_pname LIKE '%báo giá%' OR v_pname LIKE '%quotation%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Bóc tách & Báo giá','Bóc tách vật tư, lập báo giá chi tiết','#F59E0B','💰',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Bóc tách vật tư','high',1,2),(v_proc_id,'Lấy giá NCC','medium',2,1),(v_proc_id,'Lập bảng báo giá','high',3,1),(v_proc_id,'Gửi báo giá cho KH','urgent',4,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=1;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'File bóc tách (Excel)',1,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Bảng báo giá (PDF)',1,true);

    ELSIF v_pname LIKE '%hợp đồng%' OR v_pname LIKE '%contract%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Soạn & Ký hợp đồng','Soạn HĐ, đàm phán, ký, thu cọc','#10B981','📝',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Soạn hợp đồng','high',1,2),(v_proc_id,'Đàm phán điều khoản','medium',2,2),(v_proc_id,'Ký hợp đồng','urgent',3,1),(v_proc_id,'Thu tiền cọc','urgent',4,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'HĐ đã ký scan (PDF)',1,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=4;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Biên nhận cọc / UNC',1,true);

    ELSIF v_pname LIKE '%sản xuất%' OR v_pname LIKE '%production%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Chuẩn bị SX','Triển khai bản vẽ SX, đặt vật tư','#F97316','📦',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Triển khai bản vẽ SX','high',1,2),(v_proc_id,'Đặt mua vật tư','high',2,3),(v_proc_id,'Kiểm tra vật tư nhập kho','medium',3,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Đơn đặt hàng NCC',1,true),(v_task_id,'Phiếu nhập kho',2,true);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Gia công','CNC, dán cạnh, sơn, lắp ráp','#EA580C','🏭',2) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Cắt CNC','high',1,3),(v_proc_id,'Dán cạnh','high',2,2),(v_proc_id,'Sơn/phủ bề mặt','high',3,2),(v_proc_id,'Lắp ráp bán thành phẩm','high',4,2);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'QC','Kiểm tra chất lượng trước giao','#DC2626','✅',3) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Kiểm tra kích thước','high',1,1),(v_proc_id,'Kiểm tra bề mặt','high',2,1),(v_proc_id,'Chụp ảnh thành phẩm','medium',3,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Ảnh thành phẩm',1,true),(v_task_id,'Biên bản QC',2,true);

    ELSIF v_pname LIKE '%vận chuyển%' OR v_pname LIKE '%shipping%' OR v_pname LIKE '%giao hàng%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Đóng gói & Vận chuyển','Đóng gói, giao đến công trình','#06B6D4','🚛',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Đóng gói','high',1,1),(v_proc_id,'Lập phiếu xuất kho','medium',2,1),(v_proc_id,'Vận chuyển','high',3,1),(v_proc_id,'Bàn giao tại CT','urgent',4,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Phiếu xuất kho',1,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=4;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Ảnh hàng tại CT',1,true,false),(v_task_id,'Biên bản giao nhận',2,true,false),(v_task_id,'Ghi chú hư hỏng',3,false,true);

    ELSIF v_pname LIKE '%lắp đặt%' OR v_pname LIKE '%install%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Lắp đặt','Lắp đặt, hiệu chỉnh, nghiệm thu','#3B82F6','🔧',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Chuẩn bị mặt bằng','medium',1,1),(v_proc_id,'Lắp tủ bếp','high',2,2),(v_proc_id,'Lắp phụ kiện & thiết bị','high',3,1),(v_proc_id,'Hiệu chỉnh & vệ sinh','medium',4,1),(v_proc_id,'Nghiệm thu KH','urgent',5,1);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=5;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Ảnh lắp hoàn thiện',1,true,false),(v_task_id,'Biên bản nghiệm thu KH',2,true,false),(v_task_id,'Phản hồi KH',3,false,true);

    ELSIF v_pname LIKE '%cskh%' OR v_pname LIKE '%chăm sóc%' OR v_pname LIKE '%customer%' OR v_pname LIKE '%care%' THEN
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Bàn giao & Hướng dẫn','Hướng dẫn sử dụng, bàn giao bảo hành','#EF4444','📋',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Hướng dẫn sử dụng','high',1,1),(v_proc_id,'Bàn giao phiếu bảo hành','high',2,1),(v_proc_id,'Thu công nợ còn lại','urgent',3,3);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=2;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Phiếu bảo hành đã ký',1,true);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file) VALUES (v_task_id,'Biên nhận thanh toán',1,true);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Chăm sóc sau bán','Bảo hành, hỗ trợ sau bán','#F87171','❤️',2) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Gọi hỏi thăm 7 ngày','medium',1,7),(v_proc_id,'Gọi hỏi thăm 30 ngày','low',2,30),(v_proc_id,'Xử lý bảo hành','high',3,3);
      SELECT id INTO v_task_id FROM company_process_tasks WHERE process_id=v_proc_id AND order_index=3;
      INSERT INTO company_process_checklists (task_id,title,order_index,require_file,require_note) VALUES (v_task_id,'Ảnh lỗi',1,true,false),(v_task_id,'Biên bản bảo hành',2,true,true);

    ELSE
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Tiếp nhận & Xử lý','Tiếp nhận, phân công, thực hiện','#6366F1','📋',1) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Tiếp nhận','high',1,1),(v_proc_id,'Phân công','medium',2,1),(v_proc_id,'Thực hiện','high',3,3);
      INSERT INTO company_processes (company_unit_id,name,description,color,icon,order_index) VALUES (v_unit.uid,'Kiểm tra & Bàn giao','Kiểm tra, bàn giao kết quả','#10B981','✅',2) RETURNING id INTO v_proc_id;
      INSERT INTO company_process_tasks (process_id,title,priority,order_index,deadline_days) VALUES (v_proc_id,'Kiểm tra','high',1,1),(v_proc_id,'Bàn giao','urgent',2,1);
    END IF;

    RAISE NOTICE 'QT cho [%] Khối [%]', v_unit.uname, v_unit.pname;
  END LOOP;
END $$;


-- ═══ PHẦN 2: TẠO LUỒNG MẪU + GẮN KHỐI + GẮN QT ═══
DO $$
DECLARE
  v_flow_id UUID;
  v_step_id UUID;
  v_div_id UUID;
  v_comp_id UUID;
  v_proc RECORD;
  v_step_order INT := 0;
  v_proc_order INT;
  v_keywords TEXT[][] := ARRAY[
    ARRAY['kinh doanh','tư vấn','sales','consulting'],
    ARRAY['thiết kế','design'],
    ARRAY['báo giá','quotation'],
    ARRAY['hợp đồng','contract'],
    ARRAY['sản xuất','production'],
    ARRAY['vận chuyển','shipping','giao hàng'],
    ARRAY['lắp đặt','install'],
    ARRAY['cskh','chăm sóc','customer care']
  ];
  v_kw_group TEXT[];
  v_kw TEXT;
  v_found BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM workflow_flows LIMIT 1) THEN
    RAISE NOTICE 'Đã có luồng, bỏ qua';
    RETURN;
  END IF;

  INSERT INTO workflow_flows (name,description,color,icon,is_default)
  VALUES ('Luồng tủ bếp chuẩn','KD → TK → BG → HĐ → SX → VC → LĐ → CSKH','#6366F1','🔄',true)
  RETURNING id INTO v_flow_id;

  -- Duyệt theo thứ tự 8 nhóm keyword
  FOR i IN 1..array_length(v_keywords,1) LOOP
    v_kw_group := v_keywords[i];
    v_found := false;

    -- Tìm Khối match keyword
    FOREACH v_kw IN ARRAY v_kw_group LOOP
      IF v_found THEN EXIT; END IF;

      SELECT eu.id INTO v_div_id
      FROM ecosystem_units eu
      JOIN ecosystem_levels el ON el.id = eu.level_id
      WHERE el.depth = 1 AND eu.is_active = true
        AND LOWER(eu.name) LIKE '%' || v_kw || '%'
      LIMIT 1;

      IF v_div_id IS NOT NULL THEN
        v_found := true;

        -- Lấy Cty đầu tiên trong Khối
        SELECT eu.id INTO v_comp_id
        FROM ecosystem_units eu
        JOIN ecosystem_levels el ON el.id = eu.level_id
        WHERE el.depth = 2 AND eu.parent_id = v_div_id AND eu.is_active = true
        ORDER BY eu.name LIMIT 1;

        -- Tạo flow step
        v_step_order := v_step_order + 1;
        INSERT INTO workflow_flow_steps (flow_id, division_unit_id, company_unit_id, order_index)
        VALUES (v_flow_id, v_div_id, v_comp_id, v_step_order)
        RETURNING id INTO v_step_id;

        -- Gắn TẤT CẢ quy trình của Cty vào step
        IF v_comp_id IS NOT NULL THEN
          v_proc_order := 0;
          FOR v_proc IN
            SELECT id FROM company_processes
            WHERE company_unit_id = v_comp_id AND is_active = true
            ORDER BY order_index
          LOOP
            v_proc_order := v_proc_order + 1;
            INSERT INTO flow_step_processes (flow_step_id, process_id, order_index, is_required)
            VALUES (v_step_id, v_proc.id, v_proc_order, true);
          END LOOP;
        END IF;

        RAISE NOTICE 'Bước % → Khối [%] Cty [%]', v_step_order, v_div_id, v_comp_id;
        v_div_id := NULL;
        v_comp_id := NULL;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Luồng tạo xong: % bước', v_step_order;
END $$;


-- ═══ PHẦN 3: LUỒNG 2 — TỦ BẾP VIP (thêm bước, deadline dài hơn) ═══
DO $$
DECLARE
  v_flow_id UUID;
  v_step_id UUID;
  v_div_id UUID;
  v_comp_id UUID;
  v_proc RECORD;
  v_step_order INT := 0;
  v_proc_order INT;
  -- Thứ tự 8 Khối giống chuẩn nhưng Khối KD xuất hiện 2 lần (đầu + cuối)
  v_kw_groups TEXT[][] := ARRAY[
    ARRAY['kinh doanh','tư vấn','sales'],
    ARRAY['thiết kế','design'],
    ARRAY['báo giá','quotation'],
    ARRAY['hợp đồng','contract'],
    ARRAY['sản xuất','production'],
    ARRAY['vận chuyển','shipping','giao hàng'],
    ARRAY['lắp đặt','install'],
    ARRAY['cskh','chăm sóc','customer care'],
    ARRAY['kinh doanh','tư vấn','sales']
  ];
  v_kw_group TEXT[];
  v_kw TEXT;
  v_found BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM workflow_flows WHERE name LIKE '%VIP%' LIMIT 1) THEN
    RAISE NOTICE 'Luồng VIP đã có, bỏ qua';
    RETURN;
  END IF;

  INSERT INTO workflow_flows (name,description,color,icon,is_default)
  VALUES ('Tủ bếp VIP','KD → TK → BG → HĐ → SX → VC → LĐ → CSKH → KD (theo dõi VIP)','#D946EF','⭐',false)
  RETURNING id INTO v_flow_id;

  FOR i IN 1..array_length(v_kw_groups,1) LOOP
    v_kw_group := v_kw_groups[i];
    v_found := false;

    FOREACH v_kw IN ARRAY v_kw_group LOOP
      IF v_found THEN EXIT; END IF;
      SELECT eu.id INTO v_div_id FROM ecosystem_units eu
      JOIN ecosystem_levels el ON el.id = eu.level_id
      WHERE el.depth = 1 AND eu.is_active = true AND LOWER(eu.name) LIKE '%' || v_kw || '%'
      LIMIT 1;

      IF v_div_id IS NOT NULL THEN
        v_found := true;
        SELECT eu.id INTO v_comp_id FROM ecosystem_units eu
        JOIN ecosystem_levels el ON el.id = eu.level_id
        WHERE el.depth = 2 AND eu.parent_id = v_div_id AND eu.is_active = true
        ORDER BY eu.name LIMIT 1;

        v_step_order := v_step_order + 1;
        INSERT INTO workflow_flow_steps (flow_id, division_unit_id, company_unit_id, order_index)
        VALUES (v_flow_id, v_div_id, v_comp_id, v_step_order)
        RETURNING id INTO v_step_id;

        IF v_comp_id IS NOT NULL THEN
          v_proc_order := 0;
          FOR v_proc IN SELECT id FROM company_processes WHERE company_unit_id = v_comp_id AND is_active = true ORDER BY order_index LOOP
            v_proc_order := v_proc_order + 1;
            INSERT INTO flow_step_processes (flow_step_id, process_id, order_index, is_required) VALUES (v_step_id, v_proc.id, v_proc_order, true);
          END LOOP;
        END IF;

        v_div_id := NULL; v_comp_id := NULL;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Luồng VIP: % bước', v_step_order;
END $$;


-- ═══ PHẦN 4: LUỒNG 3 — SHOWROOM / TRƯNG BÀY (rút gọn) ═══
DO $$
DECLARE
  v_flow_id UUID;
  v_step_id UUID;
  v_div_id UUID;
  v_comp_id UUID;
  v_proc RECORD;
  v_step_order INT := 0;
  v_proc_order INT;
  -- Showroom: TK → SX → VC → LĐ (bỏ KD, BG, HĐ, CSKH)
  v_kw_groups TEXT[][] := ARRAY[
    ARRAY['thiết kế','design'],
    ARRAY['sản xuất','production'],
    ARRAY['vận chuyển','shipping','giao hàng'],
    ARRAY['lắp đặt','install']
  ];
  v_kw_group TEXT[];
  v_kw TEXT;
  v_found BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM workflow_flows WHERE name LIKE '%howroom%' LIMIT 1) THEN
    RAISE NOTICE 'Luồng Showroom đã có, bỏ qua';
    RETURN;
  END IF;

  INSERT INTO workflow_flows (name,description,color,icon,is_default)
  VALUES ('Showroom / Trưng bày','TK → SX → VC → LĐ (không qua KD, BG, HĐ, CSKH)','#0EA5E9','🏠',false)
  RETURNING id INTO v_flow_id;

  FOR i IN 1..array_length(v_kw_groups,1) LOOP
    v_kw_group := v_kw_groups[i];
    v_found := false;

    FOREACH v_kw IN ARRAY v_kw_group LOOP
      IF v_found THEN EXIT; END IF;
      SELECT eu.id INTO v_div_id FROM ecosystem_units eu
      JOIN ecosystem_levels el ON el.id = eu.level_id
      WHERE el.depth = 1 AND eu.is_active = true AND LOWER(eu.name) LIKE '%' || v_kw || '%'
      LIMIT 1;

      IF v_div_id IS NOT NULL THEN
        v_found := true;
        SELECT eu.id INTO v_comp_id FROM ecosystem_units eu
        JOIN ecosystem_levels el ON el.id = eu.level_id
        WHERE el.depth = 2 AND eu.parent_id = v_div_id AND eu.is_active = true
        ORDER BY eu.name LIMIT 1;

        v_step_order := v_step_order + 1;
        INSERT INTO workflow_flow_steps (flow_id, division_unit_id, company_unit_id, order_index)
        VALUES (v_flow_id, v_div_id, v_comp_id, v_step_order)
        RETURNING id INTO v_step_id;

        IF v_comp_id IS NOT NULL THEN
          v_proc_order := 0;
          FOR v_proc IN SELECT id FROM company_processes WHERE company_unit_id = v_comp_id AND is_active = true ORDER BY order_index LOOP
            v_proc_order := v_proc_order + 1;
            INSERT INTO flow_step_processes (flow_step_id, process_id, order_index, is_required) VALUES (v_step_id, v_proc.id, v_proc_order, true);
          END LOOP;
        END IF;

        v_div_id := NULL; v_comp_id := NULL;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Luồng Showroom: % bước', v_step_order;
END $$;
