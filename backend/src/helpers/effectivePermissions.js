const { supabase } = require('../config/supabase');

/**
 * Chọn override phù hợp — khớp logic RPC user_has_permission.
 */
function pickUserOverride(overrides, permissionId, ecosystemUnitId) {
  const rows = (overrides || []).filter((o) => o.permission_id === permissionId);
  if (!rows.length) return null;

  const applicable = rows.filter((o) => {
    if (ecosystemUnitId == null) return true;
    return o.ecosystem_unit_id == null || o.ecosystem_unit_id === ecosystemUnitId;
  });
  if (!applicable.length) return null;

  applicable.sort((a, b) => {
    if (a.ecosystem_unit_id == null && b.ecosystem_unit_id != null) return 1;
    if (a.ecosystem_unit_id != null && b.ecosystem_unit_id == null) return -1;
    return 0;
  });
  return applicable[0];
}

function roleAppliesToUnit(roleUnitId, ecosystemUnitId) {
  if (ecosystemUnitId == null) return true;
  return roleUnitId == null || roleUnitId === ecosystemUnitId;
}

/**
 * Vai trò JWT trên bảng users (admin, sales_admin, employee…) → roles.name → role_permissions.
 * Đồng bộ với tab "Vai trò mẫu" và phân quyền cũ trước khi có user_roles.
 */
async function resolveSystemRolePermissionIds(userId) {
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) throw userErr;

  const systemRoleName = userRow?.role != null ? String(userRow.role).trim().toLowerCase() : null;
  if (!systemRoleName) {
    return { systemRoleName: null, systemRoleId: null, permissionIds: new Set() };
  }

  const { data: sysRole, error: roleErr } = await supabase
    .from('roles')
    .select('id, name')
    .eq('name', systemRoleName)
    .maybeSingle();
  if (roleErr) throw roleErr;
  if (!sysRole?.id) {
    return { systemRoleName, systemRoleId: null, permissionIds: new Set() };
  }

  const { data: rpRows, error: rpErr } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', sysRole.id);
  if (rpErr) throw rpErr;

  return {
    systemRoleName,
    systemRoleId: sysRole.id,
    permissionIds: new Set((rpRows || []).map((r) => r.permission_id).filter(Boolean)),
  };
}

/**
 * @returns {Promise<{ permissions: Array, role_permission_ids: string[], user_roles: Array, system_role: string|null }>}
 */
async function getEffectivePermissions(userId, ecosystemUnitId = null) {
  const unitId = ecosystemUnitId || null;

  const [
    { data: allPerms, error: permErr },
    { data: overrides, error: ovErr },
    { data: userRoles, error: urErr },
    systemRoleInfo,
  ] = await Promise.all([
    supabase.from('permissions').select('id, resource, action, description').eq('is_active', true),
    supabase.from('user_permissions').select('permission_id, granted, ecosystem_unit_id').eq('user_id', userId),
    supabase
      .from('user_roles')
      .select('id, role_id, ecosystem_unit_id, role:roles(id, name, is_system)')
      .eq('user_id', userId),
    resolveSystemRolePermissionIds(userId),
  ]);

  if (permErr) throw permErr;
  if (ovErr) throw ovErr;
  if (urErr) throw urErr;

  const assignedRoleIds = [...new Set((userRoles || []).map((ur) => ur.role_id).filter(Boolean))];
  const allRoleIds = [...new Set([
    ...assignedRoleIds,
    ...(systemRoleInfo.systemRoleId ? [systemRoleInfo.systemRoleId] : []),
  ])];

  let rolePermRows = [];
  if (allRoleIds.length) {
    const { data: rpData, error: rpErr } = await supabase
      .from('role_permissions')
      .select('role_id, permission_id')
      .in('role_id', allRoleIds);
    if (rpErr) throw rpErr;
    rolePermRows = rpData || [];
  }

  const permsByRoleId = {};
  for (const rp of rolePermRows) {
    if (!permsByRoleId[rp.role_id]) permsByRoleId[rp.role_id] = [];
    permsByRoleId[rp.role_id].push(rp.permission_id);
  }

  const assignedRolePermIds = new Set();
  for (const ur of userRoles || []) {
    if (!roleAppliesToUnit(ur.ecosystem_unit_id, unitId)) continue;
    for (const pid of permsByRoleId[ur.role_id] || []) {
      assignedRolePermIds.add(pid);
    }
  }

  const systemRolePermIds = systemRoleInfo.permissionIds;
  const rolePermissionIds = new Set([...assignedRolePermIds, ...systemRolePermIds]);

  const permissions = (allPerms || []).map((perm) => {
    const override = pickUserOverride(overrides, perm.id, unitId);
    const fromAssigned = assignedRolePermIds.has(perm.id);
    const fromSystem = systemRolePermIds.has(perm.id);
    const fromRole = fromAssigned || fromSystem;

    let effective = false;
    let source = 'none';

    if (override != null) {
      effective = override.granted === true;
      source = effective ? 'override_grant' : 'override_deny';
    } else if (fromAssigned) {
      effective = true;
      source = 'assigned_role';
    } else if (fromSystem) {
      effective = true;
      source = 'system_role';
    }

    return {
      permission_id: perm.id,
      resource: perm.resource,
      action: perm.action,
      effective,
      source,
      from_role: fromRole,
      from_system_role: fromSystem,
      from_assigned_role: fromAssigned,
      override: override != null ? override.granted : null,
    };
  });

  return {
    permissions,
    role_permission_ids: [...rolePermissionIds],
    system_role: systemRoleInfo.systemRoleName,
    system_role_id: systemRoleInfo.systemRoleId,
    user_roles: (userRoles || []).map((ur) => ({
      id: ur.id,
      role_id: ur.role_id,
      role_name: ur.role?.name,
      ecosystem_unit_id: ur.ecosystem_unit_id,
    })),
    ecosystem_unit_id: unitId,
  };
}

/**
 * Bulk cập nhật override — granted=true/false hoặc clear (xóa override, kế thừa role).
 */
async function applyUserPermissionOverrides(userId, ecosystemUnitId, changes, grantedBy = null) {
  const unitId = ecosystemUnitId || null;
  const results = { upserted: 0, cleared: 0, errors: [] };

  for (const change of changes || []) {
    const { permission_id: permissionId, granted, clear } = change;
    if (!permissionId) continue;

    try {
      if (clear === true || granted === null || granted === undefined) {
        let q = supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('permission_id', permissionId);
        q = unitId ? q.eq('ecosystem_unit_id', unitId) : q.is('ecosystem_unit_id', null);
        const { error } = await q;
        if (error) throw error;
        results.cleared += 1;
      } else {
        const { error } = await supabase
          .from('user_permissions')
          .upsert(
            {
              user_id: userId,
              permission_id: permissionId,
              ecosystem_unit_id: unitId,
              granted: granted === true,
              granted_by: grantedBy,
              granted_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,permission_id,ecosystem_unit_id' },
          );
        if (error) throw error;
        results.upserted += 1;
      }
    } catch (e) {
      results.errors.push({ permission_id: permissionId, error: e.message });
    }
  }

  return results;
}

module.exports = {
  getEffectivePermissions,
  applyUserPermissionOverrides,
  pickUserOverride,
};
