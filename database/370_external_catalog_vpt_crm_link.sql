-- 370: Liên kết danh mục công ty ngoài (production_external_companies) → CRM VPT
-- và backfill crm_leads.external_company_id / tên chuẩn CRM

DO $$
DECLARE
  v_vpt_id UUID;
  v_hcb_id UUID;
  v_metalla_id UUID;
  v_row RECORD;
BEGIN
  SELECT id INTO v_vpt_id FROM companies
  WHERE name ILIKE '%Bếp Vạn Phú%'
     OR name ILIKE '%Vạn Phú%Thành%'
     OR short_name ILIKE '%VPT%'
  ORDER BY name LIMIT 1;

  SELECT id INTO v_hcb_id FROM companies
  WHERE short_name ILIKE 'HCB' OR name ILIKE '%hucabi%' LIMIT 1;

  SELECT id INTO v_metalla_id FROM companies
  WHERE name ILIKE '%metalla%' LIMIT 1;

  IF v_vpt_id IS NULL THEN
    RAISE NOTICE '370: Không tìm thấy VPT — bỏ qua';
    RETURN;
  END IF;

  -- Mỗi xưởng chỉ 1 dòng linked VPT (unique index) — ưu tiên dòng tên ngắn «VPT»
  FOR v_row IN
    SELECT DISTINCT production_company_id AS wid
    FROM production_external_companies
    WHERE is_active = true
      AND production_company_id IN (v_hcb_id, v_metalla_id)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM production_external_companies
      WHERE production_company_id = v_row.wid AND linked_company_id = v_vpt_id
    ) THEN
      UPDATE production_external_companies pec
      SET linked_company_id = v_vpt_id
      WHERE pec.id = (
        SELECT id FROM production_external_companies
        WHERE production_company_id = v_row.wid
          AND linked_company_id IS NULL
          AND (
            name ILIKE '%vạn phú%'
            OR name ILIKE '%van phu%'
            OR name ILIKE '%vpt%'
            OR name ILIKE '%bếp vạn phú%'
          )
        ORDER BY
          CASE WHEN name ILIKE 'vpt' THEN 0 WHEN length(name) < 20 THEN 1 ELSE 2 END,
          created_at NULLS LAST,
          id
        LIMIT 1
      );
    END IF;

    INSERT INTO production_workshop_client_companies (production_company_id, client_company_id)
    VALUES (v_row.wid, v_vpt_id)
    ON CONFLICT (production_company_id, client_company_id) DO NOTHING;
  END LOOP;

  -- Deal CRM: gán external_company_id cho mọi tên VPT / danh mục ngoài trùng VPT
  UPDATE crm_leads cl
  SET external_company_id = v_vpt_id
  WHERE cl.external_company_id IS NULL
    AND cl.external_company_name IS NOT NULL
    AND (
      cl.external_company_name ILIKE '%vạn phú%'
      OR cl.external_company_name ILIKE '%van phu%'
      OR cl.external_company_name ILIKE '%vpt%'
      OR cl.external_company_name ILIKE '%bếp vạn phú%'
    );

  UPDATE crm_leads cl
  SET external_company_id = v_vpt_id
  FROM production_external_companies pec
  WHERE cl.external_company_id IS NULL
    AND cl.external_company_name IS NOT NULL
    AND pec.is_active = true
    AND pec.linked_company_id = v_vpt_id
    AND lower(trim(cl.external_company_name)) = lower(trim(pec.name));

  UPDATE crm_leads cl
  SET external_company_name = COALESCE(c.short_name, c.name)
  FROM companies c
  WHERE cl.external_company_id = c.id
    AND cl.external_company_id IS NOT NULL
    AND (
      cl.external_company_name IS NULL
      OR cl.external_company_name = ''
      OR cl.external_company_name ILIKE '%vpt%'
      OR cl.external_company_name ILIKE '%vạn phú%'
    );

  RAISE NOTICE '370: VPT=%, linked workshops HCB=% Metalla=%', v_vpt_id, v_hcb_id, v_metalla_id;
END $$;
