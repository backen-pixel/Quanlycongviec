const express = require('express');
const { supabase } = require('../config/supabase');
const r = express.Router();

// ═══════════════════════════════════════════════
// PERMISSIONS - Get all available permissions
// ═══════════════════════════════════════════════
r.get('/permissions', async (req, res) => {
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
r.get('/roles', async (req, res) => {
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

// Get role with full permissions
r.get('/roles/:id', async (req, res) => {
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
r.post('/roles', async (req, res) => {
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
r.put('/roles/:id', async (req, res) => {
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
r.delete('/roles/:id', async (req, res) => {
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

// Set permissions for a role (replace all)
r.put('/roles/:roleId/permissions', async (req, res) => {
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

// Get user's roles
r.get('/users/:userId/roles', async (req, res) => {
  try {
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

// Assign role to user
r.post('/users/:userId/roles', async (req, res) => {
  try {
    const { role_id, ecosystem_unit_id, granted_by } = req.body;
    
    const { data, error } = await supabase
      .from('user_roles')
      .insert({
        user_id: req.params.userId,
        role_id,
        ecosystem_unit_id: ecosystem_unit_id || null,
        granted_by: granted_by || null,
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json({ user_role: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove role from user
r.delete('/user-roles/:id', async (req, res) => {
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

r.post('/check-permission', async (req, res) => {
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
r.get('/ecosystem-units/:unitId/permissions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_permissions')
      .select(\`
        *,
        user:users(id, full_name, email),
        permission:permissions(*)
      \`)
      .eq('ecosystem_unit_id', req.params.unitId);
    
    if (error) throw error;
    res.json({ permissions: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Grant/revoke custom permission for user in specific unit
r.post('/users/custom-permission', async (req, res) => {
  try {
    const { user_id, permission_id, ecosystem_unit_id, granted } = req.body;
    
    // Upsert: if exists update, else insert
    const { data, error } = await supabase
      .from('user_permissions')
      .upsert({
        user_id,
        permission_id,
        ecosystem_unit_id,
        granted: granted !== undefined ? granted : true,
        granted_by: null, // TODO: get from req.user
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
