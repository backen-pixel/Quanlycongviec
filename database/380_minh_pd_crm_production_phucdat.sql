-- 380: minh@pd.com — NV CRM + Admin Sản xuất công ty Phúc Đạt
-- Idempotent — chạy lại an toàn.

DO $$
DECLARE
  v_company_id UUID;
  v_dept_id UUID;
  v_user_id UUID;
  v_ecosystem_unit_id UUID;
  v_role_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies
  WHERE name ILIKE '%Phúc Đạt%' OR name ILIKE '%Phuc Dat%'
  ORDER BY name
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '380: Không tìm thấy công ty Phúc Đạt.';
  END IF;

  SELECT id INTO v_dept_id FROM departments
  WHERE company_id = v_company_id AND name ILIKE '%sản xuất%'
  ORDER BY name
  LIMIT 1;

  UPDATE users
  SET
    role = 'crm_production_staff',
    company_id = v_company_id,
    department_id = COALESCE(v_dept_id, department_id),
    is_active = true,
    updated_at = now()
  WHERE email ILIKE 'minh@pd.com'
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '380: Không tìm thấy user minh@pd.com.';
  END IF;

  DELETE FROM user_companies
  WHERE user_id = v_user_id AND company_id <> v_company_id;

  INSERT INTO user_companies (user_id, company_id, is_primary)
  VALUES (v_user_id, v_company_id, true)
  ON CONFLICT (user_id, company_id) DO UPDATE SET is_primary = true;

  SELECT id INTO v_role_id FROM roles WHERE name = 'crm_production_staff';

  IF v_role_id IS NOT NULL THEN
    DELETE FROM user_roles ur
    USING roles r
    WHERE ur.role_id = r.id
      AND ur.user_id = v_user_id
      AND r.name IN ('crm_production_admin', 'production_admin', 'production_staff', 'staff', 'sales_admin');

    INSERT INTO user_roles (user_id, role_id, ecosystem_unit_id, granted_at)
    SELECT v_user_id, v_role_id, NULL, now()
    WHERE NOT EXISTS (
      SELECT 1 FROM user_roles ur2
      WHERE ur2.user_id = v_user_id
        AND ur2.role_id = v_role_id
        AND ur2.ecosystem_unit_id IS NULL
    );

    SELECT id INTO v_ecosystem_unit_id FROM ecosystem_units
    WHERE name ILIKE '%Phúc Đạt%' OR name ILIKE '%Phuc Dat%'
    ORDER BY name
    LIMIT 1;

    IF v_ecosystem_unit_id IS NOT NULL THEN
      INSERT INTO user_roles (user_id, role_id, ecosystem_unit_id, granted_at)
      SELECT v_user_id, v_role_id, v_ecosystem_unit_id, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM user_roles ur2
        WHERE ur2.user_id = v_user_id
          AND ur2.role_id = v_role_id
          AND ur2.ecosystem_unit_id = v_ecosystem_unit_id
      );
    END IF;
  END IF;

  INSERT INTO production_handover_settings (production_company_id, responsible_user_id, updated_at)
  VALUES (v_company_id, v_user_id, now())
  ON CONFLICT (production_company_id) DO UPDATE SET
    responsible_user_id = EXCLUDED.responsible_user_id,
    updated_at = now();

  RAISE NOTICE '380: minh@pd.com → CRM + SX Phúc Đạt (company_id=%)', v_company_id;
END $$;
