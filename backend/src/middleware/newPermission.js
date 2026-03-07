// ════════════════════════════════════════════════════════════
// NEW PERMISSION MIDDLEWARE (Migration 24 compatible)
// Date: 2026-03-07
// Description: Uses permissions + user_permissions tables + RPC
// ════════════════════════════════════════════════════════════

const { supabase } = require('../config/supabase');

// ─────────────────────────────────────────────────────────────
// CORE: Check if user has permission using RPC
// ─────────────────────────────────────────────────────────────
async function checkPermission(userId, resource, action, ecosystemUnitId = null) {
  try {
    const { data, error } = await supabase.rpc('user_has_permission', {
      p_user_id: userId,
      p_resource: resource,
      p_action: action,
      p_ecosystem_unit_id: ecosystemUnitId,
    });
    
    if (error) {
      console.error('RPC user_has_permission error:', error);
      return false;
    }
    
    return data === true;
  } catch (e) {
    console.error('Exception in checkPermission:', e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Get all accessible ecosystem units for user
// (includes parent units - hierarchy-aware)
// ─────────────────────────────────────────────────────────────
async function getAccessibleUnits(userId) {
  try {
    // Get all units where user has any permission
    const { data, error } = await supabase
      .from('user_permissions')
      .select('ecosystem_unit_id')
      .eq('user_id', userId)
      .eq('granted', true)
      .not('ecosystem_unit_id', 'is', null);
    
    if (error) throw error;
    
    const unitIds = [...new Set((data || []).map(p => p.ecosystem_unit_id))];
    
    // Get all child units recursively
    const allUnitIds = await getAllChildUnits(unitIds);
    
    return allUnitIds;
  } catch (e) {
    console.error('Error getting accessible units:', e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Get all child units (recursive BFS)
// ─────────────────────────────────────────────────────────────
async function getAllChildUnits(parentIds) {
  if (!parentIds || parentIds.length === 0) return [];
  
  const allIds = [...parentIds];
  let queue = [...parentIds];
  const visited = new Set(parentIds);
  
  while (queue.length > 0) {
    const { data: children } = await supabase
      .from('ecosystem_units')
      .select('id')
      .in('parent_id', queue);
    
    const childIds = (children || [])
      .map(c => c.id)
      .filter(id => !visited.has(id));
    
    childIds.forEach(id => visited.add(id));
    allIds.push(...childIds);
    queue = childIds;
  }
  
  return allIds;
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE: Require permission
// ─────────────────────────────────────────────────────────────
function requirePermission(resource, action, getEcosystemUnitId = null) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized - no user ID' });
      }
      
      // Get ecosystem unit ID if provided
      let ecosystemUnitId = null;
      if (typeof getEcosystemUnitId === 'function') {
        try {
          ecosystemUnitId = await getEcosystemUnitId(req);
        } catch (e) {
          console.error('Error getting ecosystem unit ID:', e);
        }
      }
      
      // Check permission using RPC
      const allowed = await checkPermission(userId, resource, action, ecosystemUnitId);
      
      if (!allowed) {
        console.warn(`Permission denied: user=${userId}, resource=${resource}, action=${action}, unit=${ecosystemUnitId}`);
        return res.status(403).json({ 
          error: 'Không có quyền thực hiện hành động này',
          details: {
            resource,
            action,
            ecosystem_unit_id: ecosystemUnitId,
          },
          message: 'Vui lòng liên hệ quản trị viên nếu bạn cần quyền này'
        });
      }
      
      // Permission granted
      next();
    } catch (e) {
      console.error('Error in requirePermission middleware:', e);
      res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra quyền' });
    }
  };
}

// ─────────────────────────────────────────────────────────────
// HELPER: Check if user can access resource in specific unit
// ─────────────────────────────────────────────────────────────
async function canAccessUnit(userId, unitId) {
  const accessibleUnits = await getAccessibleUnits(userId);
  return accessibleUnits.includes(unitId);
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────
module.exports = {
  checkPermission,
  requirePermission,
  getAccessibleUnits,
  getAllChildUnits,
  canAccessUnit,
};
