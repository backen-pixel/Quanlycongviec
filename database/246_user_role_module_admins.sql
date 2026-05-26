-- 246: Role admin theo module (Sản xuất / Vận chuyển).
-- Chạy sau 165_user_role_add_sales_admin_enum.sql nếu dùng enum user_role.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'production_admin'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'production_admin';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'logistics_admin'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'logistics_admin';
  END IF;
END $$;

INSERT INTO roles (name, description, is_system)
VALUES
  ('production_admin', 'Quản trị module Sản xuất (phạm vi công ty)', true),
  ('logistics_admin', 'Quản trị module Vận chuyển & Lắp đặt (phạm vi công ty)', true)
ON CONFLICT (name) DO NOTHING;
