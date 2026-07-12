-- Migration 24: Comprehensive permission system
-- Role-based access control (RBAC) for ecosystem units and features

-- ═══ 1. ROLES TABLE ═══
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN DEFAULT false, -- System roles cannot be deleted
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Default system roles
INSERT INTO roles (name, description, is_system) VALUES
  ('admin', 'Toàn quyền hệ thống', true),
  ('manager', 'Quản lý công ty', true),
  ('employee', 'Nhân viên', true),
  ('viewer', 'Chỉ xem', true)
ON CONFLICT (name) DO NOTHING;

-- ═══ 2. PERMISSIONS TABLE ═══
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource VARCHAR(100) NOT NULL, -- 'projects', 'workflows', 'templates', 'users', etc.
  action VARCHAR(50) NOT NULL,    -- 'view', 'create', 'edit', 'delete'
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(resource, action)
);

-- Default permissions (core features)
INSERT INTO permissions (resource, action, description) VALUES
  -- Projects
  ('projects', 'view', 'Xem danh sách dự án'),
  ('projects', 'create', 'Tạo dự án mới'),
  ('projects', 'edit', 'Sửa dự án'),
  ('projects', 'delete', 'Xóa dự án'),
  ('projects', 'all_companies', 'Xem dự án của tất cả công ty'),
  
  -- Workflows
  ('workflows', 'view', 'Xem quy trình công việc'),
  ('workflows', 'create', 'Tạo quy trình'),
  ('workflows', 'edit', 'Sửa quy trình'),
  ('workflows', 'delete', 'Xóa quy trình'),
  
  -- Templates
  ('templates', 'view', 'Xem bộ mẫu'),
  ('templates', 'create', 'Tạo bộ mẫu'),
  ('templates', 'edit', 'Sửa bộ mẫu'),
  ('templates', 'delete', 'Xóa bộ mẫu'),
  
  -- Users
  ('users', 'view', 'Xem danh sách nhân viên'),
  ('users', 'create', 'Thêm nhân viên'),
  ('users', 'edit', 'Sửa thông tin nhân viên'),
  ('users', 'delete', 'Xóa nhân viên'),
  
  -- Ecosystem
  ('ecosystem', 'view', 'Xem cấu trúc công ty'),
  ('ecosystem', 'edit', 'Sửa cấu trúc công ty'),
  
  -- Reports
  ('reports', 'view', 'Xem báo cáo'),
  ('reports', 'export', 'Xuất báo cáo'),
  
  -- Settings
  ('settings', 'view', 'Xem cài đặt'),
  ('settings', 'edit', 'Thay đổi cài đặt')
ON CONFLICT (resource, action) DO NOTHING;

-- ═══ 3. ROLE PERMISSIONS (which permissions each role has) ═══
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE NOT NULL,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_id);

-- Assign default permissions to system roles
DO $$
DECLARE
  admin_role_id UUID;
  manager_role_id UUID;
  employee_role_id UUID;
  viewer_role_id UUID;
BEGIN
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
  SELECT id INTO manager_role_id FROM roles WHERE name = 'manager';
  SELECT id INTO employee_role_id FROM roles WHERE name = 'employee';
  SELECT id INTO viewer_role_id FROM roles WHERE name = 'viewer';
  
  -- Admin: all permissions
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT admin_role_id, id FROM permissions
  ON CONFLICT DO NOTHING;
  
  -- Manager: most permissions except system settings
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT manager_role_id, id FROM permissions 
  WHERE resource NOT IN ('settings', 'users') OR action = 'view'
  ON CONFLICT DO NOTHING;
  
  -- Employee: view + create projects/tasks
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT employee_role_id, id FROM permissions 
  WHERE action = 'view' OR (resource = 'projects' AND action IN ('create', 'edit'))
  ON CONFLICT DO NOTHING;
  
  -- Viewer: only view permissions
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT viewer_role_id, id FROM permissions 
  WHERE action = 'view'
  ON CONFLICT DO NOTHING;
END $$;

-- ═══ 4. USER ROLES (users can have multiple roles) ═══
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE NOT NULL,
  ecosystem_unit_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE, -- Scope: role applies to which unit (NULL = global)
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role_id, ecosystem_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_unit ON user_roles(ecosystem_unit_id);

-- ═══ 5. USER PERMISSIONS (override: grant specific permissions to users) ═══
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE NOT NULL,
  ecosystem_unit_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE,
  granted BOOLEAN DEFAULT true, -- true = grant, false = revoke (override role permission)
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, permission_id, ecosystem_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_perm ON user_permissions(permission_id);

-- ═══ HELPER FUNCTION: Check if user has permission ═══
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id UUID,
  p_resource VARCHAR,
  p_action VARCHAR,
  p_ecosystem_unit_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  has_perm BOOLEAN;
  perm_id UUID;
BEGIN
  -- Get permission ID
  SELECT id INTO perm_id FROM permissions 
  WHERE resource = p_resource AND action = p_action AND is_active = true;
  
  IF perm_id IS NULL THEN RETURN false; END IF;
  
  -- Check direct user permission override
  SELECT granted INTO has_perm FROM user_permissions
  WHERE user_id = p_user_id 
    AND permission_id = perm_id
    AND (ecosystem_unit_id = p_ecosystem_unit_id OR ecosystem_unit_id IS NULL OR p_ecosystem_unit_id IS NULL)
  ORDER BY ecosystem_unit_id NULLS LAST
  LIMIT 1;
  
  IF has_perm IS NOT NULL THEN RETURN has_perm; END IF;
  
  -- Check role-based permissions
  SELECT EXISTS(
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND rp.permission_id = perm_id
      AND (ur.ecosystem_unit_id = p_ecosystem_unit_id OR ur.ecosystem_unit_id IS NULL OR p_ecosystem_unit_id IS NULL)
  ) INTO has_perm;
  
  RETURN COALESCE(has_perm, false);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION user_has_permission IS 'Check if user has specific permission (considers roles + direct grants/revokes)';
