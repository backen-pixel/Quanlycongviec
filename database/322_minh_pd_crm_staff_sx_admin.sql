-- 322: minh@pd.com — NV CRM + Admin Sản xuất (công ty Phúc Đạt)
-- Role chính: crm_production_staff (CRM nhân viên, SX admin qua isProductionAdmin)
-- Idempotent.

BEGIN;

UPDATE users SET
  role = 'crm_production_staff',
  company_id = '29677f68-967e-4256-92fd-492bb580e888',
  department_id = '7f913e2c-8fa2-4871-b0b6-2876b6d5b076',
  updated_at = NOW()
WHERE email = 'minh@pd.com';

DELETE FROM user_roles ur
USING roles r, users u
WHERE ur.role_id = r.id
  AND ur.user_id = u.id
  AND u.email = 'minh@pd.com'
  AND r.name IN ('crm_production_admin', 'production_admin', 'production_staff', 'staff', 'sales_admin');

INSERT INTO user_roles (user_id, role_id, ecosystem_unit_id, granted_at)
SELECT u.id, r.id, NULL, NOW()
FROM users u
CROSS JOIN roles r
WHERE u.email = 'minh@pd.com'
  AND r.name = 'crm_production_staff'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur2
    WHERE ur2.user_id = u.id AND ur2.role_id = r.id AND ur2.ecosystem_unit_id IS NULL
  );

INSERT INTO production_handover_settings (production_company_id, responsible_user_id, updated_at)
SELECT u.company_id, u.id, NOW()
FROM users u
WHERE u.email = 'minh@pd.com' AND u.company_id IS NOT NULL
ON CONFLICT (production_company_id) DO UPDATE SET
  responsible_user_id = EXCLUDED.responsible_user_id,
  updated_at = NOW();

COMMIT;
