-- ════════════════════════════════════════════════════════════
-- MIGRATION 19: PERMISSION SYSTEM
-- Date: 2026-03-05
-- Description: Add RBAC + Scope-based permission system
-- ════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- TABLE 1: role_permissions (Default permissions per role)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(50) NOT NULL,
  permission VARCHAR(100) NOT NULL,
  is_allowed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, permission)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission);

COMMENT ON TABLE role_permissions IS 'Default permissions for each role';
COMMENT ON COLUMN role_permissions.role IS 'User role: admin, manager, employee, sales, designer, etc.';
COMMENT ON COLUMN role_permissions.permission IS 'Permission key: projects.view_all, tasks.create, etc.';

-- ─────────────────────────────────────────────────────────────
-- TABLE 2: user_permission_overrides (Special grants/denies)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  is_allowed BOOLEAN NOT NULL,
  unit_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE,
  reason TEXT,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, permission, COALESCE(unit_id, '00000000-0000-0000-0000-000000000000'::UUID))
);

CREATE INDEX idx_user_permission_overrides_user ON user_permission_overrides(user_id);
CREATE INDEX idx_user_permission_overrides_permission ON user_permission_overrides(permission);
CREATE INDEX idx_user_permission_overrides_unit ON user_permission_overrides(unit_id);

COMMENT ON TABLE user_permission_overrides IS 'Override permissions for specific users';
COMMENT ON COLUMN user_permission_overrides.is_allowed IS 'true=GRANT, false=DENY';
COMMENT ON COLUMN user_permission_overrides.unit_id IS 'NULL=global override, UUID=unit-specific override';
COMMENT ON COLUMN user_permission_overrides.expires_at IS 'NULL=permanent, TIMESTAMPTZ=temporary';

-- ─────────────────────────────────────────────────────────────
-- TABLE 3: permission_audit_log (Audit trail)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  unit_id UUID REFERENCES ecosystem_units(id) ON DELETE SET NULL,
  allowed BOOLEAN NOT NULL,
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_permission_audit_log_user ON permission_audit_log(user_id, created_at DESC);
CREATE INDEX idx_permission_audit_log_action ON permission_audit_log(action, created_at DESC);
CREATE INDEX idx_permission_audit_log_resource ON permission_audit_log(resource_type, resource_id);
CREATE INDEX idx_permission_audit_log_created ON permission_audit_log(created_at DESC);

COMMENT ON TABLE permission_audit_log IS 'Complete audit trail of all permission checks';
COMMENT ON COLUMN permission_audit_log.allowed IS 'true=permission granted, false=permission denied';

-- ═════════════════════════════════════════════════════════════
-- SEED DATA: Default permissions for roles
-- ═════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- ADMIN: Full access (39 permissions)
-- ─────────────────────────────────────────────────────────────
INSERT INTO role_permissions (role, permission) VALUES
-- Projects
('admin', 'projects.view_all'),
('admin', 'projects.view_unit'),
('admin', 'projects.view_assigned'),
('admin', 'projects.create'),
('admin', 'projects.edit_all'),
('admin', 'projects.edit_assigned'),
('admin', 'projects.delete'),
('admin', 'projects.approve'),

-- Tasks
('admin', 'tasks.view_all'),
('admin', 'tasks.view_unit'),
('admin', 'tasks.view_assigned'),
('admin', 'tasks.create'),
('admin', 'tasks.edit_all'),
('admin', 'tasks.edit_assigned'),
('admin', 'tasks.delete'),
('admin', 'tasks.reassign'),

-- Customers
('admin', 'customers.view_all'),
('admin', 'customers.view_unit'),
('admin', 'customers.create'),
('admin', 'customers.edit'),
('admin', 'customers.delete'),

-- Ecosystem
('admin', 'ecosystem.view'),
('admin', 'ecosystem.manage_unit'),
('admin', 'ecosystem.manage_children'),
('admin', 'ecosystem.manage_all'),
('admin', 'ecosystem.add_members'),
('admin', 'ecosystem.assign_roles'),

-- Workflows
('admin', 'workflows.view'),
('admin', 'workflows.create'),
('admin', 'workflows.edit'),
('admin', 'workflows.delete'),

-- Reports
('admin', 'reports.view_all'),
('admin', 'reports.view_unit'),
('admin', 'reports.export'),
('admin', 'reports.finance'),

-- Settings
('admin', 'settings.workflow'),
('admin', 'settings.templates'),
('admin', 'settings.users'),
('admin', 'settings.system')

ON CONFLICT (role, permission) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- MANAGER: Management access (28 permissions)
-- ─────────────────────────────────────────────────────────────
INSERT INTO role_permissions (role, permission) VALUES
-- Projects
('manager', 'projects.view_all'),
('manager', 'projects.view_unit'),
('manager', 'projects.view_assigned'),
('manager', 'projects.create'),
('manager', 'projects.edit_all'),
('manager', 'projects.edit_assigned'),
('manager', 'projects.approve'),

-- Tasks
('manager', 'tasks.view_all'),
('manager', 'tasks.view_unit'),
('manager', 'tasks.view_assigned'),
('manager', 'tasks.create'),
('manager', 'tasks.edit_all'),
('manager', 'tasks.edit_assigned'),
('manager', 'tasks.reassign'),

