-- 342: luonggiayen@gmail.com — Facebook + Zalo OA, chỉ công ty NextGo
-- Quyền UI/API: CRM_SOCIAL_INBOX_EMAILS + company key nextgo (adminRole + crmSocialInboxScope).
-- Idempotent — chạy lại an toàn.

DO $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_email CONSTANT TEXT := 'luonggiayen@gmail.com';
BEGIN
  SELECT c.id INTO v_company_id
  FROM companies c
  WHERE c.name ILIKE '%NextGo%'
     OR c.short_name ILIKE '%NextGo%'
  ORDER BY c.name
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '342: Không tìm thấy công ty NextGo trong `companies`.';
  END IF;

  UPDATE users
  SET
    company_id = v_company_id,
    is_active = true,
    updated_at = now()
  WHERE email ILIKE v_email
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '342: Không tìm thấy user %.', v_email;
  END IF;

  DELETE FROM user_companies
  WHERE user_id = v_user_id
    AND company_id <> v_company_id;

  INSERT INTO user_companies (user_id, company_id, is_primary)
  VALUES (v_user_id, v_company_id, true)
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    is_primary = true;

  RAISE NOTICE '342: % → Facebook/Zalo chỉ NextGo (company_id=%)', v_email, v_company_id;
END $$;
