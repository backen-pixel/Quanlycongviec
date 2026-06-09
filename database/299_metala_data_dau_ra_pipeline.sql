-- 299: Metala — bộ pipeline SX phân loại «Data đầu ra»

--

-- Idempotent: bỏ qua cột / loại đã tồn tại (theo company + workshop_type + tên cột).



BEGIN;



DO $$

DECLARE

  v_metala_id UUID;

  v_type_id   UUID;

  v_prod_ws   UUID;

  n_stages    INT := 0;

BEGIN

  SELECT id INTO v_metala_id FROM companies

  WHERE name ILIKE '%Metall%' OR short_name ILIKE '%Metall%'

  ORDER BY name LIMIT 1;



  IF v_metala_id IS NULL THEN

    RAISE EXCEPTION '299: Không tìm thấy công ty Metala.';

  END IF;



  SELECT id INTO v_prod_ws FROM workflow_stages WHERE slug = 'production' LIMIT 1;



  SELECT id INTO v_type_id FROM workshop_project_types

  WHERE company_id = v_metala_id AND lower(name) = lower('Data đầu ra')

  LIMIT 1;



  IF v_type_id IS NULL THEN

    INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active)

    VALUES (v_metala_id, 'Data đầu ra', 'production', 104, true)

    RETURNING id INTO v_type_id;

  END IF;



  -- Vô hiệu hóa cột cũ không còn dùng

  UPDATE production_pipeline_stages

  SET is_active = false

  WHERE company_id = v_metala_id

    AND workshop_type_id = v_type_id

    AND lower(trim(name)) NOT IN (

      lower('Tiếp nhận'),

      lower('Tư vấn thiết kế sản xuất'),

      lower('Sản xuất'),

      lower('Hoàn thiện đóng gói'),

      lower('Giao hàng')

    );



  -- 5 cột pipeline Data đầu ra (dải order 1401–1405)

  INSERT INTO production_pipeline_stages (

    company_id, workshop_type_id, name, color, icon, order_index,

    is_active, workflow_stage_id, bucket_slug, crm_sync_type, is_handover_to_logistics

  )

  SELECT v_metala_id, v_type_id, s.name, s.color, s.icon,

         1400 + s.idx, true, v_prod_ws, NULL, s.crm_sync, s.handover

  FROM (VALUES

    (1, 'Tiếp nhận',                  '#6366F1', '📥', NULL::text, false),

    (2, 'Tư vấn thiết kế sản xuất',  '#8B5CF6', '📐', NULL::text, false),

    (3, 'Sản xuất',                  '#F59E0B', '🏭', 'production', false),

    (4, 'Hoàn thiện đóng gói',        '#FB923C', '📦', NULL::text, false),

    (5, 'Giao hàng',                  '#10B981', '🚚', NULL::text, true)

  ) AS s(idx, name, color, icon, crm_sync, handover)

  WHERE NOT EXISTS (

    SELECT 1 FROM production_pipeline_stages p

    WHERE p.company_id = v_metala_id

      AND p.workshop_type_id = v_type_id

      AND lower(trim(p.name)) = lower(trim(s.name))

  );



  GET DIAGNOSTICS n_stages = ROW_COUNT;



  UPDATE production_pipeline_stages p

  SET

    color = s.color,

    icon = s.icon,

    order_index = 1400 + s.idx,

    workflow_stage_id = COALESCE(p.workflow_stage_id, v_prod_ws),

    crm_sync_type = s.crm_sync,

    is_handover_to_logistics = s.handover,

    is_active = true

  FROM (VALUES

    (1, 'Tiếp nhận',                  '#6366F1', '📥', NULL::text, false),

    (2, 'Tư vấn thiết kế sản xuất',  '#8B5CF6', '📐', NULL::text, false),

    (3, 'Sản xuất',                  '#F59E0B', '🏭', 'production', false),

    (4, 'Hoàn thiện đóng gói',        '#FB923C', '📦', NULL::text, false),

    (5, 'Giao hàng',                  '#10B981', '🚚', NULL::text, true)

  ) AS s(idx, name, color, icon, crm_sync, handover)

  WHERE p.company_id = v_metala_id

    AND p.workshop_type_id = v_type_id

    AND lower(trim(p.name)) = lower(trim(s.name));



  RAISE NOTICE '299: Metala=% | type Data đầu ra=% | cột mới=%',

    v_metala_id, v_type_id, n_stages;

END $$;



COMMIT;

