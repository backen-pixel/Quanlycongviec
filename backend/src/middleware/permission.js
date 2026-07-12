// ════════════════════════════════════════════════════════════
// PERMISSION MIDDLEWARE
// Date: 2026-03-05
// Description: RBAC + Scope-based permission system
// ════════════════════════════════════════════════════════════

const { supabase } = require('../config/supabase');

// Import existing helpers from ecosystem.js
const { getUserAccessibleUnits, canManageUnit } = require('../routes/ecosystem');

// ─────────────────────────────────────────────────────────────
// HELPER: Get role permissions
// ─────────────────────────────────────────────────────────────
async function getRolePermissions(role) {
  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role', role)
      .eq('is_allowed', true);
    
    if (error) {
      console.error('Error fetching role permissions:', error);
      return [];
    }
    
    return (data || []).map(r => r.permission);
  } catch (e) {
    console.error('Exception in getRolePermissions:', e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Get user override
// ─────────────────────────────────────────────────────────────
async function getUserOverride(userId, permission, unitId = null) {
  try {
    const query = supabase
      .from('user_permission_overrides')
      .select('*')
      .eq('user_id', userId)
      .eq('permission', permission);
    
    if (unitId) {
      query.eq('unit_id', unitId);
    } else {
      query.is('unit_id', null);
    }
    
    // Check expiration
    query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
    
    const { data, error } = await query.single();
    
    if (error && error.code !== 'PGRST116') { // Ignore "not found" error
      console.error('Error fetching user override:', error);
      return null;
    }
    
    return data;
  } catch (e) {
    console.error('Exception in getUserOverride:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Get unit role permissions
// ─────────────────────────────────────────────────────────────
function getUnitRolePermissions(unitRole) {
  const perms = {
    director: [
      'projects.view_unit', 'projects.create', 'projects.edit_all', 'projects.approve',
      'tasks.view_unit', 'tasks.create', 'tasks.edit_all', 'tasks.reassign',
      'customers.view_unit', 'customers.create', 'customers.edit',
      'ecosystem.manage_unit', 'ecosystem.manage_children', 'ecosystem.add_members',
      'reports.view_unit', 'reports.export',
    ],
    manager: [
      'projects.view_unit', 'projects.create', 'projects.edit_assigned',
      'tasks.view_unit', 'tasks.create', 'tasks.edit_assigned', 'tasks.reassign',
      'customers.view_unit', 'customers.create',
      'ecosystem.manage_unit', 'ecosystem.add_members',
      'reports.view_unit',
    ],
    member: [
      'projects.view_unit', 'projects.view_assigned', 'projects.edit_assigned',
      'tasks.view_assigned', 'tasks.edit_assigned',
      'customers.view_unit',
    ],
    viewer: [
      'projects.view_unit', 'projects.view_assigned',
      'tasks.view_assigned',
    ],
  };
  return perms[unitRole] || [];
}

// ─────────────────────────────────────────────────────────────
// HELPER: Get unit membership
// ─────────────────────────────────────────────────────────────
async function getUnitMembership(userId, unitId) {
  try {
    const { data, error } = await supabase
      .from('ecosystem_unit_members')
      .select('unit_role, can_manage_children')
      .eq('user_id', userId)
      .eq('unit_id', unitId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching unit membership:', error);
      return null;
    }
    
    return data;
  } catch (e) {
    console.error('Exception in getUnitMembership:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// CORE: Check if user has permission
// ─────────────────────────────────────────────────────────────
async function hasPermission(userId, userRole, permission, resourceUnitId = null) {
  try {
    // Step 1: Check role permissions
    const rolePerms = await getRolePermissions(userRole);
    if (rolePerms.includes(permission)) {
      return true;
    }
    
    // Step 2: Check DENY override (highest priority)
    const denyOverride = await getUserOverride(userId, permission, null);
    if (denyOverride && !denyOverride.is_allowed) {
      return false;
    }
    
    // Step 3: Check unit-based permissions
    if (resourceUnitId) {
      // Get accessible units
      const accessibleUnits = await getUserAccessibleUnits(userId, userRole);
      
      // Check if user has access to this unit
      if (!accessibleUnits.includes(resourceUnitId)) {
        return false;
      }
      
      // Check unit membership role
      const membership = await getUnitMembership(userId, resourceUnitId);
      if (membership) {
        const unitPerms = getUnitRolePermissions(membership.unit_role);
        if (unitPerms.includes(permission)) {
          return true;
        }
      }
    }
    
    // Step 4: Check ALLOW override (unit-specific or global)
    const allowOverride = await getUserOverride(userId, permission, resourceUnitId);
    if (allowOverride && allowOverride.is_allowed) {
      return true;
    }
    
    // Step 5: Default deny
    return false;
  } catch (e) {
    console.error('Exception in hasPermission:', e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Log permission check
// ─────────────────────────────────────────────────────────────
async function logPermissionCheck(req, permission, resourceType, resourceId, allowed, reason = null) {
  try {
    await supabase.from('permission_audit_log').insert({
      user_id: req.user?.userId || null,
      action: permission,
      resource_type: resourceType,
      resource_id: resourceId,
      allowed,
      reason,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent'] || null,
    });
  } catch (e) {
    // Don't fail the request if logging fails
    console.error('Error logging permission check:', e);
  }
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE: Require permission
// ─────────────────────────────────────────────────────────────
function requirePermission(permission, getResourceUnitId = null) {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;
      
      // Get resource unit ID if provided
      let resourceUnitId = null;
      if (typeof getResourceUnitId === 'function') {
        try {
          resourceUnitId = await getResourceUnitId(req);
        } catch (e) {
          console.error('Error getting resource unit ID:', e);
        }
      }
      
      // Check permission
      const allowed = await hasPermission(userId, userRole, permission, resourceUnitId);
      
      // Log audit
      const resourceType = req.baseUrl.split('/').pop(); // 'projects', 'tasks', etc.
      const resourceId = req.params.id || null;
      await logPermissionCheck(req, permission, resourceType, resourceId, allowed, allowed ? null : 'Permission denied');
      
      if (!allowed) {
        return res.status(403).json({ 
          error: 'Không có quyền thực hiện hành động này',
          permission,
          message: 'Vui lòng liên hệ quản trị viên nếu bạn cần quyền này'
        });
      }
      
      // Permission granted, continue
      next();
    } catch (e) {
      console.error('Error in requirePermission middleware:', e);
      res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra quyền' });
    }
  };
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────
module.exports = {
  hasPermission,
  requirePermission,
  getRolePermissions,
  getUserOverride,
  getUnitRolePermissions,
  logPermissionCheck,
};
