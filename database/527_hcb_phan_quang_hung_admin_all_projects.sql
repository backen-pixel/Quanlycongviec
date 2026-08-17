-- 527: HCB — Phan Quang Hùng (phanquanghung@gmail.com) → production_admin
-- và thêm vào mọi dự án SX hiện tại của HCB (project_production_staff + lead_members).
-- Idempotent.

DO $$
DECLARE
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
  v_user UUID := '6bb4c89a-17e1-4b03-b72c-a77e49e53cac';
  v_dept UUID := '5d648490-1c3f-462e-a5b6-2ebdd64328f9';
  n_staff INT := 0;
  n_members INT := 0;
  n_defaults INT := 0;
BEGIN
  SELECT id INTO v_hcb
  FROM companies
  WHERE id = '18c2563f-3495-498d-8199-23200c9f420e'
     OR short_name ILIKE 'HCB'
     OR name ILIKE '%Hucabi%'
  ORDER BY CASE WHEN id = '18c2563f-3495-498d-8199-23200c9f420e' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_hcb IS NULL THEN
    RAISE NOTICE '527: Không tìm thấy công ty HCB — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_user
  FROM users
  WHERE id = '6bb4c89a-17e1-4b03-b72c-a77e49e53cac'
     OR lower(trim(email)) = 'phanquanghung@gmail.com'
     OR (full_name ILIKE 'Phan Quang Hùng' AND department_id IN (
          SELECT id FROM departments WHERE company_id = v_hcb
        ))
  ORDER BY CASE
    WHEN id = '6bb4c89a-17e1-4b03-b72c-a77e49e53cac' THEN 0
    WHEN lower(trim(email)) = 'phanquanghung@gmail.com' THEN 1
    ELSE 2
  END
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE '527: Không tìm thấy user Phan Quang Hùng — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_dept
  FROM departments
  WHERE company_id = v_hcb AND lower(trim(name)) = 'phòng sản xuất'
  ORDER BY created_at
  LIMIT 1;

  UPDATE users
  SET role = 'production_admin',
      company_id = v_hcb,
      department_id = COALESCE(department_id, v_dept),
      is_active = true,
      updated_at = NOW()
  WHERE id = v_user;

  INSERT INTO user_module_roles (user_id, module_key, role)
  VALUES (v_user, 'production', 'production_admin')
  ON CONFLICT (user_id, module_key) DO UPDATE
  SET role = EXCLUDED.role;

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
    production_company_id, workshop_type_id, user_id, order_index
  )
  SELECT v_hcb, wpt.id, v_user, COALESCE((
    SELECT MAX(d.order_index)
    FROM production_workshop_type_default_staff d
    WHERE d.production_company_id = v_hcb AND d.workshop_type_id = wpt.id
  ), 0) + 1
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

  RAISE NOTICE '527: Hùng HCB production_admin | staff mới=% | thành viên deal=% | mặc định phân loại=%',
    n_staff, n_members, n_defaults;
END $$;
