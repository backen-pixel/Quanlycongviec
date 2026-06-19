-- 365: Kế toán VPT — staff công ty, xem deal/SX theo lead_members; BG/ĐH/HĐ toàn công ty.
-- ketoanvanphuthanh.vpt@gmail.com, ketoan1@vpt.vn
-- Chạy sau 363 (đã gán company_id) và 364 (RPC lead_members).

DO $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_email TEXT;
  v_emails TEXT[] := ARRAY[
    'ketoanvanphuthanh.vpt@gmail.com',
    'ketoan1@vpt.vn'
  ];
BEGIN
  SELECT c.id INTO v_company_id
  FROM companies c
  WHERE c.name ILIKE '%Bếp Vạn Phú%'
     OR c.name ILIKE '%Vạn Phú%Thành%'
     OR c.name ILIKE '%Van Phu%Thanh%'
     OR (c.name ILIKE '%Vạn Phú%' AND c.name ILIKE '%Thành%')
     OR c.short_name ILIKE '%VPT%'
  ORDER BY c.name
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '365: Không tìm thấy công ty Bếp Vạn Phú Thành trong `companies`.';
  END IF;

  FOREACH v_email IN ARRAY v_emails LOOP
    UPDATE users
    SET
      role = 'staff',
      company_id = v_company_id,
      is_active = true,
      updated_at = now()
    WHERE email ILIKE v_email
    RETURNING id INTO v_user_id;

    IF v_user_id IS NULL THEN
      RAISE EXCEPTION '365: Không tìm thấy user %.', v_email;
    END IF;

    DELETE FROM user_company_regions WHERE user_id = v_user_id;

    DELETE FROM user_companies
    WHERE user_id = v_user_id
      AND company_id <> v_company_id;

    INSERT INTO user_companies (user_id, company_id, is_primary)
    VALUES (v_user_id, v_company_id, true)
    ON CONFLICT (user_id, company_id) DO UPDATE SET
      is_primary = true;

    RAISE NOTICE '365: % → staff công ty VPT (company_id=%)', v_email, v_company_id;
    v_user_id := NULL;
  END LOOP;
END $$;
