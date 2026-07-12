-- Migration 26: Add manage_subordinates permission
-- Date: 2026-03-07
-- Description: Add special permission for managers to manage subordinates

INSERT INTO permissions (resource, action, description) VALUES
  ('users', 'manage_subordinates', '🛡️ Quản lý cấp dưới (chỉ Giám đốc, Quản lý, Giám sát)')
ON CONFLICT (resource, action) DO UPDATE
  SET description = EXCLUDED.description;

-- Grant to admin role by default
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM roles WHERE name = 'admin'),
  (SELECT id FROM permissions WHERE resource = 'users' AND action = 'manage_subordinates')
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = (SELECT id FROM roles WHERE name = 'admin')
    AND rp.permission_id = (SELECT id FROM permissions WHERE resource = 'users' AND action = 'manage_subordinates')
);

-- Grant to manager role by default
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM roles WHERE name = 'manager'),
  (SELECT id FROM permissions WHERE resource = 'users' AND action = 'manage_subordinates')
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = (SELECT id FROM roles WHERE name = 'manager')
    AND rp.permission_id = (SELECT id FROM permissions WHERE resource = 'users' AND action = 'manage_subordinates')
);
