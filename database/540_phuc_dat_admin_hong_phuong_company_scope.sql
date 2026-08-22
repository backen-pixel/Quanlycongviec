-- 540: Trần Thị Hồng Phượng (kinhdoanh@phucdatdoor.vn) — admin công ty Phúc Đạt
-- Giữ role `admin` để xem mọi dự án mọi module, nhưng khóa company_id
-- (khác admin hệ thống: company_id NULL → thấy mọi công ty).
-- Idempotent.

DO $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_dept_id UUID;
  v_email CONSTANT TEXT := 'kinhdoanh@phucdatdoor.vn';
BEGIN
  SELECT c.id INTO v_company_id
  FROM companies c
  WHERE c.id = '29677f68-967e-4256-92fd-492bb580e888'
     OR c.name ILIKE '%Phúc Đạt%'
     OR c.name ILIKE '%Phuc Dat%'
     OR c.short_name ILIKE '%Phúc Đạt%'
     OR c.short_name ILIKE '%Phuc Dat%'
  ORDER BY CASE WHEN c.id = '29677f68-967e-4256-92fd-492bb580e888' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '540: Không tìm thấy công ty Phúc Đạt trong `companies`.';
  END IF;

  SELECT u.id INTO v_user_id
  FROM users u
  WHERE u.id = '3420259c-40b7-40c2-ae00-eb78c54f8732'
     OR lower(trim(u.email)) = v_email
     OR u.full_name ILIKE 'Trần Thị Hồng Phượng'
  ORDER BY CASE
    WHEN u.id = '3420259c-40b7-40c2-ae00-eb78c54f8732' THEN 0
    WHEN lower(trim(u.email)) = v_email THEN 1
    ELSE 2
  END
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '540: Không tìm thấy user Trần Thị Hồng Phượng.';
  END IF;

  SELECT d.id INTO v_dept_id
  FROM departments d
  WHERE d.company_id = v_company_id
    AND d.name ILIKE '%kinh doanh%'
  ORDER BY d.name
  LIMIT 1;

  UPDATE users
  SET
    role = 'admin',
    company_id = v_company_id,
    department_id = COALESCE(department_id, v_dept_id),
    is_active = true,
    updated_at = now()
  WHERE id = v_user_id;

  DELETE FROM user_companies
  WHERE user_id = v_user_id
    AND company_id <> v_company_id;

  INSERT INTO user_companies (user_id, company_id, is_primary)
  VALUES (v_user_id, v_company_id, true)
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    is_primary = true;

  INSERT INTO user_module_roles (user_id, module_key, role)
  VALUES (v_user_id, 'crm', 'admin')
  ON CONFLICT (user_id, module_key) DO UPDATE SET
    role = EXCLUDED.role;

  RAISE NOTICE '540: % → admin công ty Phúc Đạt (company_id=%)', v_email, v_company_id;
END $$;
