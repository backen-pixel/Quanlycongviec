-- 563: HCB — Trương Trọng Thành (trongthanh0800@gmail.com)
-- Thêm vào mọi dự án SX hiện tại (project_production_staff + lead_members),
-- NV mặc định mọi phân loại xưởng, và mặc định VC/LĐ khi thiết lập lắp đặt.
-- Không ghi đè phụ trách SX / VC / LĐ đã gán. Idempotent.

DO $$
DECLARE
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
  v_user UUID := '646e364e-504d-4362-af1a-4f4694b0d05d';
  n_staff INT := 0;
  n_members INT := 0;
  n_defaults INT := 0;
  n_logistics INT := 0;
  n_installer INT := 0;
BEGIN
  SELECT id INTO v_hcb
  FROM companies
  WHERE id = '18c2563f-3495-498d-8199-23200c9f420e'
     OR short_name ILIKE 'HCB'
     OR name ILIKE '%Hucabi%'
  ORDER BY CASE WHEN id = '18c2563f-3495-498d-8199-23200c9f420e' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_hcb IS NULL THEN
    RAISE NOTICE '563: Không tìm thấy công ty HCB — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_user
  FROM users
  WHERE id = '646e364e-504d-4362-af1a-4f4694b0d05d'
     OR lower(trim(email)) = 'trongthanh0800@gmail.com'
     OR full_name ILIKE 'Trương Trọng Thành'
  ORDER BY CASE
    WHEN id = '646e364e-504d-4362-af1a-4f4694b0d05d' THEN 0
    WHEN lower(trim(email)) = 'trongthanh0800@gmail.com' THEN 1
    ELSE 2
  END
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE '563: Không tìm thấy user Trương Trọng Thành — bỏ qua.';
    RETURN;
  END IF;

  UPDATE users
  SET is_active = true,
      updated_at = NOW()
  WHERE id = v_user
    AND is_active IS DISTINCT FROM true;

  INSERT INTO project_production_staff (project_id, user_id, order_index, is_primary)
  SELECT p.id,
         v_user,
         COALESCE((
           SELECT MAX(s.order_index) FROM project_production_staff s WHERE s.project_id = p.id
         ), 0) + 1,
         false
  FROM projects p
  WHERE p.company_id = v_hcb
    AND NOT EXISTS (
      SELECT 1 FROM project_production_staff s
      WHERE s.project_id = p.id AND s.user_id = v_user
    );
  GET DIAGNOSTICS n_staff = ROW_COUNT;

  INSERT INTO lead_members (lead_id, user_id, role)
  SELECT DISTINCT x.lead_id, v_user, 'member'
  FROM (
    SELECT l.id AS lead_id
    FROM crm_leads l
    JOIN projects p ON p.id = l.project_id
    WHERE p.company_id = v_hcb AND l.type = 'deal'
    UNION
    SELECT cdp.deal_id AS lead_id
    FROM crm_deal_projects cdp
    JOIN projects p ON p.id = cdp.project_id
    WHERE p.company_id = v_hcb
  ) x
  WHERE NOT EXISTS (
    SELECT 1 FROM lead_members lm
    WHERE lm.lead_id = x.lead_id AND lm.user_id = v_user
  );
  GET DIAGNOSTICS n_members = ROW_COUNT;

  INSERT INTO production_workshop_type_default_staff (
    production_company_id, workshop_type_id, user_id, order_index, is_primary
  )
  SELECT v_hcb, wpt.id, v_user, COALESCE((
    SELECT MAX(d.order_index)
    FROM production_workshop_type_default_staff d
    WHERE d.production_company_id = v_hcb AND d.workshop_type_id = wpt.id
  ), 0) + 1, false
  FROM workshop_project_types wpt
  WHERE wpt.company_id = v_hcb
    AND wpt.is_active IS DISTINCT FROM false
    AND NOT EXISTS (
      SELECT 1 FROM production_workshop_type_default_staff d
      WHERE d.production_company_id = v_hcb
        AND d.workshop_type_id = wpt.id
        AND d.user_id = v_user
    );
  GET DIAGNOSTICS n_defaults = ROW_COUNT;

  INSERT INTO logistics_handover_settings (
    logistics_company_id, responsible_user_id, installer_user_id, updated_at
  )
  VALUES (v_hcb, v_user, v_user, NOW())
  ON CONFLICT (logistics_company_id) DO UPDATE SET
    responsible_user_id = COALESCE(logistics_handover_settings.responsible_user_id, EXCLUDED.responsible_user_id),
    installer_user_id = COALESCE(logistics_handover_settings.installer_user_id, EXCLUDED.installer_user_id),
    updated_at = NOW();

  UPDATE projects
  SET logistics_person_id = v_user,
      updated_at = NOW()
  WHERE company_id = v_hcb
    AND logistics_person_id IS NULL;
  GET DIAGNOSTICS n_logistics = ROW_COUNT;

  UPDATE projects
  SET installer_person_id = v_user,
      updated_at = NOW()
  WHERE company_id = v_hcb
    AND installer_person_id IS NULL;
  GET DIAGNOSTICS n_installer = ROW_COUNT;

  RAISE NOTICE '563: Thành HCB | staff mới=% | thành viên deal=% | mặc định phân loại=% | VC trống=% | LĐ trống=%',
    n_staff, n_members, n_defaults, n_logistics, n_installer;
END $$;
