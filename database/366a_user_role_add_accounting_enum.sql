-- 366a_user_role_add_accounting_enum.sql
-- Bổ sung giá trị 'accounting' vào enum user_role.
-- Idempotent.
--
-- QUAN TRỌNG (PostgreSQL 55P04):
--   Giá trị enum mới chỉ dùng được SAU KHI transaction chứa ALTER TYPE đã COMMIT.
--   → Chạy FILE NÀY MỘT MÌNH (một lần Run trong SQL Editor), đợi thành công,
--   → rồi mới chạy database/366_accounting_external_company_link.sql.

DO $enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
      AND e.enumlabel = 'accounting'
  ) THEN
    EXECUTE 'ALTER TYPE user_role ADD VALUE ''accounting''';
  END IF;
END $enum$;
