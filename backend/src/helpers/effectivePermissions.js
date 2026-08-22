const { supabase } = require('../config/supabase');
const {
  getUserModuleRolesMap,
  resolvePermissionIdsForRoleNames,
} = require('./userModuleRoles');
const {
  isPlatformAdmin,
  isAdminLike,
  isSystemAdmin,
  isTenantAdmin,
  isLegacySystemAdmin,
  isCompanyScopedAdmin,
  isProductionAdmin,
  isProductionStaff,
  isLogisticsAdmin,
} = require('./adminRole');

/** Membership dự án — chỉ quan sát, không đổi quyền. */
async function loadProjectScope(userId, { sampleLimit = 8 } = {}) {
  const empty = {
    production_staff_count: 0,
    lead_member_count: 0,
    production_projects: [],
    lead_memberships: [],
    sample_limit: sampleLimit,
  };
  if (!userId) return empty;
  try {
    const [staffCountRes, memberCountRes, staffRowsRes, memberRowsRes] = await Promise.all([
      supabase
        .from('project_production_staff')
        .select('project_id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('lead_members')
        .select('lead_id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('project_production_staff')
        .select('project_id, is_primary, order_index, project:projects(id, name, code)')
        .eq('user_id', userId)
        .order('order_index', { ascending: true })
        .limit(sampleLimit),
      supabase
        .from('lead_members')
        .select('lead_id, role, lead:crm_leads(id, title, code, type)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(sampleLimit),
    ]);

    const productionProjects = (staffRowsRes.data || []).map((row) => ({
      project_id: row.project_id,
      name: row.project?.name || null,
      code: row.project?.code || null,
      is_primary: row.is_primary === true,
    }));

    const leadMemberships = (memberRowsRes.data || []).map((row) => ({
      lead_id: row.lead_id,
      role: row.role || 'member',
      title: row.lead?.title || null,
      code: row.lead?.code || null,
      type: row.lead?.type || null,
    }));

    return {
      production_staff_count: staffCountRes.count || 0,
      lead_member_count: memberCountRes.count || 0,
      production_projects: productionProjects,
      lead_memberships: leadMemberships,
      sample_limit: sampleLimit,
    };
  } catch {
    return empty;
  }
}

/**
 * Tóm tắt nguồn truy cập (read-only) — không ảnh hưởng enforcement.
 * Giúp UI giải thích bypass middleware / membership ngoài catalog.
 */
async function buildAccessSummary(userId, {
  systemRoleName = null,
  moduleRolesMap = {},
  userRoles = [],
} = {}) {
  const { data: userRow, error } = await supabase
    .from('users')
    .select('id, role, company_id, tenant_id, email')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;

  const user = userRow || { role: systemRoleName };
  const role = user.role != null ? String(user.role).trim().toLowerCase() : null;
  const projectScope = await loadProjectScope(userId);

  const fullAdminBypass = isPlatformAdmin(user) || isAdminLike(user);
  const workshopBypass =
    isProductionStaff(user) || isProductionAdmin(user) || isLogisticsAdmin(user);

  const notes = [];
  if (fullAdminBypass) {
    notes.push('Middleware cho phép hầu hết API (admin-like / platform_admin) — checkbox catalog có thể thưa.');
  }
  if (workshopBypass && !fullAdminBypass) {
    notes.push('Middleware mở resource xưởng (projects/workflows/…) theo role SX/VC — ngoài catalog.');
  }
  if (projectScope.production_staff_count > 0 || projectScope.lead_member_count > 0) {
    notes.push('Đã gắn membership dự án/deal — phạm vi dữ liệu, không hiện trên toggle quyền.');
  }

  return {
    user_id: userId,
    system_role: role || systemRoleName || null,
    company_id: user.company_id ?? null,
    tenant_id: user.tenant_id ?? null,
    email: user.email || null,
    flags: {
      is_platform_admin: isPlatformAdmin(user),
      is_admin_like: isAdminLike(user),
      is_system_admin: isSystemAdmin(user),
      is_tenant_admin: isTenantAdmin(user),
      is_legacy_system_admin: isLegacySystemAdmin(user),
      is_company_scoped_admin: isCompanyScopedAdmin(user),
      is_production_admin: isProductionAdmin(user),
      is_production_staff: isProductionStaff(user),
      is_logistics_admin: isLogisticsAdmin(user),
    },
    middleware_bypass: {
      full_admin: fullAdminBypass,
      workshop_resources: workshopBypass,
    },
    module_roles: moduleRolesMap || {},
    assigned_roles: (userRoles || []).map((ur) => ({
      id: ur.id,
      role_id: ur.role_id,
      role_name: ur.role?.name || ur.role_name || null,
      ecosystem_unit_id: ur.ecosystem_unit_id ?? null,
    })),
    project_scope: projectScope,
    catalog_precedence: ['override', 'assigned_role', 'module_role', 'system_role'],
    notes,
  };
}

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
 * @returns {Promise<{ permissions: Array, role_permission_ids: string[], user_roles: Array, system_role: string|null, module_roles: Record<string,string>, access_summary: object }>}
 */
async function getEffectivePermissions(userId, ecosystemUnitId = null) {
  const unitId = ecosystemUnitId || null;

  const [
    { data: allPerms, error: permErr },
    { data: overrides, error: ovErr },
    { data: userRoles, error: urErr },
    systemRoleInfo,
    moduleRolesMap,
  ] = await Promise.all([
    supabase.from('permissions').select('id, resource, action, description').eq('is_active', true),
    supabase.from('user_permissions').select('permission_id, granted, ecosystem_unit_id').eq('user_id', userId),
    supabase
      .from('user_roles')
      .select('id, role_id, ecosystem_unit_id, role:roles(id, name, is_system)')
      .eq('user_id', userId),
    resolveSystemRolePermissionIds(userId),
    getUserModuleRolesMap(userId).catch(() => ({})),
  ]);

  if (permErr) throw permErr;
  if (ovErr) throw ovErr;
  if (urErr) throw urErr;

  const moduleRoleNames = Object.values(moduleRolesMap || {});
  const moduleRoleInfo = await resolvePermissionIdsForRoleNames(moduleRoleNames);

  const assignedRoleIds = [...new Set((userRoles || []).map((ur) => ur.role_id).filter(Boolean))];
  const allRoleIds = [...new Set([
    ...assignedRoleIds,
    ...(systemRoleInfo.systemRoleId ? [systemRoleInfo.systemRoleId] : []),
    ...moduleRoleInfo.roleIds,
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

  const moduleRolePermIds = moduleRoleInfo.permissionIds;
  const systemRolePermIds = systemRoleInfo.permissionIds;
  const rolePermissionIds = new Set([
    ...assignedRolePermIds,
    ...moduleRolePermIds,
    ...systemRolePermIds,
  ]);

  const permissions = (allPerms || []).map((perm) => {
    const override = pickUserOverride(overrides, perm.id, unitId);
    const fromAssigned = assignedRolePermIds.has(perm.id);
    const fromModule = moduleRolePermIds.has(perm.id);
    const fromSystem = systemRolePermIds.has(perm.id);
    const fromRole = fromAssigned || fromModule || fromSystem;

    let effective = false;
    let source = 'none';

    if (override != null) {
      effective = override.granted === true;
      source = effective ? 'override_grant' : 'override_deny';
    } else if (fromAssigned) {
      effective = true;
      source = 'assigned_role';
    } else if (fromModule) {
      effective = true;
      source = 'module_role';
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
      from_module_role: fromModule,
      from_assigned_role: fromAssigned,
      override: override != null ? override.granted : null,
    };
  });

  const accessSummary = await buildAccessSummary(userId, {
    systemRoleName: systemRoleInfo.systemRoleName,
    moduleRolesMap: moduleRolesMap || {},
    userRoles: userRoles || [],
  });

  return {
    permissions,
    role_permission_ids: [...rolePermissionIds],
    system_role: systemRoleInfo.systemRoleName,
    system_role_id: systemRoleInfo.systemRoleId,
    module_roles: moduleRolesMap || {},
    user_roles: (userRoles || []).map((ur) => ({
      id: ur.id,
      role_id: ur.role_id,
      role_name: ur.role?.name,
      ecosystem_unit_id: ur.ecosystem_unit_id,
    })),
    ecosystem_unit_id: unitId,
    access_summary: accessSummary,
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
  buildAccessSummary,
};
