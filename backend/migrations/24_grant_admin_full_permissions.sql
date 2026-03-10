-- Grant full permissions to admin@tubep.vn
-- This overrides role-based permissions and grants ALL permissions

-- First, get the user ID
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- Get admin user ID
  SELECT id INTO admin_user_id FROM users WHERE email = 'admin@tubep.vn';
  
  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'User admin@tubep.vn not found';
  END IF;

  -- Grant all project permissions
  INSERT INTO user_permission_overrides (user_id, permission, is_allowed, reason, granted_at)
  VALUES 
    (admin_user_id, 'projects.view_all', true, 'Admin full access', now()),
    (admin_user_id, 'projects.create', true, 'Admin full access', now()),
    (admin_user_id, 'projects.edit_all', true, 'Admin full access', now()),
    (admin_user_id, 'projects.delete', true, 'Admin full access', now()),
    (admin_user_id, 'projects.approve', true, 'Admin full access', now()),
    
    -- Tasks
    (admin_user_id, 'tasks.view_all', true, 'Admin full access', now()),
    (admin_user_id, 'tasks.create', true, 'Admin full access', now()),
    (admin_user_id, 'tasks.edit_all', true, 'Admin full access', now()),
    (admin_user_id, 'tasks.delete', true, 'Admin full access', now()),
    (admin_user_id, 'tasks.reassign', true, 'Admin full access', now()),
    
    -- Customers
    (admin_user_id, 'customers.view_all', true, 'Admin full access', now()),
    (admin_user_id, 'customers.create', true, 'Admin full access', now()),
    (admin_user_id, 'customers.edit', true, 'Admin full access', now()),
    (admin_user_id, 'customers.delete', true, 'Admin full access', now()),
    
    -- Ecosystem
    (admin_user_id, 'ecosystem.view', true, 'Admin full access', now()),
    (admin_user_id, 'ecosystem.manage_all', true, 'Admin full access', now()),
    (admin_user_id, 'ecosystem.manage_unit', true, 'Admin full access', now()),
    (admin_user_id, 'ecosystem.manage_children', true, 'Admin full access', now()),
    (admin_user_id, 'ecosystem.add_members', true, 'Admin full access', now()),
    (admin_user_id, 'ecosystem.assign_roles', true, 'Admin full access', now()),
    
    -- Workflows
    (admin_user_id, 'workflows.view', true, 'Admin full access', now()),
    (admin_user_id, 'workflows.create', true, 'Admin full access', now()),
    (admin_user_id, 'workflows.edit', true, 'Admin full access', now()),
    (admin_user_id, 'workflows.delete', true, 'Admin full access', now()),
    
    -- Reports
    (admin_user_id, 'reports.view_all', true, 'Admin full access', now()),
    (admin_user_id, 'reports.export', true, 'Admin full access', now()),
    (admin_user_id, 'reports.finance', true, 'Admin full access', now()),
    
    -- Settings
    (admin_user_id, 'settings.workflow', true, 'Admin full access', now()),
    (admin_user_id, 'settings.templates', true, 'Admin full access', now()),
    (admin_user_id, 'settings.users', true, 'Admin full access', now()),
    (admin_user_id, 'settings.system', true, 'Admin full access', now())
  ON CONFLICT (user_id, permission, COALESCE(unit_id, '00000000-0000-0000-0000-000000000000'::UUID))
  DO UPDATE SET 
    is_allowed = true,
    reason = 'Admin full access - updated',
    granted_at = now();

  RAISE NOTICE 'Granted % permissions to admin@tubep.vn (user_id: %)', 33, admin_user_id;
END $$;

-- Verify grants
SELECT 
  u.email,
  upo.permission,
  upo.is_allowed,
  upo.reason,
  upo.granted_at
FROM user_permission_overrides upo
JOIN users u ON u.id = upo.user_id
WHERE u.email = 'admin@tubep.vn'
ORDER BY upo.permission;
