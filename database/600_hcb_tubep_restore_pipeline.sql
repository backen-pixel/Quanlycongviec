-- 600: HCB Tủ bếp — khôi phục pipeline 15 cột (kế hoạch 5 cột chưa triển khai).
-- Trả tên cột còn thẻ, dựng cột trống đã merge, kéo công nợ Tủ bếp về board Tủ bếp.
-- Không đụng Cánh kính / Cửa / cột Công nợ của Cánh kính (Đợi thanh toán, Nợ quá hạn, CÔNG NỢ ĐÃ CHỐT…).

CREATE OR REPLACE FUNCTION _hcb_600_ensure_stage(
  p_company UUID,
  p_type UUID,
  p_wf UUID,
  p_name TEXT,
  p_order INT,
  p_color TEXT,
  p_icon TEXT,
  p_handover BOOLEAN
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM production_pipeline_stages
  WHERE company_id = p_company
    AND workshop_type_id = p_type
    AND lower(regexp_replace(trim(name), '[,\\s]+$', '')) = lower(trim(p_name))
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO production_pipeline_stages (
      name, color, icon, order_index, is_active, company_id, workshop_type_id,
      workflow_stage_id, crm_sync_type, is_handover_to_logistics, deadline_group
    ) VALUES (
      p_name, p_color, p_icon, p_order, true, p_company, p_type,
      p_wf, 'production', p_handover, NULL
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE production_pipeline_stages
    SET name = p_name,
        color = p_color,
        icon = p_icon,
        order_index = p_order,
        is_active = true,
        crm_sync_type = 'production',
        is_handover_to_logistics = p_handover,
        deadline_group = NULL,
        workshop_type_id = p_type
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

DO $$
DECLARE
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
  v_tubep UUID;
  v_congno UUID;
  v_wf UUID;
  v_id UUID;
BEGIN
  SELECT id INTO v_tubep FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'tủ bếp' LIMIT 1;
  SELECT id INTO v_congno FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'công nợ' LIMIT 1;
  IF v_tubep IS NULL THEN
    RAISE EXCEPTION '600: không có phân loại Tủ bếp';
  END IF;

  SELECT workflow_stage_id INTO v_wf
  FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
  ORDER BY order_index LIMIT 1;

  -- 1–4 + 8: trả tên trên cột đang dùng (id primary; fallback theo tên 5 cột)
  UPDATE production_pipeline_stages
  SET name = 'Tiếp nhận đơn hàng về SX', color = '#6366F1', icon = '📥',
      order_index = 1, is_active = true, deadline_group = NULL,
      is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND (
      id = 'b5472e51-64e5-4dbe-8a54-5d053c8a7da9'
      OR lower(trim(name)) = 'tiếp nhận'
    );

  UPDATE production_pipeline_stages
  SET name = 'Thiết kế & lập kế hoạch NVL', color = '#8B5CF6', icon = '📐',
      order_index = 2, is_active = true, deadline_group = NULL,
      is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND (
      id = '9234d51a-5f20-425e-9965-d4f5637829f3'
      OR lower(trim(name)) IN ('kế hoạch')
    );

  UPDATE production_pipeline_stages
  SET name = 'Sản xuất kiểm tra chéo đặt kính', color = '#0EA5E9', icon = '🔍',
      order_index = 3, is_active = true, deadline_group = NULL,
      is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND (
      id = '7edeee86-6aae-410c-96b0-f3a2225379ea'
      OR lower(trim(name)) = 'duyệt'
    );

  UPDATE production_pipeline_stages
  SET name = 'Ban thành phẩm', color = '#EA580C', icon = '🏭',
      order_index = 4, is_active = true, deadline_group = NULL,
      is_handover_to_logistics = false, bucket_slug = 'ban_thanh_pham'
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND (
      id = 'f3ec4bf5-2f84-4178-a436-0a78b6f2cc20'
      OR lower(trim(name)) = 'gia công'
    );

  UPDATE production_pipeline_stages
  SET name = 'KT KCS SẢN PHẨM, TÍNH CN', color = '#14B8A6', icon = '✅',
      order_index = 8, is_active = true, deadline_group = NULL,
      is_handover_to_logistics = true
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND (
      id = 'a910bfd3-7cf1-4033-8a67-bc49463b591f'
      OR lower(trim(name)) = 'hoàn thiện'
    );

  -- 5–7, 9–11, 14: dựng lại nếu đã xóa
  PERFORM _hcb_600_ensure_stage(v_hcb, v_tubep, v_wf, 'ĐANG SX THÙNG', 5, '#84CC16', '🏭', false);
  PERFORM _hcb_600_ensure_stage(v_hcb, v_tubep, v_wf, 'HT NHÔM NGUYÊN TẤM', 6, '#22C55E', '🔧', false);
  PERFORM _hcb_600_ensure_stage(v_hcb, v_tubep, v_wf, 'HT NHÔM LÁ GHÉP NHỎ', 7, '#EAB308', '🔧', false);
  PERFORM _hcb_600_ensure_stage(v_hcb, v_tubep, v_wf, 'ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG', 9, '#3B82F6', '📦', false);
  PERFORM _hcb_600_ensure_stage(v_hcb, v_tubep, v_wf, 'ĐƠN HÀNG NGÀY MAI GIAO', 10, '#FB923C', '🚚', false);
  PERFORM _hcb_600_ensure_stage(v_hcb, v_tubep, v_wf, 'ĐƠN HÀNG ĐÃ GIAO', 11, '#10B981', '✔️', false);

  -- 12–15: kéo về Tủ bếp (không đụng Đợi thanh toán / Nợ quá hạn / CÔNG NỢ ĐÃ CHỐT của Cánh kính)
  IF v_congno IS NOT NULL THEN
    UPDATE production_pipeline_stages
    SET workshop_type_id = v_tubep,
        name = 'CHỐT CÔNG NỢ',
        color = '#64748B', icon = '🧾',
        order_index = 12, is_active = true,
        deadline_group = NULL, is_handover_to_logistics = false
    WHERE id = '2178fc97-d611-4375-8318-7ab4322d2de7';

    UPDATE production_pipeline_stages
    SET workshop_type_id = v_tubep,
        name = 'KIỂM TRA CÔNG NỢ',
        color = '#475569', icon = '🔎',
        order_index = 13, is_active = true,
        deadline_group = NULL, is_handover_to_logistics = false
    WHERE id = '332cde3c-dbb4-4231-a8bc-d2d6291b6b3f';

    UPDATE production_pipeline_stages
    SET workshop_type_id = v_tubep,
        name = 'Thu tiền',
        color = '#16A34A', icon = '💰',
        order_index = 14, is_active = true,
        deadline_group = NULL, is_handover_to_logistics = false
    WHERE id = '8b1045fb-81ed-47d2-8c2c-df1b06d895eb';

    UPDATE production_pipeline_stages
    SET workshop_type_id = v_tubep,
        name = 'CHUYỂN TÁC VỤ PHÒNG KẾ TOÁN',
        color = '#1E40AF', icon = '📨',
        order_index = 15, is_active = true,
        deadline_group = NULL, is_handover_to_logistics = false
    WHERE id = '1fc284f4-d68f-4413-9346-efbe9017c65a';

    -- Backup / id lệch: khớp theo tên trên nhánh Công nợ
    UPDATE production_pipeline_stages
    SET workshop_type_id = v_tubep,
        deadline_group = NULL,
        is_handover_to_logistics = false
    WHERE company_id = v_hcb
      AND workshop_type_id = v_congno
      AND (
        name ILIKE 'CHỐT CÔNG NỢ%'
        OR name ILIKE 'KIỂM TRA CÔNG NỢ%'
        OR lower(trim(name)) = 'thu tiền'
        OR name ILIKE '%CHUYỂN TÁC VỤ%'
      );
  END IF;

  PERFORM _hcb_600_ensure_stage(v_hcb, v_tubep, v_wf, 'CHỐT CÔNG NỢ', 12, '#64748B', '🧾', false);
  PERFORM _hcb_600_ensure_stage(v_hcb, v_tubep, v_wf, 'KIỂM TRA CÔNG NỢ', 13, '#475569', '🔎', false);
  PERFORM _hcb_600_ensure_stage(v_hcb, v_tubep, v_wf, 'Thu tiền', 14, '#16A34A', '💰', false);
  PERFORM _hcb_600_ensure_stage(v_hcb, v_tubep, v_wf, 'CHUYỂN TÁC VỤ PHÒNG KẾ TOÁN', 15, '#1E40AF', '📨', false);

  -- Thẻ đang gắn cột công nợ Tủ bếp: trả phân loại dự án
  UPDATE projects p
  SET workshop_type_id = v_tubep, updated_at = NOW()
  WHERE p.company_id = v_hcb
    AND p.sx_kanban_column_id IN (
      SELECT id FROM production_pipeline_stages
      WHERE company_id = v_hcb AND workshop_type_id = v_tubep
        AND (
          name ILIKE 'CHỐT CÔNG NỢ%'
          OR name ILIKE 'KIỂM TRA CÔNG NỢ%'
          OR lower(trim(name)) = 'thu tiền'
          OR name ILIKE '%CHUYỂN TÁC VỤ%'
        )
    );

  -- Bộ mẫu Tủ bếp: trả gói cũ; tắt bộ 5 cột vừa gắn (trừ Ban thành phẩm / Gia công)
  UPDATE workshop_task_templates
  SET is_active = true, is_default = true, production_stage_id = NULL,
      name = CASE
        WHEN lower(trim(name)) = 'tiếp nhận' THEN 'Tiếp nhận và lên kế hoạch'
        ELSE name
      END
  WHERE company_id = v_hcb
    AND workshop_type_id = v_tubep
    AND workshop_area = 'production'
    AND lower(trim(name)) IN (
      'tiếp nhận',
      'tiếp nhận và lên kế hoạch',
      'chuẩn bị sản xuất',
      'chuẩn bị và vận chuyển',
      'công nợ và thu tiền'
    );

  UPDATE workshop_task_templates
  SET is_active = false, is_default = false
  WHERE company_id = v_hcb
    AND workshop_type_id = v_tubep
    AND workshop_area = 'production'
    AND lower(trim(name)) IN ('kế hoạch', 'duyệt', 'hoàn thiện');

  UPDATE workshop_task_templates
  SET name = 'Ban thành phẩm',
      description = 'Nhiệm vụ cột Ban thành phẩm HCB (Tủ bếp): Thùng, Kính, Sơn, Cánh, Đặt vật tư.',
      is_active = true, is_default = false
  WHERE company_id = v_hcb
    AND workshop_type_id = v_tubep
    AND workshop_area = 'production'
    AND (
      production_stage_id = 'f3ec4bf5-2f84-4178-a436-0a78b6f2cc20'
      OR (lower(trim(name)) IN ('gia công', 'ban thành phẩm') AND production_stage_id IS NOT NULL)
    );
END $$;

DROP FUNCTION IF EXISTS _hcb_600_ensure_stage(UUID, UUID, UUID, TEXT, INT, TEXT, TEXT, BOOLEAN);
