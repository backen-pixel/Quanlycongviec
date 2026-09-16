-- 616: HCB — thêm cột pipeline «Đóng gói» cho mọi loại đang dùng
-- (Tủ bếp / Cửa / Cánh kính). Idempotent. Không đụng loại Công nợ.
--
-- Cửa + Cánh kính đã có «Vệ sinh đóng gói»: giữ cột đó, gán group_key dong_goi.
-- Tủ bếp chưa có cột đóng gói: chèn «Đóng gói» trước KCS; trả
-- «ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG» về Hoàn thiện (không còn đóng vai đóng gói).

CREATE OR REPLACE FUNCTION _hcb_616_has_packing_name(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(trim(p_name)) IN ('đóng gói', 'vệ sinh đóng gói');
$$;

CREATE OR REPLACE FUNCTION _hcb_616_ensure_dong_goi(
  p_company UUID,
  p_type UUID
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
  v_wf UUID;
  v_at INT;
  v_exist_pack UUID;
BEGIN
  SELECT id INTO v_id
  FROM production_pipeline_stages
  WHERE company_id = p_company
    AND workshop_type_id = p_type
    AND lower(trim(name)) = 'đóng gói'
  ORDER BY order_index
  LIMIT 1;

  IF v_id IS NULL THEN
    SELECT id INTO v_exist_pack
    FROM production_pipeline_stages
    WHERE company_id = p_company
      AND workshop_type_id = p_type
      AND lower(trim(name)) = 'vệ sinh đóng gói'
    ORDER BY order_index
    LIMIT 1;
  END IF;

  -- Đã có «Vệ sinh đóng gói» và chưa có «Đóng gói»: không chèn thêm cột trùng.
  IF v_id IS NULL AND v_exist_pack IS NOT NULL THEN
    UPDATE production_pipeline_stages
    SET group_key = 'dong_goi',
        is_packaging_done = true,
        is_active = true
    WHERE id = v_exist_pack
       OR (
         company_id = p_company
         AND workshop_type_id = p_type
         AND lower(trim(name)) = 'vệ sinh đóng gói'
       );
    RETURN v_exist_pack;
  END IF;

  SELECT workflow_stage_id INTO v_wf
  FROM production_pipeline_stages
  WHERE company_id = p_company AND workshop_type_id = p_type
    AND workflow_stage_id IS NOT NULL
  ORDER BY order_index
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE production_pipeline_stages
    SET group_key = 'dong_goi',
        is_packaging_done = true,
        is_active = true,
        color = COALESCE(NULLIF(trim(color), ''), '#FB923C'),
        icon = COALESCE(NULLIF(trim(icon), ''), '📦')
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  SELECT order_index INTO v_at
  FROM production_pipeline_stages
  WHERE company_id = p_company AND workshop_type_id = p_type
    AND lower(trim(name)) = 'kt kcs sản phẩm, tính cn'
  LIMIT 1;

  IF v_at IS NULL THEN
    SELECT order_index INTO v_at
    FROM production_pipeline_stages
    WHERE company_id = p_company AND workshop_type_id = p_type
      AND lower(trim(name)) = 'đơn hàng đã chuẩn bị xong'
    LIMIT 1;
  END IF;

  IF v_at IS NULL THEN
    SELECT MAX(order_index) + 1 INTO v_at
    FROM production_pipeline_stages
    WHERE company_id = p_company AND workshop_type_id = p_type
      AND coalesce(group_key, '') = 'gia_cong';
  END IF;

  IF v_at IS NULL THEN
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_at
    FROM production_pipeline_stages
    WHERE company_id = p_company AND workshop_type_id = p_type
      AND coalesce(group_key, '') IS DISTINCT FROM 'cong_no'
      AND coalesce(board_tab, '') IS DISTINCT FROM 'cong_no';
  END IF;

  UPDATE production_pipeline_stages
  SET order_index = order_index + 1000
  WHERE company_id = p_company
    AND workshop_type_id = p_type
    AND order_index >= v_at;

  INSERT INTO production_pipeline_stages (
    name, color, icon, order_index, is_active,
    company_id, workshop_type_id, workflow_stage_id,
    crm_sync_type, is_handover_to_logistics, is_packaging_done,
    group_key, board_tab, deadline_group, bucket_slug
  ) VALUES (
    'Đóng gói', '#FB923C', '📦', v_at, true,
    p_company, p_type, v_wf,
    'production', false, true,
    'dong_goi', NULL, NULL, NULL
  )
  RETURNING id INTO v_id;

  UPDATE production_pipeline_stages
  SET order_index = order_index - 999
  WHERE company_id = p_company
    AND workshop_type_id = p_type
    AND order_index >= 1000 + v_at;

  RETURN v_id;
END;
$$;

DO $$
DECLARE
  v_hcb UUID;
  v_type UUID;
  v_stage UUID;
  r RECORD;
BEGIN
  SELECT id INTO v_hcb
  FROM companies
  WHERE short_name = 'HCB' OR name ILIKE '%Hucabi%'
  ORDER BY CASE WHEN short_name = 'HCB' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_hcb IS NULL THEN
    RAISE EXCEPTION '616: không tìm thấy công ty HCB';
  END IF;

  FOR r IN
    SELECT id, name
    FROM workshop_project_types
    WHERE company_id = v_hcb
      AND lower(trim(name)) IN ('tủ bếp', 'cửa', 'cánh kính')
  LOOP
    v_type := r.id;
    v_stage := _hcb_616_ensure_dong_goi(v_hcb, v_type);
    RAISE NOTICE '616: % → cột đóng gói %', r.name, v_stage;
  END LOOP;

  -- Tủ bếp: «chuẩn bị xong» không còn đóng vai cột Đóng gói
  UPDATE production_pipeline_stages pps
  SET group_key = 'hoan_thien'
  WHERE pps.company_id = v_hcb
    AND pps.workshop_type_id IN (
      SELECT id FROM workshop_project_types
      WHERE company_id = v_hcb AND lower(trim(name)) = 'tủ bếp'
    )
    AND lower(trim(pps.name)) = 'đơn hàng đã chuẩn bị xong'
    AND coalesce(pps.group_key, '') = 'dong_goi'
    AND EXISTS (
      SELECT 1 FROM production_pipeline_stages x
      WHERE x.company_id = pps.company_id
        AND x.workshop_type_id = pps.workshop_type_id
        AND _hcb_616_has_packing_name(x.name)
    );
END $$;

DROP FUNCTION IF EXISTS _hcb_616_ensure_dong_goi(UUID, UUID);
DROP FUNCTION IF EXISTS _hcb_616_has_packing_name(TEXT);

-- HOÀN TÁC:
-- DELETE FROM production_pipeline_stages pps
-- USING companies c, workshop_project_types wt
-- WHERE pps.company_id = c.id AND pps.workshop_type_id = wt.id
--   AND (c.short_name = 'HCB' OR c.name ILIKE '%Hucabi%')
--   AND wt.name = 'Tủ bếp'
--   AND lower(trim(pps.name)) = 'đóng gói';
-- UPDATE production_pipeline_stages pps
-- SET group_key = 'dong_goi'
-- FROM companies c, workshop_project_types wt
-- WHERE pps.company_id = c.id AND pps.workshop_type_id = wt.id
--   AND (c.short_name = 'HCB' OR c.name ILIKE '%Hucabi%')
--   AND wt.name = 'Tủ bếp'
--   AND lower(trim(pps.name)) = 'đơn hàng đã chuẩn bị xong';
