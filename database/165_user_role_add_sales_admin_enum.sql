-- 165_user_role_add_sales_admin_enum.sql
-- Bổ sung giá trị 'sales_admin' vào enum user_role (bản gốc 01_migration chỉ có admin..staff).
-- Idempotent.
--
-- QUAN TRỌNG (PostgreSQL 55P04):
--   Giá trị enum mới chỉ dùng được SAU KHI transaction chứa ALTER TYPE đã COMMIT.
--   → Chạy FILE NÀY MỘT MÌNH (một lần Run trong SQL Editor), đợi thành công,
--   → rồi mới chạy database/164_seed_kpi_group_a_test_cases.sql.
--   Không paste 165 + 164 vào cùng một transaction / cùng một khối BEGIN…COMMIT.

DO $enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
      AND e.enumlabel = 'sales_admin'
  ) THEN
    EXECUTE 'ALTER TYPE user_role ADD VALUE ''sales_admin''';
  END IF;
END $enum$;
