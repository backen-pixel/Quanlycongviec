-- 607: HCB · Tủ bếp — mở cột «Ban thành phẩm» thành 3 cột:
--   Chuẩn bị vật tư → Đặt kính → Sơn
-- (các cột sau giữ nguyên: ĐANG SX THÙNG, HT NHÔM…). Idempotent.
--
-- 3 dự án đang đứng ở Ban thành phẩm ở lại cột Chuẩn bị vật tư (cùng id).
-- group_key = gia_cong để chế độ Gộp cột vẫn gom trong khối Gia công.

CREATE OR REPLACE FUNCTION _hcb_607_ensure_stage(
  p_company UUID,
  p_type UUID,
  p_wf UUID,
  p_name TEXT,
  p_order INT,
  p_color TEXT,
  p_icon TEXT
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM production_pipeline_stages
  WHERE company_id = p_company
    AND workshop_type_id = p_type
    AND lower(trim(name)) = lower(trim(p_name))
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO production_pipeline_stages (
      name, color, icon, order_index, is_active, company_id, workshop_type_id,
      workflow_stage_id, crm_sync_type, is_handover_to_logistics,
      deadline_group, group_key, bucket_slug
    ) VALUES (
      p_name, p_color, p_icon, p_order, true, p_company, p_type,
      p_wf, 'production', false,
      'cabinet', 'gia_cong', NULL
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
        is_handover_to_logistics = false,
        deadline_group = COALESCE(deadline_group, 'cabinet'),
        group_key = COALESCE(NULLIF(trim(group_key), ''), 'gia_cong')
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION _hcb_607_ensure_stage_tpl(
  p_hcb UUID,
  p_type UUID,
  p_stage UUID,
  p_name TEXT,
  p_desc TEXT,
  p_item TEXT,
  p_item_desc TEXT
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_tpl UUID;
BEGIN
  SELECT id INTO v_tpl
  FROM workshop_task_templates
  WHERE company_id = p_hcb
    AND workshop_area = 'production'
    AND production_stage_id = p_stage
  ORDER BY created_at
  LIMIT 1;

  IF v_tpl IS NULL THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id, workshop_type_id,
      production_stage_id, is_active, is_default, order_index
    ) VALUES (
      p_name, 'production', p_desc, p_hcb, p_type, p_stage, true, false, 4
    )
    RETURNING id INTO v_tpl;
  ELSE
    UPDATE workshop_task_templates
    SET name = p_name,
        description = p_desc,
        workshop_type_id = p_type,
        is_active = true
    WHERE id = v_tpl;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = v_tpl AND lower(trim(i.title)) = lower(trim(p_item))
  ) THEN
    INSERT INTO workshop_task_template_items (
      template_id, title, description, priority, deadline_days,
      order_index, checklist, blocks_stage_advance
    ) VALUES (
      v_tpl, p_item, p_item_desc, 'medium', 0, 1, '[]'::jsonb, true
    );
  END IF;
END;
$$;

DO $$
DECLARE
  v_hcb UUID;
  v_tubep UUID;
  v_btp UUID;
  v_vat_tu UUID;
  v_kinh UUID;
  v_son UUID;
  v_wf UUID;
  v_staff_src UUID;
BEGIN
  SELECT id INTO v_hcb
  FROM companies
  WHERE short_name ILIKE 'HCB' OR name ILIKE '%Hucabi%'
  ORDER BY CASE WHEN short_name ILIKE 'HCB' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_hcb IS NULL THEN
    RAISE NOTICE '607: không có HCB — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_tubep
  FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'tủ bếp'
  LIMIT 1;

  IF v_tubep IS NULL THEN
    RAISE NOTICE '607: không có board Tủ bếp — bỏ qua.';
    RETURN;
  END IF;

  SELECT id, workflow_stage_id INTO v_btp, v_wf
  FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND lower(trim(name)) = 'ban thành phẩm'
  ORDER BY order_index
  LIMIT 1;

  -- Đã tách rồi (không còn Ban thành phẩm, đã có 3 cột)
  IF v_btp IS NULL THEN
    SELECT id INTO v_vat_tu
    FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_tubep
      AND lower(trim(name)) = 'chuẩn bị vật tư'
    LIMIT 1;
    IF v_vat_tu IS NOT NULL THEN
      RAISE NOTICE '607: đã có cột Chuẩn bị vật tư — không đổi.';
      RETURN;
    END IF;
    RAISE NOTICE '607: không thấy Ban thành phẩm — bỏ qua.';
    RETURN;
  END IF;

  -- Dời cột sau Ban thành phẩm (+2) để chèn Đặt kính / Sơn
  UPDATE production_pipeline_stages
  SET order_index = order_index + 2
  WHERE company_id = v_hcb
    AND workshop_type_id = v_tubep
    AND order_index >= 5;

  UPDATE production_pipeline_stages
  SET name = 'Chuẩn bị vật tư',
      color = '#06B6D4',
      icon = '📦',
      order_index = 4,
      is_active = true,
      crm_sync_type = 'production',
      deadline_group = COALESCE(deadline_group, 'cabinet'),
      group_key = COALESCE(NULLIF(trim(group_key), ''), 'gia_cong'),
      bucket_slug = COALESCE(NULLIF(trim(bucket_slug), ''), 'ban_thanh_pham')
  WHERE id = v_btp;

  v_vat_tu := v_btp;
  v_staff_src := v_btp;

  v_kinh := _hcb_607_ensure_stage(v_hcb, v_tubep, v_wf, 'Đặt kính', 5, '#0EA5E9', '🔍');
  v_son := _hcb_607_ensure_stage(v_hcb, v_tubep, v_wf, 'Sơn', 6, '#F59E0B', '🎨');

  INSERT INTO production_pipeline_stage_default_staff (
    production_pipeline_stage_id, user_id, order_index, is_primary
  )
  SELECT v_kinh, s.user_id, s.order_index, s.is_primary
  FROM production_pipeline_stage_default_staff s
  WHERE s.production_pipeline_stage_id = v_staff_src
    AND NOT EXISTS (
      SELECT 1 FROM production_pipeline_stage_default_staff s2
      WHERE s2.production_pipeline_stage_id = v_kinh AND s2.user_id = s.user_id
    );

  INSERT INTO production_pipeline_stage_default_staff (
    production_pipeline_stage_id, user_id, order_index, is_primary
  )
  SELECT v_son, s.user_id, s.order_index, s.is_primary
  FROM production_pipeline_stage_default_staff s
  WHERE s.production_pipeline_stage_id = v_staff_src
    AND NOT EXISTS (
      SELECT 1 FROM production_pipeline_stage_default_staff s2
      WHERE s2.production_pipeline_stage_id = v_son AND s2.user_id = s.user_id
    );

  -- Việc Đặt kính / Sơn trên thẻ đang gắn cột cũ → cột mới
  UPDATE crm_tasks
  SET production_pipeline_stage_id = v_kinh, updated_at = NOW()
  WHERE production_pipeline_stage_id = v_vat_tu
    AND lower(trim(title)) IN ('đặt kính', 'kính');

  UPDATE crm_tasks
  SET production_pipeline_stage_id = v_son, updated_at = NOW()
  WHERE production_pipeline_stage_id = v_vat_tu
    AND lower(trim(title)) IN ('sơn', 'đội sơn');

  UPDATE tasks
  SET production_stage_id = v_kinh
  WHERE production_stage_id = v_vat_tu
    AND lower(trim(title)) IN ('đặt kính', 'kính');

  UPDATE tasks
  SET production_stage_id = v_son
  WHERE production_stage_id = v_vat_tu
    AND lower(trim(title)) IN ('sơn', 'đội sơn');

  PERFORM _hcb_607_ensure_stage_tpl(
    v_hcb, v_tubep, v_vat_tu,
    'Chuẩn bị vật tư',
    'HCB Tủ bếp — cột Chuẩn bị vật tư (tách từ Ban thành phẩm).',
    'Chuẩn bị vật tư', 'Chuẩn bị / đặt vật tư'
  );
  PERFORM _hcb_607_ensure_stage_tpl(
    v_hcb, v_tubep, v_kinh,
    'Đặt kính',
    'HCB Tủ bếp — cột Đặt kính (tách từ Ban thành phẩm).',
    'Đặt kính', 'Đặt / gia công kính'
  );
  PERFORM _hcb_607_ensure_stage_tpl(
    v_hcb, v_tubep, v_son,
    'Sơn',
    'HCB Tủ bếp — cột Sơn (tách từ Ban thành phẩm).',
    'Sơn', 'Sơn'
  );

  -- Template cũ 6 việc: gỡ Thùng / Alu / Cánh / Đặt kính / Sơn khỏi cột vật tư
  DELETE FROM workshop_task_template_items i
  USING workshop_task_templates t
  WHERE i.template_id = t.id
    AND t.production_stage_id = v_vat_tu
    AND t.company_id = v_hcb
    AND lower(trim(i.title)) IN ('đặt kính', 'kính', 'sơn', 'đội sơn', 'thùng', 'alu', 'cánh');

  RAISE NOTICE '607: tách Ban thành phẩm → Chuẩn bị vật tư (%), Đặt kính (%), Sơn (%).',
    v_vat_tu, v_kinh, v_son;
END $$;

DROP FUNCTION IF EXISTS _hcb_607_ensure_stage(UUID, UUID, UUID, TEXT, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS _hcb_607_ensure_stage_tpl(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT);
