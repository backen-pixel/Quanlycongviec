-- 289: Role «Nhân viên sản xuất» — thấy module Công việc + Sản xuất, quản trị trong phạm vi 2 module đó.
-- Chạy sau 246_user_role_module_admins.sql.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'production_staff'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'production_staff';
  END IF;
END $$;

INSERT INTO roles (name, description, is_system)
VALUES (
  'production_staff',
  'Nhân viên sản xuất — quản trị module Công việc và Sản xuất (phạm vi công ty)',
  true
)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description;

-- Cấp quyền vận hành dự án / quy trình / mẫu / báo cáo (không users/settings write).
DO $$
DECLARE
  ps_role_id UUID;
BEGIN
  SELECT id INTO ps_role_id FROM roles WHERE name = 'production_staff';
  IF ps_role_id IS NULL THEN
    RAISE NOTICE 'production_staff role chưa tồn tại — bỏ qua cấp permissions.';
    RETURN;
  END IF;

  DELETE FROM role_permissions WHERE role_id = ps_role_id;

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT ps_role_id, p.id
  FROM permissions p
  WHERE p.resource IN ('projects', 'workflows', 'templates', 'reports', 'customers', 'ecosystem')
  ON CONFLICT DO NOTHING;

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT ps_role_id, p.id
  FROM permissions p
  WHERE p.resource IN ('users', 'settings') AND p.action = 'view'
  ON CONFLICT DO NOTHING;
END $$;
