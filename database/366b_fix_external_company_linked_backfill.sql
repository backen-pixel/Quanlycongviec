-- 366b: Sửa backfill linked_company_id khi đã có nhiều dòng tên VPT trên cùng xưởng.
-- Chạy nếu 366 lỗi 23505 production_ext_co_linked_uq (phần schema 366 đã apply thì chỉ cần block này).

DO $$
DECLARE
  v_vpt_id UUID;
  v_hcb_id UUID;
  v_metalla_id UUID;
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

  IF v_vpt_id IS NOT NULL AND v_hcb_id IS NOT NULL THEN
    INSERT INTO production_workshop_client_companies (production_company_id, client_company_id)
    VALUES (v_hcb_id, v_vpt_id)
    ON CONFLICT (production_company_id, client_company_id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM production_external_companies
      WHERE production_company_id = v_hcb_id AND linked_company_id = v_vpt_id
    ) THEN
      UPDATE production_external_companies pec
      SET linked_company_id = v_vpt_id
      WHERE pec.id = (
        SELECT id FROM production_external_companies
        WHERE production_company_id = v_hcb_id
          AND linked_company_id IS NULL
          AND (
            name ILIKE '%vạn phú%' OR name ILIKE '%van phu%' OR name ILIKE '%vpt%'
          )
        ORDER BY created_at NULLS LAST, id
        LIMIT 1
      );
    END IF;
  END IF;

  IF v_vpt_id IS NOT NULL AND v_metalla_id IS NOT NULL THEN
    INSERT INTO production_workshop_client_companies (production_company_id, client_company_id)
    VALUES (v_metalla_id, v_vpt_id)
    ON CONFLICT (production_company_id, client_company_id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM production_external_companies
      WHERE production_company_id = v_metalla_id AND linked_company_id = v_vpt_id
    ) THEN
      UPDATE production_external_companies pec
      SET linked_company_id = v_vpt_id
      WHERE pec.id = (
        SELECT id FROM production_external_companies
        WHERE production_company_id = v_metalla_id
          AND linked_company_id IS NULL
          AND (
            name ILIKE '%vạn phú%' OR name ILIKE '%van phu%' OR name ILIKE '%vpt%'
          )
        ORDER BY created_at NULLS LAST, id
        LIMIT 1
      );
    END IF;
  END IF;

  IF v_vpt_id IS NOT NULL THEN
    UPDATE crm_leads
    SET external_company_id = v_vpt_id
    WHERE external_company_id IS NULL
      AND external_company_name IS NOT NULL
      AND (
        external_company_name ILIKE '%vạn phú%'
        OR external_company_name ILIKE '%van phu%'
        OR external_company_name ILIKE '%vpt%'
      );

    UPDATE crm_leads cl
    SET external_company_name = COALESCE(c.short_name, c.name)
    FROM companies c
    WHERE cl.external_company_id = c.id
      AND cl.external_company_id IS NOT NULL
      AND (cl.external_company_name IS NULL OR cl.external_company_name = '');
  END IF;

  RAISE NOTICE '366b: backfill OK — VPT=%, HCB=%, Metalla=%', v_vpt_id, v_hcb_id, v_metalla_id;
END $$;
