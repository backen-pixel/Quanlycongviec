-- 620_user_role_ecosystem_admin.sql
-- Role quản trị toàn hệ sinh thái (HST). Không phải platform_admin (SaaS vượt tenant).
--
-- PostgreSQL 55P04: giá trị enum mới chỉ dùng được SAU KHI transaction chứa
-- ALTER TYPE đã COMMIT. Chạy phần 1 một mình, đợi thành công, rồi phần 2.
-- Idempotent.

-- ── Phần 1: enum ──────────────────────────────────────────────────────────
DO $enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
      AND e.enumlabel = 'ecosystem_admin'
  ) THEN
    EXECUTE 'ALTER TYPE user_role ADD VALUE ''ecosystem_admin''';
  END IF;
END $enum$;

-- ── Phần 2 (chạy sau khi phần 1 đã COMMIT) ────────────────────────────────
-- Vai trò mẫu catalog: copy quyền từ `admin` (không copy platform_admin).
INSERT INTO roles (name, description, is_system)
SELECT
  'ecosystem_admin',
  'Quản trị toàn hệ sinh thái — mọi công ty trong HST, không vượt tenant',
  true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ecosystem_admin');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r_new.id, rp.permission_id
FROM roles r_new
JOIN roles r_admin ON r_admin.name = 'admin'
JOIN role_permissions rp ON rp.role_id = r_admin.id
WHERE r_new.name = 'ecosystem_admin'
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions x
    WHERE x.role_id = r_new.id
      AND x.permission_id = rp.permission_id
  );

-- Gán cho Admin Hệ Thống (admin@tubep.vn). Giữ company_id = null, tenant_id HST.
UPDATE users
SET role = 'ecosystem_admin'
WHERE id = '0db73a17-8ac2-4aaa-b2a8-c8f90360d77e'
   OR lower(email) = 'admin@tubep.vn';