-- Customers
('manager', 'customers.view_all'),
('manager', 'customers.view_unit'),
('manager', 'customers.create'),
('manager', 'customers.edit'),

-- Ecosystem
('manager', 'ecosystem.view'),
('manager', 'ecosystem.manage_unit'),
('manager', 'ecosystem.manage_children'),
('manager', 'ecosystem.add_members'),

-- Workflows
('manager', 'workflows.view'),
('manager', 'workflows.create'),
('manager', 'workflows.edit'),

-- Reports
('manager', 'reports.view_all'),
('manager', 'reports.view_unit'),
('manager', 'reports.export')

ON CONFLICT (role, permission) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- EMPLOYEE: Limited access (8 permissions)
-- ─────────────────────────────────────────────────────────────
INSERT INTO role_permissions (role, permission) VALUES
-- Projects
('employee', 'projects.view_assigned'),
('employee', 'projects.edit_assigned'),

-- Tasks
('employee', 'tasks.view_assigned'),
('employee', 'tasks.edit_assigned'),

-- Customers
('employee', 'customers.view_unit'),

-- Ecosystem
('employee', 'ecosystem.view'),

-- Workflows
('employee', 'workflows.view'),

-- Reports
('employee', 'reports.view_unit')

ON CONFLICT (role, permission) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- SALES: Customer-focused (14 permissions)
-- ─────────────────────────────────────────────────────────────
INSERT INTO role_permissions (role, permission) VALUES
-- Projects
('sales', 'projects.view_all'),
('sales', 'projects.view_unit'),
('sales', 'projects.view_assigned'),
('sales', 'projects.create'),
('sales', 'projects.edit_assigned'),

-- Tasks
('sales', 'tasks.view_assigned'),
('sales', 'tasks.edit_assigned'),

-- Customers
('sales', 'customers.view_all'),
('sales', 'customers.view_unit'),
('sales', 'customers.create'),
('sales', 'customers.edit'),

-- Ecosystem
('sales', 'ecosystem.view'),

-- Workflows
('sales', 'workflows.view'),

-- Reports
('sales', 'reports.view_unit')

ON CONFLICT (role, permission) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- DESIGNER: Task-focused (7 permissions)
-- ─────────────────────────────────────────────────────────────
INSERT INTO role_permissions (role, permission) VALUES
-- Projects
('designer', 'projects.view_assigned'),
('designer', 'projects.edit_assigned'),

-- Tasks
('designer', 'tasks.view_assigned'),
('designer', 'tasks.edit_assigned'),

-- Ecosystem
('designer', 'ecosystem.view'),

-- Workflows
('designer', 'workflows.view'),

-- Reports
('designer', 'reports.view_unit')

ON CONFLICT (role, permission) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- ACCOUNTANT: Finance-focused (10 permissions)
-- ─────────────────────────────────────────────────────────────
INSERT INTO role_permissions (role, permission) VALUES
-- Projects
('accountant', 'projects.view_all'),
('accountant', 'projects.view_unit'),

-- Tasks
('accountant', 'tasks.view_assigned'),

-- Customers
('accountant', 'customers.view_all'),

-- Ecosystem
('accountant', 'ecosystem.view'),

-- Workflows
('accountant', 'workflows.view'),

-- Reports
('accountant', 'reports.view_all'),
('accountant', 'reports.view_unit'),
('accountant', 'reports.export'),
('accountant', 'reports.finance')

ON CONFLICT (role, permission) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- PRODUCTION: Production-focused (8 permissions)
-- ─────────────────────────────────────────────────────────────
INSERT INTO role_permissions (role, permission) VALUES
-- Projects
('production', 'projects.view_assigned'),
('production', 'projects.edit_assigned'),

-- Tasks
('production', 'tasks.view_assigned'),
('production', 'tasks.edit_assigned'),
('production', 'tasks.create'),

-- Ecosystem
('production', 'ecosystem.view'),

-- Workflows
('production', 'workflows.view'),

-- Reports
('production', 'reports.view_unit')

ON CONFLICT (role, permission) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- INSTALLER: Installation-focused (7 permissions)
-- ─────────────────────────────────────────────────────────────
INSERT INTO role_permissions (role, permission) VALUES
-- Projects
('installer', 'projects.view_assigned'),
('installer', 'projects.edit_assigned'),

-- Tasks
('installer', 'tasks.view_assigned'),
('installer', 'tasks.edit_assigned'),

-- Ecosystem
('installer', 'ecosystem.view'),

-- Workflows
('installer', 'workflows.view'),

-- Reports
('installer', 'reports.view_unit')

ON CONFLICT (role, permission) DO NOTHING;

-- ═════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ═════════════════════════════════════════════════════════════

-- Count permissions per role
-- SELECT role, COUNT(*) as permission_count 
-- FROM role_permissions 
-- GROUP BY role 
-- ORDER BY permission_count DESC;

-- Expected results:
-- admin: 39
-- manager: 28
-- sales: 14
-- accountant: 10
-- employee: 8
-- production: 8
-- designer: 7
-- installer: 7
