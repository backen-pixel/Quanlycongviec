-- 368: phuongcuc5313@gmail.com — role accounting, công ty VPT (giống ketoanvanphuthanh / ketoan1)
-- Chạy sau 366a + 366

DO $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_email TEXT := 'phuongcuc5313@gmail.com';
BEGIN
  SELECT id INTO v_company_id FROM companies
  WHERE name ILIKE '%Bếp Vạn Phú%'
     OR name ILIKE '%Vạn Phú%Thành%'
     OR short_name ILIKE '%VPT%'
  ORDER BY name LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '368: Không tìm thấy công ty VPT.';
  END IF;

  UPDATE users
  SET role = 'accounting', company_id = v_company_id, is_active = true, updated_at = now()
  WHERE email ILIKE v_email
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '368: Không tìm thấy user %.', v_email;
  END IF;

  DELETE FROM user_company_regions WHERE user_id = v_user_id;

  DELETE FROM user_companies
  WHERE user_id = v_user_id AND company_id <> v_company_id;

  INSERT INTO user_companies (user_id, company_id, is_primary)
  VALUES (v_user_id, v_company_id, true)
  ON CONFLICT (user_id, company_id) DO UPDATE SET is_primary = true;

  RAISE NOTICE '368: % → accounting (company_id=%)', v_email, v_company_id;
END $$;
