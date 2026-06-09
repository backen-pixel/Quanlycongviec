-- 298: Metala — bộ pipeline SX phân loại «Data đầu vào» (B2B) + loại Deal CRM «B2B»

--

-- Idempotent: bỏ qua cột / loại đã tồn tại (theo company + workshop_type + tên cột).

-- Chạy trên Supabase project chính (đã có companies, workshop_project_types, production_pipeline_stages).



BEGIN;



DO $$

DECLARE

  v_metala_id UUID;

  v_type_id   UUID;

  v_prod_ws   UUID;

  v_lead_type UUID;

  n_stages    INT := 0;

BEGIN

  SELECT id INTO v_metala_id FROM companies

  WHERE name ILIKE '%Metall%' OR short_name ILIKE '%Metall%'

  ORDER BY name LIMIT 1;



  IF v_metala_id IS NULL THEN

    RAISE EXCEPTION '298: Không tìm thấy công ty Metala.';

  END IF;



  SELECT id INTO v_prod_ws FROM workflow_stages WHERE slug = 'production' LIMIT 1;



  -- Phân loại xưởng (nếu chưa có)

  SELECT id INTO v_type_id FROM workshop_project_types

  WHERE company_id = v_metala_id AND lower(name) = lower('Data đầu vào')

  LIMIT 1;



  IF v_type_id IS NULL THEN

    INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active)

    VALUES (v_metala_id, 'Data đầu vào', 'production', 103, true)

    RETURNING id INTO v_type_id;

  END IF;



  -- Vô hiệu hóa cột cũ không còn dùng

  UPDATE production_pipeline_stages

  SET is_active = false

  WHERE company_id = v_metala_id

    AND workshop_type_id = v_type_id

    AND lower(trim(name)) NOT IN (

      lower('Tiếp nhận'),

      lower('Xác minh B2B'),

      lower('Báo giá và tư vấn dịch vụ'),

      lower('Chốt')

    );



  -- 4 cột pipeline Data đầu vào (dải order 1301–1304)

  INSERT INTO production_pipeline_stages (

    company_id, workshop_type_id, name, color, icon, order_index,

    is_active, workflow_stage_id, bucket_slug, crm_sync_type, is_handover_to_logistics

  )

  SELECT v_metala_id, v_type_id, s.name, s.color, s.icon,

         1300 + s.idx, true, v_prod_ws, NULL, NULL, false

  FROM (VALUES

    (1, 'Tiếp nhận',                  '#6366F1', '📥'),

    (2, 'Xác minh B2B',               '#0EA5E9', '🔍'),

    (3, 'Báo giá và tư vấn dịch vụ', '#8B5CF6', '💬'),

    (4, 'Chốt',                       '#16A34A', '✅')

  ) AS s(idx, name, color, icon)

  WHERE NOT EXISTS (

    SELECT 1 FROM production_pipeline_stages p

    WHERE p.company_id = v_metala_id

      AND p.workshop_type_id = v_type_id

      AND lower(trim(p.name)) = lower(trim(s.name))

  );



  GET DIAGNOSTICS n_stages = ROW_COUNT;



  -- Đồng bộ thuộc tính cột hiện có

  UPDATE production_pipeline_stages p

  SET

    color = s.color,

    icon = s.icon,

    order_index = 1300 + s.idx,

    workflow_stage_id = COALESCE(p.workflow_stage_id, v_prod_ws),

    crm_sync_type = NULL,

    is_active = true

  FROM (VALUES

    (1, 'Tiếp nhận',                  '#6366F1', '📥'),

    (2, 'Xác minh B2B',               '#0EA5E9', '🔍'),

    (3, 'Báo giá và tư vấn dịch vụ', '#8B5CF6', '💬'),

    (4, 'Chốt',                       '#16A34A', '✅')

  ) AS s(idx, name, color, icon)

  WHERE p.company_id = v_metala_id

    AND p.workshop_type_id = v_type_id

    AND lower(trim(p.name)) = lower(trim(s.name));



  -- Loại Deal CRM «B2B» — bật SX mẫu, công ty SX mặc định = Metala

  SELECT id INTO v_lead_type FROM crm_lead_types

  WHERE company_id = v_metala_id AND lower(name) = lower('B2B')

  LIMIT 1;



  IF v_lead_type IS NULL THEN

    INSERT INTO crm_lead_types (

      company_id, name, applies_to, order_index, is_active,

      workshop_production_templates, default_production_company_id

    )

    VALUES (

      v_metala_id, 'B2B', 'both', 10, true, true, v_metala_id

    )

    RETURNING id INTO v_lead_type;

  ELSE

    UPDATE crm_lead_types

    SET

      applies_to = 'both',

      is_active = true,

      workshop_production_templates = true,

      default_production_company_id = v_metala_id,

      updated_at = now()

    WHERE id = v_lead_type;

  END IF;



  RAISE NOTICE '298: Metala=% | type Data đầu vào=% | cột mới=% | lead_type B2B=%',

    v_metala_id, v_type_id, n_stages, v_lead_type;

END $$;



COMMIT;

