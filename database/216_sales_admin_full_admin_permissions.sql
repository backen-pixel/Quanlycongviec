-- 216_sales_admin_full_admin_permissions.sql
-- Nâng quyền role 'sales_admin' lên ngang 'admin' (toàn quyền permissions),
-- nhưng phạm vi DỮ LIỆU vẫn bị khoá theo company_id của user (backend ép filter).
-- Schema: roles + permissions + role_permissions (xem backend/supabase/24_permission_system.sql).
-- Idempotent: chạy lại nhiều lần không gây lỗi.
--
-- LƯU Ý: chạy file này SAU 163_add_sales_admin_role.sql và 165_user_role_add_sales_admin_enum.sql.

BEGIN;

-- Cập nhật mô tả role cho rõ vai trò mới.
UPDATE roles
SET description = 'Quản trị viên Kinh doanh (toàn quyền trong phạm vi công ty)'
WHERE name = 'sales_admin';

-- Cấp TẤT CẢ permissions cho sales_admin (giống nhánh admin trong migration 24).
-- Phạm vi dữ liệu bị khoá company_id ở tầng API, không khoá ở tầng permission.
DO $$
DECLARE
  sa_role_id UUID;
BEGIN
  SELECT id INTO sa_role_id FROM roles WHERE name = 'sales_admin';
  IF sa_role_id IS NULL THEN
    RAISE NOTICE 'sales_admin role chưa tồn tại — bỏ qua việc cấp permissions.';
    RETURN;
  END IF;

  -- Xoá set permission cũ (limited từ migration 163) để đảm bảo nguyên trạng "full admin".
  -- Sau đó re-insert toàn bộ permissions.
  DELETE FROM role_permissions WHERE role_id = sa_role_id;

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT sa_role_id, p.id
  FROM permissions p
  ON CONFLICT DO NOTHING;
END $$;

COMMIT;
