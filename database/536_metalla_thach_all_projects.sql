-- 536: Metalla — Thạch (thach@metalla.com) vào mọi dự án SX hiện tại
-- (project_production_staff + lead_members) và NV mặc định phân loại (dự án mới).
-- Giữ role production_staff. Idempotent.

DO $$
DECLARE
  v_metalla UUID := 'b78baba2-2486-434c-a72d-9c937fac2164';
  v_user UUID := '706073ac-1bae-43b9-9f2e-408a6052a8fd';
  n_staff INT := 0;
  n_members INT := 0;
  n_defaults INT := 0;
BEGIN
  SELECT id INTO v_metalla
  FROM companies
  WHERE id = 'b78baba2-2486-434c-a72d-9c937fac2164'
     OR name ILIKE '%metalla%'
  ORDER BY CASE WHEN id = 'b78baba2-2486-434c-a72d-9c937fac2164' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_metalla IS NULL THEN
    RAISE NOTICE '536: Không tìm thấy công ty Metalla — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_user
  FROM users
  WHERE id = '706073ac-1bae-43b9-9f2e-408a6052a8fd'
     OR lower(trim(email)) = 'thach@metalla.com'
  ORDER BY CASE
    WHEN id = '706073ac-1bae-43b9-9f2e-408a6052a8fd' THEN 0
    WHEN lower(trim(email)) = 'thach@metalla.com' THEN 1
    ELSE 2
  END
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE '536: Không tìm thấy user thach@metalla.com — bỏ qua.';
    RETURN;
  END IF;

  UPDATE users
  SET company_id = v_metalla,
      is_active = true,
      updated_at = NOW()
  WHERE id = v_user
    AND (company_id IS DISTINCT FROM v_metalla OR is_active IS DISTINCT FROM true);

  INSERT INTO project_production_staff (project_id, user_id, order_index, is_primary)
  SELECT p.id,
         v_user,
         COALESCE((
           SELECT MAX(s.order_index) FROM project_production_staff s WHERE s.project_id = p.id
         ), 0) + 1,
         false
  FROM projects p
  WHERE p.company_id = v_metalla
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
    WHERE p.company_id = v_metalla AND l.type = 'deal'
    UNION
    SELECT cdp.deal_id AS lead_id
    FROM crm_deal_projects cdp
    JOIN projects p ON p.id = cdp.project_id
    WHERE p.company_id = v_metalla
  ) x
  WHERE NOT EXISTS (
    SELECT 1 FROM lead_members lm
    WHERE lm.lead_id = x.lead_id AND lm.user_id = v_user
  );
  GET DIAGNOSTICS n_members = ROW_COUNT;

  INSERT INTO production_workshop_type_default_staff (
    production_company_id, workshop_type_id, user_id, order_index, is_primary
  )
  SELECT v_metalla, wpt.id, v_user, COALESCE((
    SELECT MAX(d.order_index)
    FROM production_workshop_type_default_staff d
    WHERE d.production_company_id = v_metalla AND d.workshop_type_id = wpt.id
  ), 0) + 1, false
  FROM workshop_project_types wpt
  WHERE wpt.company_id = v_metalla
    AND wpt.is_active IS DISTINCT FROM false
    AND NOT EXISTS (
      SELECT 1 FROM production_workshop_type_default_staff d
      WHERE d.production_company_id = v_metalla
        AND d.workshop_type_id = wpt.id
        AND d.user_id = v_user
    );
  GET DIAGNOSTICS n_defaults = ROW_COUNT;

  RAISE NOTICE '536: Thạch Metalla | staff mới=% | thành viên deal=% | mặc định phân loại=%',
    n_staff, n_members, n_defaults;
END $$;
