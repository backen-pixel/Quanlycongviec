-- 621_hst_admin_user_companies.sql
-- Gắn mọi công ty trong HST vào user_companies cho admin hệ thống
-- (ecosystem_admin, hoặc admin không company_id). Không đụng users.company_id.
-- Idempotent.

INSERT INTO user_companies (user_id, company_id, is_primary)
SELECT u.id, c.id, false
FROM users u
JOIN companies c ON c.tenant_id = u.tenant_id
WHERE u.tenant_id IS NOT NULL
  AND u.is_active IS DISTINCT FROM false
  AND (c.is_active IS TRUE OR c.is_active IS NULL)
  AND (
    u.role::text = 'ecosystem_admin'
    OR (u.role::text = 'admin' AND u.company_id IS NULL)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM user_companies uc
    WHERE uc.user_id = u.id
      AND uc.company_id = c.id
  );
