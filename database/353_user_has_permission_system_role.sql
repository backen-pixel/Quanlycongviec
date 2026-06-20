-- 353_user_has_permission_system_role.sql
-- RPC user_has_permission: cộng thêm quyền từ users.role → roles.name → role_permissions
-- (đồng bộ với tab Vai trò mẫu và users.role JWT trước khi có user_roles)

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
  SELECT id INTO perm_id FROM permissions
  WHERE resource = p_resource AND action = p_action AND is_active = true;

  IF perm_id IS NULL THEN RETURN false; END IF;

  -- Override trực tiếp (user_permissions)
  SELECT granted INTO has_perm FROM user_permissions
  WHERE user_id = p_user_id
    AND permission_id = perm_id
    AND (ecosystem_unit_id = p_ecosystem_unit_id OR ecosystem_unit_id IS NULL OR p_ecosystem_unit_id IS NULL)
  ORDER BY ecosystem_unit_id NULLS LAST
  LIMIT 1;

  IF has_perm IS NOT NULL THEN RETURN has_perm; END IF;

  -- Vai trò gán thêm (user_roles)
  SELECT EXISTS(
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND rp.permission_id = perm_id
      AND (ur.ecosystem_unit_id = p_ecosystem_unit_id OR ur.ecosystem_unit_id IS NULL OR p_ecosystem_unit_id IS NULL)
  ) INTO has_perm;

  IF has_perm THEN RETURN true; END IF;

  -- Vai trò hệ thống trên users.role (admin, sales_admin, employee…)
  SELECT EXISTS(
    SELECT 1 FROM users u
    JOIN roles r ON lower(r.name) = lower(u.role::text)
    JOIN role_permissions rp ON rp.role_id = r.id
    WHERE u.id = p_user_id
      AND rp.permission_id = perm_id
  ) INTO has_perm;

  RETURN COALESCE(has_perm, false);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION user_has_permission IS 'Check permission: override → user_roles → users.role → deny';
