-- 174_user_role_enum_add_executive_values.sql
-- Bổ sung các giá trị user_role mà CRM/KPI dùng nhưng enum gốc (01_migration) chưa có.
-- Lỗi thường gặp: invalid input value for enum user_role: "region_admin"
-- Idempotent — an toàn chạy lại.
--
-- PostgreSQL: ALTER TYPE ... ADD VALUE không nằm trong transaction cùng INSERT dùng giá trị đó
-- trong một số phiên bản; chạy file này một lần trong SQL editor / migration runner.

DO $enum$
BEGIN
  -- region_admin (admin khu vực CRM — crmAccessRoles, RequireExecutive, KPI)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'region_admin'
  ) THEN
    EXECUTE 'ALTER TYPE user_role ADD VALUE ''region_admin''';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'director'
  ) THEN
    EXECUTE 'ALTER TYPE user_role ADD VALUE ''director''';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'supervisor'
  ) THEN
    EXECUTE 'ALTER TYPE user_role ADD VALUE ''supervisor''';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'superadmin'
  ) THEN
    EXECUTE 'ALTER TYPE user_role ADD VALUE ''superadmin''';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'super_admin'
  ) THEN
    EXECUTE 'ALTER TYPE user_role ADD VALUE ''super_admin''';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'administrator'
  ) THEN
    EXECUTE 'ALTER TYPE user_role ADD VALUE ''administrator''';
  END IF;
END $enum$;
