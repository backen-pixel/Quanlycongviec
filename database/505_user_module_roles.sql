-- 505_user_module_roles.sql
-- NV nhiều module, mỗi module đúng 1 role. users.role vẫn tồn tại (derived) cho JWT legacy.

CREATE TABLE IF NOT EXISTS user_module_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module_key TEXT NOT NULL,
  role TEXT NOT NULL,
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_module_roles_user_module_uq UNIQUE (user_id, module_key),
  CONSTRAINT user_module_roles_module_key_chk CHECK (
    module_key IN ('crm', 'production', 'logistics', 'accounting', 'purchasing', 'tinhtoan')
  )
);

-- FK mềm (một số môi trường backup không có UNIQUE/PK khớp trên users.id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_module_roles_user_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE user_module_roles
        ADD CONSTRAINT user_module_roles_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skip user_id FK: %', SQLERRM;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_module_roles_user ON user_module_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_roles_module ON user_module_roles(module_key);

COMMENT ON TABLE user_module_roles IS 'Một user có nhiều module; mỗi module đúng một role nghiệp vụ';

-- Backfill từ users.role + drive_module (chỉ khi chưa có row)
INSERT INTO user_module_roles (user_id, module_key, role)
SELECT u.id, x.module_key, x.role
FROM users u
CROSS JOIN LATERAL (
  SELECT * FROM (
    VALUES
      -- Hybrid CRM + SX
      (CASE WHEN lower(u.role::text) IN ('crm_production_staff', 'crm_production_admin') THEN 'crm' END,
       CASE WHEN lower(u.role::text) IN ('crm_production_staff', 'crm_production_admin') THEN lower(u.role::text) END),
      (CASE WHEN lower(u.role::text) IN ('crm_production_staff', 'crm_production_admin') THEN 'production' END,
       CASE WHEN lower(u.role::text) IN ('crm_production_staff', 'crm_production_admin') THEN lower(u.role::text) END),
      -- CRM-only roles
      (CASE WHEN lower(u.role::text) IN (
        'sales', 'sales_admin', 'designer', 'customer_care', 'region_admin', 'manager', 'staff', 'admin', 'platform_admin'
      ) THEN 'crm' END,
       CASE WHEN lower(u.role::text) IN (
        'sales', 'sales_admin', 'designer', 'customer_care', 'region_admin', 'manager', 'staff', 'admin', 'platform_admin'
       ) THEN lower(u.role::text) END),
      -- SX
      (CASE WHEN lower(u.role::text) IN ('production_staff', 'production_admin', 'production') THEN 'production' END,
       CASE WHEN lower(u.role::text) IN ('production_staff', 'production_admin', 'production') THEN lower(u.role::text) END),
      -- VC
      (CASE WHEN lower(u.role::text) IN ('logistics_admin', 'driver', 'installer', 'logistics', 'shipping') THEN 'logistics' END,
       CASE WHEN lower(u.role::text) IN ('logistics_admin', 'driver', 'installer', 'logistics', 'shipping')
         THEN CASE
           WHEN lower(u.role::text) IN ('logistics', 'shipping') THEN 'logistics_admin'
           ELSE lower(u.role::text)
         END
       END),
      -- Kế toán
      (CASE WHEN lower(u.role::text) IN ('accounting', 'ketoan') THEN 'accounting' END,
       CASE WHEN lower(u.role::text) IN ('accounting', 'ketoan') THEN 'accounting' END)
  ) AS t(module_key, role)
  WHERE t.module_key IS NOT NULL AND t.role IS NOT NULL
) AS x
WHERE NOT EXISTS (
  SELECT 1 FROM user_module_roles umr
  WHERE umr.user_id = u.id AND umr.module_key = x.module_key
)
ON CONFLICT (user_id, module_key) DO NOTHING;

-- Fallback drive_module khi role mơ hồ / chưa map
INSERT INTO user_module_roles (user_id, module_key, role)
SELECT u.id,
  CASE lower(COALESCE(u.drive_module, ''))
    WHEN 'sx' THEN 'production'
    WHEN 'vc' THEN 'logistics'
    ELSE 'crm'
  END,
  COALESCE(NULLIF(lower(u.role::text), ''), 'staff')
FROM users u
WHERE COALESCE(u.drive_module, '') <> ''
  AND NOT EXISTS (SELECT 1 FROM user_module_roles umr WHERE umr.user_id = u.id)
ON CONFLICT (user_id, module_key) DO NOTHING;

-- RPC: override → user_roles → user_module_roles → users.role → deny
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id UUID,
  p_resource VARCHAR,
  p_action VARCHAR,
  p_ecosystem_unit_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  has_perm BOOLEAN;
  perm_id UUID;
BEGIN
  SELECT id INTO perm_id FROM permissions
  WHERE resource = p_resource AND action = p_action AND is_active = true;

  IF perm_id IS NULL THEN RETURN false; END IF;

  SELECT granted INTO has_perm FROM user_permissions
  WHERE user_id = p_user_id
    AND permission_id = perm_id
    AND (ecosystem_unit_id = p_ecosystem_unit_id OR ecosystem_unit_id IS NULL OR p_ecosystem_unit_id IS NULL)
  ORDER BY ecosystem_unit_id NULLS LAST
  LIMIT 1;

  IF has_perm IS NOT NULL THEN RETURN has_perm; END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND rp.permission_id = perm_id
      AND (ur.ecosystem_unit_id = p_ecosystem_unit_id OR ur.ecosystem_unit_id IS NULL OR p_ecosystem_unit_id IS NULL)
  ) INTO has_perm;

  IF has_perm THEN RETURN true; END IF;

  -- Vai trò theo module (user_module_roles) — union
  SELECT EXISTS(
    SELECT 1 FROM user_module_roles umr
    JOIN roles r ON lower(r.name) = lower(umr.role)
    JOIN role_permissions rp ON rp.role_id = r.id
    WHERE umr.user_id = p_user_id
      AND rp.permission_id = perm_id
  ) INTO has_perm;

  IF has_perm THEN RETURN true; END IF;

  SELECT EXISTS(
    SELECT 1 FROM users u
    JOIN roles r ON lower(r.name) = lower(u.role::text)
    JOIN role_permissions rp ON rp.role_id = r.id
    WHERE u.id = p_user_id
      AND rp.permission_id = perm_id
  ) INTO has_perm;

  RETURN COALESCE(has_perm, false);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION user_has_permission IS 'Check permission: override → user_roles → user_module_roles → users.role → deny';
