const express = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { isAdminLike, canCreateStaff } = require('../helpers/adminRole');
const { enforceTenantContext } = require('../middleware/tenantGate');
const { companyInTenantContext } = require('../helpers/tenantScope');
const { responseCache, invalidateTags } = require('../middleware/responseCache');
const { buildCatalogFromPermissions } = require('../helpers/permissionCatalog');
const {
  getEffectivePermissions,
  applyUserPermissionOverrides,
} = require('../helpers/effectivePermissions');
const r = express.Router();

r.use(auth);
r.use(enforceTenantContext);

async function assertUserInRequestTenant(req, res, userId) {
  if (!req.tenantContext?.enforced || !userId) return true;
  const { data } = await supabase.from('users').select('tenant_id').eq('id', userId).maybeSingle();
  if (String(data?.tenant_id || '') !== String(req.tenantContext.tenantId)) {
    res.status(403).json({ error: 'Không có quyền truy cập người dùng này' });
    return false;
  }
  return true;
}

async function assertEcosystemUnitInRequestTenant(req, res, unitId) {
  if (!req.tenantContext?.enforced || !unitId) return true;
  const { data } = await supabase.from('ecosystem_units').select('tenant_id, company_id').eq('id', unitId).maybeSingle();
  if (!data) {
    res.status(404).json({ error: 'Không tìm thấy đơn vị hệ sinh thái' });
    return false;
  }
  if (data.tenant_id && String(data.tenant_id) === String(req.tenantContext.tenantId)) return true;
  if (data.company_id && companyInTenantContext(req, data.company_id)) return true;
  res.status(403).json({ error: 'Không có quyền truy cập đơn vị này' });
  return false;
}

function requirePermissionsAdmin(req, res, next) {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ error: 'Chỉ quản trị viên mới truy cập phân quyền' });
  }
  next();
}

/** Catalog / ghi đè quyền khi tạo-sửa NV — admin hoặc người được tạo nhân viên. */
function requirePermissionsAdminOrStaffCreator(req, res, next) {
  if (isAdminLike(req.user) || canCreateStaff(req.user)) return next();
  return res.status(403).json({ error: 'Không có quyền xem/ghi phân quyền nhân viên' });
}

r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origJson = res.json.bind(res);
  res.json = function permissionsInvalidate(body) {
    void invalidateTags(['permissions']);
    return origJson(body);
  };
  next();
});

