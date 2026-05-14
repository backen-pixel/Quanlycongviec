-- 163_add_sales_admin_role.sql
-- Thêm role 'sales_admin' (Trưởng/Phụ trách Kinh doanh — Sales Admin / SAE Lead).
-- Schema thực tế: roles(id, name) + permissions(id, resource, action) + role_permissions(role_id, permission_id).
-- Quyền hạn: như 'manager' trừ 'users' và 'settings' write — chỉ thao tác phạm vi Sales/CRM.
-- Vẫn bị giới hạn theo company_id của user (helper crmAccessRoles.js xử lý phạm vi).
-- Idempotent.

BEGIN;

-- 1) Thêm role vào bảng roles (nếu chưa có).
INSERT INTO roles (name, description, is_system)
VALUES ('sales_admin', 'Trưởng phòng/Phụ trách Kinh doanh (Sales Admin)', true)
ON CONFLICT (name) DO NOTHING;

-- 2) Cấp permissions cho sales_admin: tất cả trừ users.* (write) và settings.edit.
--    Cụ thể: được toàn quyền projects/workflows/templates/customers/ecosystem/reports;
--    chỉ xem (view) đối với users và settings.
DO $$
DECLARE
  sa_role_id UUID;
BEGIN
  SELECT id INTO sa_role_id FROM roles WHERE name = 'sales_admin';
  IF sa_role_id IS NULL THEN
    RAISE NOTICE 'sales_admin role not created — skip granting permissions';
    RETURN;
  END IF;

  -- Toàn quyền các resource phục vụ vận hành kinh doanh.
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT sa_role_id, p.id
  FROM permissions p
  WHERE p.resource IN ('projects', 'workflows', 'templates', 'customers', 'ecosystem', 'reports')
  ON CONFLICT DO NOTHING;

  -- Chỉ xem đối với users và settings (không sửa, không xoá).
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT sa_role_id, p.id
  FROM permissions p
  WHERE p.resource IN ('users', 'settings') AND p.action = 'view'
  ON CONFLICT DO NOTHING;
END $$;

COMMIT;
