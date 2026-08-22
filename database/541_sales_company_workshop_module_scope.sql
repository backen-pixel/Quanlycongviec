-- 541: Sale / Sales Admin — gắn users.company_id theo phòng ban hoặc user_companies
-- để xem module SX + VC/LĐ đúng công ty của họ (không xem công ty khác).
-- Idempotent. Không đổi role.

DO $$
DECLARE
  n_from_dept INT := 0;
  n_from_uc INT := 0;
BEGIN
  UPDATE users u
  SET
    company_id = d.company_id,
    updated_at = now()
  FROM departments d
  WHERE d.id = u.department_id
    AND d.company_id IS NOT NULL
    AND lower(u.role::text) IN ('sales', 'sales_admin')
    AND COALESCE(u.is_active, true) = true
    AND u.company_id IS NULL;
  GET DIAGNOSTICS n_from_dept = ROW_COUNT;

  UPDATE users u
  SET
    company_id = src.company_id,
    updated_at = now()
  FROM (
    SELECT DISTINCT ON (uc.user_id) uc.user_id, uc.company_id
    FROM user_companies uc
    ORDER BY uc.user_id, uc.is_primary DESC NULLS LAST, uc.company_id
  ) src
  WHERE u.id = src.user_id
    AND lower(u.role::text) IN ('sales', 'sales_admin')
    AND COALESCE(u.is_active, true) = true
    AND u.company_id IS NULL;
  GET DIAGNOSTICS n_from_uc = ROW_COUNT;

  INSERT INTO user_companies (user_id, company_id, is_primary)
  SELECT u.id, u.company_id, true
  FROM users u
  WHERE lower(u.role::text) IN ('sales', 'sales_admin')
    AND COALESCE(u.is_active, true) = true
    AND u.company_id IS NOT NULL
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    is_primary = true;

  RAISE NOTICE '541: sales company_id từ phòng ban=%, từ user_companies=%', n_from_dept, n_from_uc;
END $$;
