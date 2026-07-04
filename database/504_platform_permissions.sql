-- ════════════════════════════════════════════════════════════
-- 504: Platform-level permissions and role
-- ════════════════════════════════════════════════════════════

INSERT INTO permissions (resource, action, description) VALUES
  ('tenants', 'view', 'Xem danh sách hệ sinh thái'),
  ('tenants', 'create', 'Tạo hệ sinh thái mới'),
  ('tenants', 'edit', 'Sửa hệ sinh thái'),
  ('tenants', 'delete', 'Xóa hệ sinh thái'),
  ('tenants', 'manage_billing', 'Quản lý gói thuê bao'),
  ('tenants', 'manage_features', 'Bật/tắt tính năng'),
  ('platform_users', 'view', 'Xem tất cả user toàn nền tảng'),
  ('platform_users', 'impersonate', 'Đăng nhập thay (hỗ trợ)')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO roles (name, description, is_system) VALUES
  ('platform_admin', 'Quản trị viên nền tảng — toàn quyền trên mọi hệ sinh thái', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'platform_admin'
ON CONFLICT DO NOTHING;