// ═══════════════════════════════════════════════
// CATALOG — module tabs + permission labels (UI phân quyền NV)
// ═══════════════════════════════════════════════
r.get('/catalog', requirePermissionsAdminOrStaffCreator, responseCache({ ttl: 300, scope: 'global', tags: ['permissions'] }), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('id, resource, action, description')
      .eq('is_active', true)
      .order('resource', { ascending: true })
      .order('action', { ascending: true });
    if (error) throw error;
    res.json(buildCatalogFromPermissions(data || []));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════
// PERMISSIONS - Get all available permissions
// ═══════════════════════════════════════════════
r.get('/permissions', requirePermissionsAdmin, responseCache({ ttl: 300, scope: 'global', tags: ['permissions'] }), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .eq('is_active', true)
      .order('resource', { ascending: true })
      .order('action', { ascending: true });
    
    if (error) throw error;
    
    // Group by resource for easier frontend rendering
    const grouped = {};
    (data || []).forEach(p => {
      if (!grouped[p.resource]) grouped[p.resource] = [];
      grouped[p.resource].push(p);
    });
    
    res.json({ permissions: data || [], grouped });
  } catch (e) {
    console.error('Get permissions error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════
// ROLES - CRUD
// ═══════════════════════════════════════════════

// Get all roles with permission counts
r.get('/roles', requirePermissionsAdmin, responseCache({ ttl: 300, scope: 'global', tags: ['permissions'] }), async (req, res) => {
  try {
    const { data: roles, error } = await supabase
      .from('roles')
      .select(`
        *,
        role_permissions(count)
      `)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });
    
    if (error) throw error;
    res.json({ roles: roles || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Preview quyền theo tên vai trò hệ thống (users.role ↔ roles.name).
 * Dùng khi tạo/sửa NV — cho phép canCreateStaff (không cần full permissions admin).
 * Alias: staff → employee; region_admin không có template riêng → fallback sales_admin + ghi chú phạm vi khu vực.
 */
r.get('/roles/by-name/:name', async (req, res) => {
  try {
    if (!isAdminLike(req.user) && !canCreateStaff(req.user)) {
      return res.status(403).json({ error: 'Không có quyền xem mẫu quyền vai trò' });
    }
    const raw = String(req.params.name || '').trim().toLowerCase();
    if (!raw) return res.status(400).json({ error: 'Thiếu tên vai trò' });

    const ALIAS = { staff: 'employee', production: 'production_staff' };
    const lookupNames = [...new Set([raw, ALIAS[raw]].filter(Boolean))];

    let role = null;
    for (const n of lookupNames) {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, description, is_system')
        .eq('name', n)
        .maybeSingle();
      if (error) throw error;
      if (data?.id) {
        role = data;
        break;
      }
    }

    /** Admin khu vực: quyền module giống sales_admin, nhưng dữ liệu CRM bị khóa theo khu vực. */
    let scopeNote = null;
    if (!role && raw === 'region_admin') {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, description, is_system')
        .eq('name', 'sales_admin')
        .maybeSingle();
      if (error) throw error;
      role = data || null;
      scopeNote = 'Admin khu vực dùng quyền module tương tự Sales Admin, nhưng chỉ thấy lead/deal thuộc khu vực CRM được gán — không toàn công ty.';
    }

    if (!role?.id) {
      return res.json({
        role: null,
        matched_name: raw,
        permissions: [],
        scope_note: scopeNote,
        missing_template: true,
      });
    }

    const { data: rolePerms, error: rpErr } = await supabase
      .from('role_permissions')
      .select('permission_id, permissions(id, resource, action, description)')
      .eq('role_id', role.id);
    if (rpErr) throw rpErr;

    const permissions = (rolePerms || [])
      .map((rp) => rp.permissions)
      .filter(Boolean)
      .sort((a, b) => String(a.resource).localeCompare(String(b.resource))
        || String(a.action).localeCompare(String(b.action)));

    if (raw === 'region_admin') {
      scopeNote = scopeNote
        || 'Admin khu vực: quyền module như Sales Admin, phạm vi dữ liệu CRM chỉ các khu vực được gán.';
    }

    res.json({
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        is_system: role.is_system,
        requested_name: raw,
      },
      matched_name: role.name,
      permissions,
      scope_note: scopeNote,
      missing_template: false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get role with full permissions
r.get('/roles/:id', requirePermissionsAdmin, async (req, res) => {
  try {
    const { data: role, error: roleErr } = await supabase
      .from('roles')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (roleErr) throw roleErr;
    
    // Get assigned permissions
    const { data: rolePerms } = await supabase
      .from('role_permissions')
      .select('permission_id, permissions(*)')
      .eq('role_id', req.params.id);
    
    role.permissions = (rolePerms || []).map(rp => rp.permissions);
    
    res.json({ role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create role
r.post('/roles', requirePermissionsAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Role name required' });
    
    const { data, error } = await supabase
      .from('roles')
      .insert({ name: name.trim(), description: description?.trim() })
      .select()
      .single();
    
    if (error) throw error;
    res.json({ role: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update role
r.put('/roles/:id', requirePermissionsAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    const { data, error } = await supabase
      .from('roles')
      .update({ name, description, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('is_system', false) // Cannot edit system roles
      .select()
      .single();
    
    if (error) throw error;
    res.json({ role: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete role
r.delete('/roles/:id', requirePermissionsAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', req.params.id)
      .eq('is_system', false); // Cannot delete system roles
    
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════
// ROLE PERMISSIONS - Toggle permissions for a role
// ═══════════════════════════════════════════════

// Get all permissions for a specific role
r.get('/roles/:roleId/permissions', requirePermissionsAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select(`
        permission_id,
        permissions (
          id,
          resource,
          action,
          description
        )
      `)
      .eq('role_id', req.params.roleId);
    
    if (error) throw error;
    
    // Flatten structure
    const permissions = (data || []).map(rp => ({
      id: rp.permission_id,
      ...rp.permissions
    }));
    
    res.json({ permissions });
  } catch (e) {
    console.error('Get role permissions error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Set permissions for a role (replace all)
r.put('/roles/:roleId/permissions', requirePermissionsAdmin, async (req, res) => {
  try {
    const { permission_ids } = req.body; // Array of permission IDs
    
    // Delete existing
    await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', req.params.roleId);
    
    // Insert new
    if (permission_ids && permission_ids.length > 0) {
      const inserts = permission_ids.map(pid => ({
        role_id: req.params.roleId,
        permission_id: pid,
      }));
      
      const { error } = await supabase
        .from('role_permissions')
        .insert(inserts);
      
      if (error) throw error;
    }
    
    res.json({ ok: true, count: permission_ids?.length || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════
// USER ROLES - Assign roles to users
// ═══════════════════════════════════════════════

// Effective permissions for a user (role + overrides)
r.get('/users/:userId/effective', requirePermissionsAdminOrStaffCreator, async (req, res) => {
  try {
    if (!(await assertUserInRequestTenant(req, res, req.params.userId))) return;
    const ecosystemUnitId = req.query.ecosystem_unit_id || null;
    const data = await getEffectivePermissions(req.params.userId, ecosystemUnitId);
    res.json(data);
  } catch (e) {
    console.error('Get effective permissions error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Bulk effective permissions for multiple users
r.post('/users/effective/bulk', requirePermissionsAdmin, async (req, res) => {
  try {
    const { user_ids: userIds, ecosystem_unit_id: ecosystemUnitId } = req.body;
    if (!Array.isArray(userIds) || !userIds.length) {
      return res.status(400).json({ error: 'Thiếu mảng user_ids' });
    }
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    for (const userId of uniqueIds) {
      if (!(await assertUserInRequestTenant(req, res, userId))) return;
    }
    const entries = await Promise.all(
      uniqueIds.map(async (userId) => {
        const data = await getEffectivePermissions(userId, ecosystemUnitId || null);
        return [userId, data];
      }),
    );
    res.json({ users: Object.fromEntries(entries) });
  } catch (e) {
    console.error('Bulk effective permissions error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Bulk save overrides for many users (same changes applied to each)
r.put('/users/bulk-overrides', requirePermissionsAdmin, async (req, res) => {
  try {
    const { user_ids: userIds, ecosystem_unit_id: ecosystemUnitId, changes } = req.body;
    if (!Array.isArray(userIds) || !userIds.length) {
      return res.status(400).json({ error: 'Thiếu mảng user_ids' });
    }
    if (!Array.isArray(changes)) {
      return res.status(400).json({ error: 'Thiếu mảng changes' });
    }
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const perUser = [];
    let totalUpserted = 0;
    let totalCleared = 0;
    const errors = [];

    for (const userId of uniqueIds) {
      if (!(await assertUserInRequestTenant(req, res, userId))) return;
      const results = await applyUserPermissionOverrides(
        userId,
        ecosystemUnitId || null,
        changes,
        req.user?.userId || null,
      );
      totalUpserted += results.upserted;
      totalCleared += results.cleared;
      if (results.errors.length) {
        errors.push({ user_id: userId, errors: results.errors });
      }
      perUser.push({ user_id: userId, ...results });
    }

    if (errors.length) {
      return res.status(207).json({
        ok: false,
        users_processed: uniqueIds.length,
        upserted: totalUpserted,
        cleared: totalCleared,
        per_user: perUser,
        errors,
      });
    }

    res.json({
      ok: true,
      users_processed: uniqueIds.length,
      upserted: totalUpserted,
      cleared: totalCleared,
      per_user: perUser,
    });
  } catch (e) {
    console.error('Bulk save overrides error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Bulk save user permission overrides (single user)
r.put('/users/:userId/overrides', requirePermissionsAdminOrStaffCreator, async (req, res) => {
  try {
    if (!(await assertUserInRequestTenant(req, res, req.params.userId))) return;
    const { ecosystem_unit_id: ecosystemUnitId, changes } = req.body;
    if (!Array.isArray(changes)) {
      return res.status(400).json({ error: 'Thiếu mảng changes' });
    }
    const results = await applyUserPermissionOverrides(
      req.params.userId,
      ecosystemUnitId || null,
      changes,
      req.user?.userId || null,
    );
    if (results.errors.length) {
      return res.status(207).json({ ok: false, ...results });
    }
    const effective = await getEffectivePermissions(req.params.userId, ecosystemUnitId || null);
    res.json({ ok: true, ...results, effective });
  } catch (e) {
    console.error('Save overrides error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get user's roles
r.get('/users/:userId/roles', requirePermissionsAdmin, async (req, res) => {
  try {
    if (!(await assertUserInRequestTenant(req, res, req.params.userId))) return;
    const { data, error } = await supabase
      .from('user_roles')
      .select(`
        *,
        role:roles(*),
        ecosystem_unit:ecosystem_units(id, name),
        granted_by_user:users!user_roles_granted_by_fkey(id, full_name)
      `)
      .eq('user_id', req.params.userId);
    
    if (error) throw error;
    res.json({ user_roles: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function findExistingUserRole(userId, roleId, ecosystemUnitId) {
  const unitId = ecosystemUnitId || null;
  let q = supabase
    .from('user_roles')
    .select(`
      *,
      role:roles(*),
      ecosystem_unit:ecosystem_units(id, name),
      granted_by_user:users!user_roles_granted_by_fkey(id, full_name)
    `)
    .eq('user_id', userId)
    .eq('role_id', roleId);
  q = unitId ? q.eq('ecosystem_unit_id', unitId) : q.is('ecosystem_unit_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data || null;
}

// Assign role to user
r.post('/users/:userId/roles', requirePermissionsAdmin, async (req, res) => {
  try {
    if (!(await assertUserInRequestTenant(req, res, req.params.userId))) return;
    const { role_id, ecosystem_unit_id, granted_by } = req.body;
    if (!role_id) return res.status(400).json({ error: 'Thiếu role_id' });

    const unitId = ecosystem_unit_id || null;
    const existing = await findExistingUserRole(req.params.userId, role_id, unitId);
    if (existing) {
      return res.json({
        user_role: existing,
        already_exists: true,
        message: 'Nhân viên đã có vai trò này ở phạm vi đã chọn.',
      });
    }

    const { data, error } = await supabase
      .from('user_roles')
      .insert({
        user_id: req.params.userId,
        role_id,
        ecosystem_unit_id: unitId,
        granted_by: granted_by || null,
      })
      .select(`
        *,
        role:roles(*),
        ecosystem_unit:ecosystem_units(id, name),
        granted_by_user:users!user_roles_granted_by_fkey(id, full_name)
      `)
      .single();

    if (error) {
      if (error.code === '23505') {
        const dup = await findExistingUserRole(req.params.userId, role_id, unitId);
        if (dup) {
          return res.json({
            user_role: dup,
            already_exists: true,
            message: 'Nhân viên đã có vai trò này ở phạm vi đã chọn.',
          });
        }
      }
      throw error;
    }
    res.json({ user_role: data, already_exists: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove role from user
r.delete('/user-roles/:id', requirePermissionsAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════
// CHECK PERMISSION - Utility endpoint
// ═══════════════════════════════════════════════

r.post('/check-permission', requirePermissionsAdmin, async (req, res) => {
  try {
    const { user_id, resource, action, ecosystem_unit_id } = req.body;
    
    const { data, error } = await supabase.rpc('user_has_permission', {
      p_user_id: user_id,
      p_resource: resource,
      p_action: action,
      p_ecosystem_unit_id: ecosystem_unit_id || null,
    });
    
    if (error) throw error;
    res.json({ has_permission: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;

// ═══════════════════════════════════════════════
// ECOSYSTEM UNIT PERMISSIONS - Custom permissions per unit
// ═══════════════════════════════════════════════

// Get permissions for an ecosystem unit (all users in that unit)
r.get('/ecosystem-units/:unitId/permissions', requirePermissionsAdmin, async (req, res) => {
  try {
    if (!(await assertEcosystemUnitInRequestTenant(req, res, req.params.unitId))) return;
    const { data, error } = await supabase
      .from('user_permissions')
      .select(`
        *,
        user:users!user_permissions_user_id_fkey(id, full_name, email),
        permission:permissions!user_permissions_permission_id_fkey(*)
      `)
      .eq('ecosystem_unit_id', req.params.unitId);
    
    if (error) throw error;
    res.json({ permissions: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Grant/revoke custom permission for user in specific unit
r.post('/users/custom-permission', requirePermissionsAdmin, async (req, res) => {
  try {
    const { user_id, permission_id, ecosystem_unit_id, granted, position_role } = req.body;
    if (!(await assertUserInRequestTenant(req, res, user_id))) return;
    if (!(await assertEcosystemUnitInRequestTenant(req, res, ecosystem_unit_id))) return;
    
    // Upsert: if exists update, else insert
    const { data, error } = await supabase
      .from('user_permissions')
      .upsert({
        user_id,
        permission_id,
        ecosystem_unit_id,
        granted: granted !== undefined ? granted : true,
        position_role: position_role || null, // NEW: Save position role (director/manager/employee...)
        granted_by: req.user?.userId || null,
        granted_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,permission_id,ecosystem_unit_id'
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json({ user_permission: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
