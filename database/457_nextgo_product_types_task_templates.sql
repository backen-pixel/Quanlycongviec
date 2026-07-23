-- 457: NextGo — loại sản phẩm bao bì + bộ nhiệm vụ SX theo từng loại.
-- - Đảm bảo 6 phân loại workshop_project_types
-- - Tạo bộ mẫu nhiệm vụ SX (company + từng workshop_type) + bộ mặc định chung
-- - Bật crm_lead_types.workshop_production_templates
-- Idempotent.

DO $$
DECLARE
  v_nextgo UUID;
  v_type RECORD;
  v_tpl_id UUID;
  v_ord INT;
  v_rowcount INT := 0;
  n_tpl INT := 0;
  n_items INT := 0;
  type_names TEXT[] := ARRAY[
    'Túi giấy',
    'Hộp cứng',
    'Hộp mềm',
    'Hộp carton bồi in offset',
    'Hộp carton',
    'Thùng carton'
  ];
BEGIN
  SELECT id INTO v_nextgo
  FROM companies
  WHERE name ILIKE '%NextGo%' OR short_name ILIKE '%NextGo%'
  ORDER BY name
  LIMIT 1;

  IF v_nextgo IS NULL THEN
    RAISE EXCEPTION '457: Không tìm thấy công ty NextGo.';
  END IF;

  -- ── 1) Đảm bảo phân loại sản phẩm ──
  FOR v_ord IN 1..array_length(type_names, 1) LOOP
    INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active)
    SELECT v_nextgo, type_names[v_ord], 'production', v_ord, true
    WHERE NOT EXISTS (
      SELECT 1 FROM workshop_project_types w
      WHERE w.company_id = v_nextgo
        AND lower(trim(w.name)) = lower(trim(type_names[v_ord]))
    );

    UPDATE workshop_project_types
    SET applies_to = 'production',
        is_active = true,
        order_index = v_ord
    WHERE company_id = v_nextgo
      AND lower(trim(name)) = lower(trim(type_names[v_ord]));
  END LOOP;

  -- ── 2) Helper nội bộ: tạo/ cập nhật 1 bộ mẫu + 7 nhiệm vụ ──
  -- Lặp: NULL (mặc định chung) + từng loại sản phẩm
  FOR v_type IN
    SELECT NULL::uuid AS id, 'Bao bì NextGo — quy trình chuẩn'::text AS tpl_name, 0 AS ord
    UNION ALL
    SELECT w.id, ('Bao bì — ' || w.name), w.order_index
    FROM workshop_project_types w
    WHERE w.company_id = v_nextgo
      AND w.is_active IS DISTINCT FROM false
      AND lower(trim(w.name)) = ANY (SELECT lower(trim(x)) FROM unnest(type_names) AS x)
    ORDER BY 3
  LOOP
    SELECT t.id INTO v_tpl_id
    FROM workshop_task_templates t
    WHERE t.company_id = v_nextgo
      AND t.workshop_area = 'production'
      AND t.production_stage_id IS NULL
      AND (
        (v_type.id IS NULL AND t.workshop_type_id IS NULL)
        OR (v_type.id IS NOT NULL AND t.workshop_type_id = v_type.id)
      )
      AND lower(trim(t.name)) = lower(trim(v_type.tpl_name))
    LIMIT 1;

    IF v_tpl_id IS NULL THEN
      INSERT INTO workshop_task_templates (
        name, description, workshop_area, company_id, workshop_type_id,
        production_stage_id, is_active, is_default, order_index
      ) VALUES (
        v_type.tpl_name,
        'Quy trình sản xuất bao bì giấy/carton NextGo: tiếp nhận → thiết kế → NVL → sản xuất → QC → đóng gói → giao hàng.',
        'production',
        v_nextgo,
        v_type.id,
        NULL,
        true,
        true,
        COALESCE(v_type.ord, 0)
      )
      RETURNING id INTO v_tpl_id;
      n_tpl := n_tpl + 1;
    ELSE
      UPDATE workshop_task_templates
      SET
        description = 'Quy trình sản xuất bao bì giấy/carton NextGo: tiếp nhận → thiết kế → NVL → sản xuất → QC → đóng gói → giao hàng.',
        is_active = true,
        is_default = true,
        order_index = COALESCE(v_type.ord, 0),
        production_stage_id = NULL
      WHERE id = v_tpl_id;
    END IF;

    INSERT INTO workshop_task_template_items (
      template_id, title, description, priority, deadline_days, order_index, checklist, blocks_stage_advance
    )
    SELECT
      v_tpl_id,
      s.title,
      s.description,
      s.priority,
      s.deadline_days,
      s.ord,
      s.checklist::jsonb,
      s.blocks
    FROM (VALUES
      (1, 'Tiếp nhận & kiểm tra hồ sơ đơn hàng',
       'Đối chiếu đơn hàng, quy cách, số lượng, mẫu/in ấn với hợp đồng hoặc báo giá đã chốt.',
       'high', 0, false,
       '[{"text":"Nhận đủ hồ sơ / file thiết kế từ sale"},{"text":"Đối chiếu quy cách sản phẩm với đơn hàng"},{"text":"Xác nhận số lượng, kích thước, chất liệu"},{"text":"Ghi nhận deadline giao hàng"},{"text":"Xác nhận với kỹ thuật / xưởng"}]'),
      (2, 'Thiết kế / chế bản sản xuất',
       'Hoàn thiện file chế bản (die-cut, layout in), duyệt mẫu nếu cần trước khi vào máy.',
       'high', 1, false,
       '[{"text":"Kiểm tra / chỉnh file thiết kế theo quy cách xưởng"},{"text":"Tạo / duyệt bản chế bản (die, layout)"},{"text":"In mẫu / duyệt màu (nếu yêu cầu)"},{"text":"Xác nhận khách hoặc sale (nếu cần)"},{"text":"Chốt file sản xuất cuối"}]'),
      (3, 'Chuẩn bị nguyên vật liệu',
       'Chuẩn bị giấy/carton, mực, keo, phụ liệu; xuất kho hoặc đặt mua bổ sung.',
       'high', 1, false,
       '[{"text":"Kiểm tra tồn giấy / carton / mực / keo"},{"text":"Đặt mua bổ sung nếu thiếu"},{"text":"Xuất phiếu kho NVL"},{"text":"Chuẩn bị khuôn bế / bản in (nếu có)"},{"text":"Sẵn sàng bàn giao cho chuyền sản xuất"}]'),
      (4, 'Sản xuất (in / bế / dán / ghép)',
       'Thực hiện công đoạn sản xuất theo loại bao bì: in, bế, dán, ghép, hoàn thiện.',
       'high', 2, false,
       '[{"text":"Setup máy / chuyền đúng quy cách"},{"text":"Chạy thử & kiểm kích thước / màu"},{"text":"Sản xuất đủ số lượng đơn hàng"},{"text":"Ghi nhận hao hụt / phế phẩm"},{"text":"Chuyển bán thành phẩm sang QC"}]'),
      (5, 'QC nội bộ',
       'Kiểm tra chất lượng thành phẩm trước đóng gói: kích thước, in ấn, kết cấu.',
       'high', 0, false,
       '[{"text":"Kiểm kích thước / quy cách so với hồ sơ"},{"text":"Kiểm chất lượng in / màu / bề mặt"},{"text":"Kiểm kết cấu dán / ghép / độ bền"},{"text":"Chụp ảnh / ghi biên bản QC"},{"text":"Phân loại đạt / cần sửa"}]'),
      (6, 'Đóng gói & xuất kho thành phẩm',
       'Đóng gói đúng quy cách, dán nhãn đơn hàng, nhập kho thành phẩm.',
       'medium', 1, false,
       '[{"text":"Đóng gói theo quy cách vận chuyển"},{"text":"Dán nhãn: mã đơn / khách / số lượng"},{"text":"Đếm kiện / xác nhận đủ số lượng"},{"text":"Chụp ảnh kiện hàng"},{"text":"Cập nhật kho thành phẩm"}]'),
      (7, 'Giao hàng / bàn giao',
       'Sắp xếp giao hàng hoặc bàn giao cho khách / đơn vị vận chuyển.',
       'medium', 1, false,
       '[{"text":"Xác nhận lịch giao với khách / sale"},{"text":"Chuẩn bị chứng từ giao hàng"},{"text":"Bàn giao đủ kiện hàng"},{"text":"Lấy biên bản / chữ ký nhận hàng"},{"text":"Cập nhật trạng thái hoàn thành giao"}]')
    ) AS s(ord, title, description, priority, deadline_days, blocks, checklist)
    WHERE NOT EXISTS (
      SELECT 1 FROM workshop_task_template_items i
      WHERE i.template_id = v_tpl_id
        AND lower(trim(i.title)) = lower(trim(s.title))
    );

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    n_items := n_items + v_rowcount;

    -- Đồng bộ lại mô tả / thứ tự nếu item đã có
    UPDATE workshop_task_template_items i
    SET
      description = s.description,
      priority = s.priority,
      deadline_days = s.deadline_days,
      order_index = s.ord,
      checklist = s.checklist::jsonb,
      blocks_stage_advance = s.blocks
    FROM (VALUES
      (1, 'Tiếp nhận & kiểm tra hồ sơ đơn hàng',
       'Đối chiếu đơn hàng, quy cách, số lượng, mẫu/in ấn với hợp đồng hoặc báo giá đã chốt.',
       'high', 0, false,
       '[{"text":"Nhận đủ hồ sơ / file thiết kế từ sale"},{"text":"Đối chiếu quy cách sản phẩm với đơn hàng"},{"text":"Xác nhận số lượng, kích thước, chất liệu"},{"text":"Ghi nhận deadline giao hàng"},{"text":"Xác nhận với kỹ thuật / xưởng"}]'),
      (2, 'Thiết kế / chế bản sản xuất',
       'Hoàn thiện file chế bản (die-cut, layout in), duyệt mẫu nếu cần trước khi vào máy.',
       'high', 1, false,
       '[{"text":"Kiểm tra / chỉnh file thiết kế theo quy cách xưởng"},{"text":"Tạo / duyệt bản chế bản (die, layout)"},{"text":"In mẫu / duyệt màu (nếu yêu cầu)"},{"text":"Xác nhận khách hoặc sale (nếu cần)"},{"text":"Chốt file sản xuất cuối"}]'),
      (3, 'Chuẩn bị nguyên vật liệu',
       'Chuẩn bị giấy/carton, mực, keo, phụ liệu; xuất kho hoặc đặt mua bổ sung.',
       'high', 1, false,
       '[{"text":"Kiểm tra tồn giấy / carton / mực / keo"},{"text":"Đặt mua bổ sung nếu thiếu"},{"text":"Xuất phiếu kho NVL"},{"text":"Chuẩn bị khuôn bế / bản in (nếu có)"},{"text":"Sẵn sàng bàn giao cho chuyền sản xuất"}]'),
      (4, 'Sản xuất (in / bế / dán / ghép)',
       'Thực hiện công đoạn sản xuất theo loại bao bì: in, bế, dán, ghép, hoàn thiện.',
       'high', 2, false,
       '[{"text":"Setup máy / chuyền đúng quy cách"},{"text":"Chạy thử & kiểm kích thước / màu"},{"text":"Sản xuất đủ số lượng đơn hàng"},{"text":"Ghi nhận hao hụt / phế phẩm"},{"text":"Chuyển bán thành phẩm sang QC"}]'),
      (5, 'QC nội bộ',
       'Kiểm tra chất lượng thành phẩm trước đóng gói: kích thước, in ấn, kết cấu.',
       'high', 0, false,
       '[{"text":"Kiểm kích thước / quy cách so với hồ sơ"},{"text":"Kiểm chất lượng in / màu / bề mặt"},{"text":"Kiểm kết cấu dán / ghép / độ bền"},{"text":"Chụp ảnh / ghi biên bản QC"},{"text":"Phân loại đạt / cần sửa"}]'),
      (6, 'Đóng gói & xuất kho thành phẩm',
       'Đóng gói đúng quy cách, dán nhãn đơn hàng, nhập kho thành phẩm.',
       'medium', 1, false,
       '[{"text":"Đóng gói theo quy cách vận chuyển"},{"text":"Dán nhãn: mã đơn / khách / số lượng"},{"text":"Đếm kiện / xác nhận đủ số lượng"},{"text":"Chụp ảnh kiện hàng"},{"text":"Cập nhật kho thành phẩm"}]'),
      (7, 'Giao hàng / bàn giao',
       'Sắp xếp giao hàng hoặc bàn giao cho khách / đơn vị vận chuyển.',
       'medium', 1, false,
       '[{"text":"Xác nhận lịch giao với khách / sale"},{"text":"Chuẩn bị chứng từ giao hàng"},{"text":"Bàn giao đủ kiện hàng"},{"text":"Lấy biên bản / chữ ký nhận hàng"},{"text":"Cập nhật trạng thái hoàn thành giao"}]')
    ) AS s(ord, title, description, priority, deadline_days, blocks, checklist)
    WHERE i.template_id = v_tpl_id
      AND lower(trim(i.title)) = lower(trim(s.title));
  END LOOP;

  -- ── 3) Bật gen nhiệm vụ SX từ bộ mẫu khi thắng deal (CRM) ──
  UPDATE crm_lead_types
  SET workshop_production_templates = true
  WHERE company_id = v_nextgo
    AND lower(trim(name)) = ANY (SELECT lower(trim(x)) FROM unnest(type_names) AS x);

  RAISE NOTICE '457: NextGo=% | bộ mẫu mới=% | tổng item insert lần này=%',
    v_nextgo, n_tpl, n_items;
END $$;
