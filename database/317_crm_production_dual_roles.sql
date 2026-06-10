-- 317_crm_production_dual_roles.sql
-- Role kép CRM + Sản xuất (nhân viên và admin công ty).
-- Chạy sau 289_production_staff_role.sql và 246_user_role_module_admins.sql.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'crm_production_staff'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'crm_production_staff';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'crm_production_admin'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'crm_production_admin';
  END IF;
END $$;

INSERT INTO roles (name, description, is_system)
VALUES
  (
    'crm_production_staff',
    'Nhân viên CRM + Admin Sản xuất — CRM theo deal được giao; quản trị SX trong phạm vi công ty',
    true
  ),
  (
    'crm_production_admin',
    'Admin CRM + Sản xuất — quản trị CRM và SX trong phạm vi công ty (cần company_id)',
    true
  )
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description;

-- NV CRM + SX: giống production_staff + quyền vận hành CRM (customers/ecosystem).
DO $$
DECLARE
  v_role_id UUID;
BEGIN
  SELECT id INTO v_role_id FROM roles WHERE name = 'crm_production_staff';
  IF v_role_id IS NULL THEN
    RAISE NOTICE 'crm_production_staff chưa tồn tại — bỏ qua permissions.';
    RETURN;
  END IF;

  DELETE FROM role_permissions WHERE role_id = v_role_id;

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id
  FROM permissions p
  WHERE p.resource IN ('projects', 'workflows', 'templates', 'reports', 'customers', 'ecosystem')
  ON CONFLICT DO NOTHING;

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id
  FROM permissions p
  WHERE p.resource IN ('users', 'settings') AND p.action = 'view'
  ON CONFLICT DO NOTHING;
END $$;

-- Admin CRM + SX: giống sales_admin (vận hành đầy đủ, không sửa users/settings).
DO $$
DECLARE
  v_role_id UUID;
BEGIN
  SELECT id INTO v_role_id FROM roles WHERE name = 'crm_production_admin';
  IF v_role_id IS NULL THEN
    RAISE NOTICE 'crm_production_admin chưa tồn tại — bỏ qua permissions.';
    RETURN;
  END IF;

  DELETE FROM role_permissions WHERE role_id = v_role_id;

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id
  FROM permissions p
  WHERE p.resource IN ('projects', 'workflows', 'templates', 'customers', 'ecosystem', 'reports')
  ON CONFLICT DO NOTHING;

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id
  FROM permissions p
  WHERE p.resource IN ('users', 'settings') AND p.action = 'view'
  ON CONFLICT DO NOTHING;
END $$;

COMMIT;
