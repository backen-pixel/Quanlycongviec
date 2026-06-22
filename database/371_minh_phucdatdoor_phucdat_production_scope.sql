-- 371: minh.phucdatdoor@gmail.com — xem deal SX thuộc công ty CRM Vạn Phú Thành (kể cả xưởng HCB/Metalla)
-- Backend: CLIENT_COMPANY_PRODUCTION_VIEWER_EMAILS trong dealParticipantProduction.js
-- Idempotent.

DO $$
DECLARE
  v_company_id UUID;
  v_dept_id UUID;
  v_user_id UUID;
  v_pd_id UUID;
  v_hcb_id UUID;
  v_metalla_id UUID;
  v_email TEXT := 'minh.phucdatdoor@gmail.com';
BEGIN
  SELECT id INTO v_company_id FROM companies c
  WHERE c.name ILIKE '%Bếp Vạn Phú%'
     OR c.name ILIKE '%Vạn Phú%Thành%'
     OR c.name ILIKE '%Van Phu%Thanh%'
     OR (c.name ILIKE '%Vạn Phú%' AND c.name ILIKE '%Thành%')
     OR c.short_name ILIKE '%VPT%'
  ORDER BY c.name
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '371: Không tìm thấy công ty Vạn Phú Thành trong `companies`.';
  END IF;

  SELECT id INTO v_dept_id FROM departments
  WHERE company_id = v_company_id AND name ILIKE '%kinh doanh%'
  ORDER BY name LIMIT 1;

  UPDATE users
  SET
    company_id = v_company_id,
    department_id = COALESCE(v_dept_id, department_id),
    is_active = true,
    updated_at = now()
  WHERE email ILIKE v_email
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '371: Không tìm thấy user %.', v_email;
  END IF;

  DELETE FROM user_company_regions WHERE user_id = v_user_id;

  DELETE FROM user_companies
  WHERE user_id = v_user_id AND company_id <> v_company_id;

  INSERT INTO user_companies (user_id, company_id, is_primary)
  VALUES (v_user_id, v_company_id, true)
  ON CONFLICT (user_id, company_id) DO UPDATE SET is_primary = true;

  -- Gỡ thành viên deal Phúc Đạt (nếu gán nhầm)
  SELECT id INTO v_pd_id FROM companies
  WHERE name ILIKE '%Phúc Đạt%' OR name ILIKE '%Phuc Dat%'
  ORDER BY name LIMIT 1;

  IF v_pd_id IS NOT NULL THEN
    DELETE FROM lead_members lm
    USING crm_leads cl
    WHERE lm.user_id = v_user_id
      AND lm.lead_id = cl.id
      AND cl.type = 'deal'
      AND (cl.company_id = v_pd_id OR cl.external_company_id = v_pd_id);
  END IF;

  -- Backfill tab Thành viên — mọi deal VPT đã có project (đang/đã qua SX)
  INSERT INTO lead_members (lead_id, user_id, role)
  SELECT cl.id, v_user_id, 'member'
  FROM crm_leads cl
  WHERE cl.type = 'deal'
    AND cl.project_id IS NOT NULL
    AND (
      cl.company_id = v_company_id
      OR cl.external_company_id = v_company_id
    )
  ON CONFLICT (lead_id, user_id) DO NOTHING;

  SELECT id INTO v_hcb_id FROM companies
  WHERE short_name ILIKE 'HCB' OR name ILIKE '%hucabi%' LIMIT 1;

  SELECT id INTO v_metalla_id FROM companies
  WHERE name ILIKE '%metalla%' LIMIT 1;

  IF v_hcb_id IS NOT NULL THEN
    INSERT INTO production_workshop_client_companies (production_company_id, client_company_id)
    VALUES (v_hcb_id, v_company_id)
    ON CONFLICT (production_company_id, client_company_id) DO NOTHING;
  END IF;

  IF v_metalla_id IS NOT NULL THEN
    INSERT INTO production_workshop_client_companies (production_company_id, client_company_id)
    VALUES (v_metalla_id, v_company_id)
    ON CONFLICT (production_company_id, client_company_id) DO NOTHING;
  END IF;

  RAISE NOTICE '371: % → company_id Vạn Phú Thành (%), user_id=%', v_email, v_company_id, v_user_id;
END $$;
