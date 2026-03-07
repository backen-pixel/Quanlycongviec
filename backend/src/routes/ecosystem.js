const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ─── HELPER: Check ecosystem permission ──
// User can manage a unit if:
// 1. User is admin/manager (global)
// 2. User is director/manager of THIS unit
// 3. User is director/manager of a PARENT unit (higher level)
async function canManageUnit(userId, userRole, unitId) {
  if (['admin', 'manager'].includes(userRole)) return true;

  // Get unit and its ancestors
  const { data: unit } = await supabase.from('ecosystem_units')
    .select('id, parent_id, level_id').eq('id', unitId).single();
  if (!unit) return false;

  // Check direct membership
  const { data: membership } = await supabase.from('ecosystem_unit_members')
    .select('unit_role, can_manage_children')
    .eq('unit_id', unitId).eq('user_id', userId).single();
  if (membership && ['director', 'manager'].includes(membership.unit_role)) return true;

  // Check parent chain
  let parentId = unit.parent_id;
  while (parentId) {
    const { data: parentMember } = await supabase.from('ecosystem_unit_members')
      .select('unit_role, can_manage_children')
      .eq('unit_id', parentId).eq('user_id', userId).single();
    if (parentMember && ['director', 'manager'].includes(parentMember.unit_role) && parentMember.can_manage_children) {
      return true;
    }
    const { data: parent } = await supabase.from('ecosystem_units')
      .select('parent_id').eq('id', parentId).single();
    parentId = parent?.parent_id || null;
  }
  return false;
}

// Get all units user has access to (their units + child units)
async function getUserAccessibleUnits(userId, userRole) {
  if (['admin', 'manager'].includes(userRole)) {
    const { data } = await supabase.from('ecosystem_units').select('id').eq('is_active', true);
    return (data || []).map(u => u.id);
  }

  // Get direct memberships
  const { data: memberships } = await supabase.from('ecosystem_unit_members')
    .select('unit_id, unit_role, can_manage_children').eq('user_id', userId);
  if (!memberships?.length) return [];

  const unitIds = new Set(memberships.map(m => m.unit_id));

  // For directors/managers with can_manage_children, add all descendants
  const managingUnits = memberships.filter(m =>
    ['director', 'manager'].includes(m.unit_role) && m.can_manage_children
  );

  for (const m of managingUnits) {
    const children = await getDescendantUnits(m.unit_id);
    children.forEach(id => unitIds.add(id));
  }

  return Array.from(unitIds);
}

// Recursive get all descendant unit IDs
async function getDescendantUnits(unitId) {
  const { data: children } = await supabase.from('ecosystem_units')
    .select('id').eq('parent_id', unitId).eq('is_active', true);
  if (!children?.length) return [];
  let ids = children.map(c => c.id);
  for (const child of children) {
    const grandChildren = await getDescendantUnits(child.id);
    ids = [...ids, ...grandChildren];
  }
  return ids;
}

// ═══════════════════════════════════════════════
// CẤP BẬC — ECOSYSTEM LEVELS
// ═══════════════════════════════════════════════

r.get('/levels', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ecosystem_levels')
      .select('*').order('depth');
    if (error) throw error;
    res.json({ levels: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/levels', async (req, res) => {
  try {
    if (!['admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Chỉ admin' });
    const { name, slug, depth, description, icon, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Tên cấp bậc là bắt buộc' });
    const { data, error } = await supabase.from('ecosystem_levels')
      .insert({ name: name.trim(), slug: slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'), depth: depth ?? 0, description: description || null, icon: icon || '📋', color: color || '#6b7280' })
      .select().single();
    if (error) throw error;
    res.json({ level: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update level
r.put('/levels/:id', async (req, res) => {
  try {
    if (!['admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Chỉ admin' });
    const { name, slug, depth, description, icon, color } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (slug !== undefined) update.slug = slug;
    if (depth !== undefined) update.depth = depth;
    if (description !== undefined) update.description = description || null;
    if (icon !== undefined) update.icon = icon;
    if (color !== undefined) update.color = color;
    const { data, error } = await supabase.from('ecosystem_levels')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ level: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE level
r.delete('/levels/:id', async (req, res) => {
  try {
    if (!['admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Chỉ admin' });
    // Check if any units use this level
    const { data: units } = await supabase.from('ecosystem_units')
      .select('id').eq('level_id', req.params.id).eq('is_active', true).limit(1);
    if (units?.length > 0) return res.status(400).json({ error: 'Không thể xóa — đang có đơn vị sử dụng cấp bậc này' });
    const { error } = await supabase.from('ecosystem_levels').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// ĐƠN VỊ — ECOSYSTEM UNITS (Tree)
// ═══════════════════════════════════════════════

// GET tree structure
r.get('/units', async (req, res) => {
  try {
    const { level } = req.query;
    
    let q = supabase.from('ecosystem_units')
      .select(`
        *,
        level:ecosystem_levels(id,name,slug,depth,icon,color),
        company:companies!ecosystem_units_company_id_fkey(id,name,short_name)
      `)
      .eq('is_active', true);
    
    const { data, error } = await q.order('order_index');
    if (error) throw error;

    // Load members count + stage groups for each
    let units = data || [];
    
    // Filter by level AFTER loading (since level is in joined table)
    if (level !== undefined) {
      const levelNum = parseInt(level);
      units = units.filter(u => u.level && u.level.depth === levelNum);
    }
    
    for (const unit of units) {
      const { count } = await supabase.from('ecosystem_unit_members')
        .select('id', { count: 'exact', head: true }).eq('unit_id', unit.id);
      unit.member_count = count || 0;

      const { data: groups } = await supabase.from('ecosystem_unit_stage_groups')
        .select('*, group:workflow_stage_groups(id,name,slug,color,icon)')
        .eq('unit_id', unit.id);
      unit.stage_groups = (groups || []).map(g => g.group);
    }

    // Build tree (only if no level filter, otherwise return flat list)
    if (level === undefined) {
      const tree = buildTree(units);
      res.json({ units, tree });
    } else {
      res.json({ units });
    }
  } catch (e) { 
    console.error('GET /units error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

function buildTree(units) {
  const map = {};
  units.forEach(u => { map[u.id] = { ...u, children: [] }; });
  const roots = [];
  units.forEach(u => {
    if (u.parent_id && map[u.parent_id]) {
      map[u.parent_id].children.push(map[u.id]);
    } else {
      roots.push(map[u.id]);
    }
  });
  return roots;
}

// GET single unit with details
r.get('/units/:id', async (req, res) => {
  try {
    const { data: unit, error } = await supabase.from('ecosystem_units')
      .select(`
        *,
        level:ecosystem_levels(id,name,slug,depth,icon,color),
        company:companies!ecosystem_units_company_id_fkey(id,name,short_name)
      `)
      .eq('id', req.params.id).single();
    if (error) throw error;

    // Members
    const { data: members } = await supabase.from('ecosystem_unit_members')
      .select('*, user:users(id,full_name,email,avatar,role)')
      .eq('unit_id', req.params.id).order('unit_role');

    // Stage groups
    const { data: stageGroups } = await supabase.from('ecosystem_unit_stage_groups')
      .select('*, group:workflow_stage_groups(id,name,slug,color,icon)')
      .eq('unit_id', req.params.id);

    // Children
    const { data: children } = await supabase.from('ecosystem_units')
      .select('*, level:ecosystem_levels(id,name,slug,depth,icon,color)')
      .eq('parent_id', req.params.id).eq('is_active', true).order('order_index');

    // Projects
    const { data: projects } = await supabase.from('project_units')
      .select('*, project:projects(id,code,name,status)')
      .eq('unit_id', req.params.id);

    res.json({
      unit,
      members: members || [],
      stage_groups: (stageGroups || []).map(g => g.group),
      children: children || [],
      projects: (projects || []).map(p => ({ ...p.project, role: p.role })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create unit
r.post('/units', async (req, res) => {
  try {
    const { name, short_name, code, level_id, parent_id, company_id, department_id, description, logo_url, address, phone, email, order_index } = req.body;
    // Sanitize: empty string → null for OPTIONAL UUID/string fields
    const opt = (v) => (v && typeof v === 'string' && v.trim() !== '') ? v.trim() : null;

    // Validate required fields
    if (!name || !name.trim()) return res.status(400).json({ error: 'Tên đơn vị là bắt buộc' });
    if (!level_id || (typeof level_id === 'string' && !level_id.trim())) return res.status(400).json({ error: 'Cấp bậc là bắt buộc' });

    const pid = opt(parent_id);
    // Permission check
    if (pid) {
      const hasAccess = await canManageUnit(req.user.userId, req.user.role, pid);
      if (!hasAccess) return res.status(403).json({ error: 'Không có quyền tạo đơn vị con' });
    } else if (!['admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Chỉ admin tạo được đơn vị gốc' });
    }

    const { data, error } = await supabase.from('ecosystem_units')
      .insert({
        name: name.trim(),
        short_name: opt(short_name),
        code: opt(code),
        level_id: level_id.trim(),  // required — already validated
        parent_id: pid,
        company_id: opt(company_id),
        department_id: opt(department_id),
        description: opt(description),
        logo_url: opt(logo_url),
        address: opt(address),
        phone: opt(phone),
        email: opt(email),
        order_index: order_index || 0,
      })
      .select('*, level:ecosystem_levels(id,name,slug,depth,icon,color)').single();
    if (error) throw error;

    res.json({ unit: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update unit
r.put('/units/:id', async (req, res) => {
  try {
    const hasAccess = await canManageUnit(req.user.userId, req.user.role, req.params.id);
    if (!hasAccess) return res.status(403).json({ error: 'Không có quyền' });

    const { name, short_name, code, level_id, parent_id, company_id, department_id, description, logo_url, address, phone, email, order_index, is_active } = req.body;
    const opt = (v) => (v && typeof v === 'string' && v.trim() !== '') ? v.trim() : null;
    const update = { updated_at: new Date().toISOString() };
    if (name !== undefined && name) update.name = name.trim();
    if (short_name !== undefined) update.short_name = opt(short_name);
    if (code !== undefined) update.code = opt(code);
    if (level_id !== undefined && level_id && (typeof level_id !== 'string' || level_id.trim())) update.level_id = typeof level_id === 'string' ? level_id.trim() : level_id;
    if (parent_id !== undefined) update.parent_id = opt(parent_id);
    if (company_id !== undefined) update.company_id = opt(company_id);
    if (department_id !== undefined) update.department_id = opt(department_id);
    if (description !== undefined) update.description = opt(description);
    if (logo_url !== undefined) update.logo_url = opt(logo_url);
    if (address !== undefined) update.address = opt(address);
    if (phone !== undefined) update.phone = opt(phone);
    if (email !== undefined) update.email = opt(email);
    if (order_index !== undefined) update.order_index = order_index;
    if (is_active !== undefined) update.is_active = is_active;

    const { data, error } = await supabase.from('ecosystem_units')
      .update(update).eq('id', req.params.id)
      .select('*, level:ecosystem_levels(id,name,slug,depth,icon,color)').single();
    if (error) throw error;
    res.json({ unit: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE unit
r.delete('/units/:id', async (req, res) => {
  try {
    const hasAccess = await canManageUnit(req.user.userId, req.user.role, req.params.id);
    if (!hasAccess) return res.status(403).json({ error: 'Không có quyền' });
    await supabase.from('ecosystem_units').update({ is_active: false }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// THÀNH VIÊN — UNIT MEMBERS
// ═══════════════════════════════════════════════

r.post('/units/:id/members', async (req, res) => {
  try {
    const hasAccess = await canManageUnit(req.user.userId, req.user.role, req.params.id);
    if (!hasAccess) return res.status(403).json({ error: 'Không có quyền' });

    const { user_id, unit_role, can_manage_children, is_primary } = req.body;
    if (!user_id || (typeof user_id === 'string' && !user_id.trim())) return res.status(400).json({ error: 'Chọn nhân viên' });

    const { data, error } = await supabase.from('ecosystem_unit_members')
      .insert({ unit_id: req.params.id, user_id: user_id.trim ? user_id.trim() : user_id, unit_role: unit_role || 'member', can_manage_children: can_manage_children || false, is_primary: is_primary || false })
      .select('*, user:users(id,full_name,email,avatar,role)').single();
    if (error) throw error;
    res.json({ member: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/units/:unitId/members/:memberId', async (req, res) => {
  try {
    const hasAccess = await canManageUnit(req.user.userId, req.user.role, req.params.unitId);
    if (!hasAccess) return res.status(403).json({ error: 'Không có quyền' });

    const { unit_role, can_manage_children, is_primary } = req.body;
    const update = {};
    if (unit_role !== undefined) update.unit_role = unit_role;
    if (can_manage_children !== undefined) update.can_manage_children = can_manage_children;
    if (is_primary !== undefined) update.is_primary = is_primary;

    const { data, error } = await supabase.from('ecosystem_unit_members')
      .update(update).eq('id', req.params.memberId)
      .select('*, user:users(id,full_name,email,avatar,role)').single();
    if (error) throw error;
    res.json({ member: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/units/:unitId/members/:memberId', async (req, res) => {
  try {
    const hasAccess = await canManageUnit(req.user.userId, req.user.role, req.params.unitId);
    if (!hasAccess) return res.status(403).json({ error: 'Không có quyền' });
    await supabase.from('ecosystem_unit_members').delete().eq('id', req.params.memberId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// NHÓM QUY TRÌNH — STAGE GROUPS
// ═══════════════════════════════════════════════

r.get('/stage-groups', async (req, res) => {
  try {
    const { data: groups, error } = await supabase.from('workflow_stage_groups')
      .select('*').eq('is_active', true).order('order_index');
    if (error) throw error;

    // Load stages for each group
    for (const g of (groups || [])) {
      const { data: items } = await supabase.from('workflow_stage_group_items')
        .select('*, stage:workflow_stages(id,name,slug,color,icon,order_index)')
        .eq('group_id', g.id).order('order_index');
      g.stages = (items || []).map(i => i.stage);
    }

    res.json({ groups: groups || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/stage-groups', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });
    const { name, slug, description, color, icon, order_index, division_unit_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Tên nhóm là bắt buộc' });
    if (!slug || !slug.trim()) return res.status(400).json({ error: 'Slug là bắt buộc' });
    const { data, error } = await supabase.from('workflow_stage_groups')
      .insert({ name: name.trim(), slug: slug.trim(), description: description || null, color: color || '#6366F1', icon: icon || null, order_index: order_index || 0, division_unit_id: division_unit_id || null })
      .select().single();
    if (error) throw error;
    res.json({ group: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/stage-groups/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });
    const { name, slug, description, color, icon, order_index, is_active, division_unit_id } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (slug !== undefined) update.slug = slug;
    if (description !== undefined) update.description = description;
    if (color !== undefined) update.color = color;
    if (icon !== undefined) update.icon = icon;
    if (order_index !== undefined) update.order_index = order_index;
    if (is_active !== undefined) update.is_active = is_active;
    if (division_unit_id !== undefined) update.division_unit_id = division_unit_id || null;

    const { data, error } = await supabase.from('workflow_stage_groups')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ group: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add/remove stages from group
r.post('/stage-groups/:id/stages', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });
    const { stage_ids } = req.body; // array of stage IDs
    // Clear existing
    await supabase.from('workflow_stage_group_items').delete().eq('group_id', req.params.id);
    // Insert new
    if (stage_ids?.length) {
      await supabase.from('workflow_stage_group_items').insert(
        stage_ids.map((sid, i) => ({ group_id: req.params.id, stage_id: sid, order_index: i }))
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ TẠO QUY TRÌNH CHO CTY TỪ NHÓM QT ═══
// POST /stage-groups/:id/generate-for-company
// Copy stages từ nhóm QT → tạo workflow_stages mới cho company_id
r.post('/stage-groups/:id/generate-for-company', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { company_id } = req.body;
    if (!company_id) return res.status(400).json({ error: 'Cần company_id' });

    // Get group stages
    const { data: items } = await supabase.from('workflow_stage_group_items')
      .select('*, stage:workflow_stages(id,name,slug,color,icon,order_index,description)')
      .eq('group_id', req.params.id).order('order_index');

    if (!items?.length) return res.status(400).json({ error: 'Nhóm QT chưa có stage nào' });

    // Check existing stages for this company
    const { data: existing } = await supabase.from('workflow_stages')
      .select('slug').eq('company_id', company_id);
    const existingSlugs = new Set((existing || []).map(s => s.slug));

    const created = [];
    for (let i = 0; i < items.length; i++) {
      const src = items[i].stage;
      if (!src) continue;

      // Generate unique slug for company
      let slug = `${src.slug}-${company_id.substring(0, 8)}`;
      if (existingSlugs.has(slug)) {
        slug = `${src.slug}-${company_id.substring(0, 8)}-${Date.now()}`;
      }

      const { data: newStage, error } = await supabase.from('workflow_stages').insert({
        name: src.name,
        slug,
        description: src.description || null,
        color: src.color || '#3B82F6',
        icon: src.icon || null,
        order_index: i + 1,
        is_active: true,
        company_id,
      }).select().single();

      if (error) { console.error('Gen stage error:', error); continue; }
      created.push(newStage);
      existingSlugs.add(slug);
    }

    res.json({ created, count: created.length });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Assign stage groups to unit
r.post('/units/:id/stage-groups', async (req, res) => {
  try {
    const hasAccess = await canManageUnit(req.user.userId, req.user.role, req.params.id);
    if (!hasAccess) return res.status(403).json({ error: 'Không có quyền' });

    const { group_ids } = req.body;
    // Clear existing
    await supabase.from('ecosystem_unit_stage_groups').delete().eq('unit_id', req.params.id);
    // Insert new
    if (group_ids?.length) {
      await supabase.from('ecosystem_unit_stage_groups').insert(
        group_ids.map((gid, i) => ({ unit_id: req.params.id, group_id: gid, is_primary: i === 0 }))
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// PHÂN QUYỀN — PERMISSIONS CHECK
// ═══════════════════════════════════════════════

// GET my accessible units (for current user)
r.get('/my-units', async (req, res) => {
  try {
    const { data: memberships } = await supabase.from('ecosystem_unit_members')
      .select(`
        *,
        unit:ecosystem_units(id,name,short_name,code,
          level:ecosystem_levels(id,name,slug,depth,icon,color)
        )
      `)
      .eq('user_id', req.user.userId);

    const accessibleIds = await getUserAccessibleUnits(req.user.userId, req.user.role);

    res.json({
      memberships: memberships || [],
      accessible_unit_ids: accessibleIds,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET check if user can manage a specific unit
r.get('/can-manage/:unitId', async (req, res) => {
  try {
    const canManage = await canManageUnit(req.user.userId, req.user.role, req.params.unitId);
    res.json({ can_manage: canManage });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Assign project to units
r.post('/projects/:projectId/units', async (req, res) => {
  try {
    const { unit_id, role } = req.body;
    const { data, error } = await supabase.from('project_units')
      .insert({ project_id: req.params.projectId, unit_id, role: role || 'owner' })
      .select('*, unit:ecosystem_units(id,name,short_name)').single();
    if (error) throw error;
    res.json({ assignment: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// LIÊN KẾT COMPANIES + DEPARTMENTS
// ═══════════════════════════════════════════════

// GET companies chưa liên kết (hoặc tất cả)
r.get('/available-companies', async (req, res) => {
  try {
    const { data: companies, error } = await supabase.from('companies')
      .select('id, name, short_name, code, logo, is_active')
      .eq('is_active', true).order('name');
    if (error) throw error;

    // Đánh dấu đã liên kết
    const { data: linked } = await supabase.from('ecosystem_units')
      .select('company_id').not('company_id', 'is', null).eq('is_active', true);
    const linkedIds = new Set((linked || []).map(u => u.company_id));

    res.json({
      companies: (companies || []).map(c => ({ ...c, is_linked: linkedIds.has(c.id) }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET departments của 1 company (hoặc tất cả)
r.get('/available-departments', async (req, res) => {
  try {
    const { company_id } = req.query;
    let q = supabase.from('departments').select('id, name, short_name, company_id, is_active').eq('is_active', true).order('name');
    if (company_id) q = q.eq('company_id', company_id);
    const { data, error } = await q;
    if (error) throw error;

    // Đánh dấu đã liên kết
    const { data: linked } = await supabase.from('ecosystem_units')
      .select('department_id').not('department_id', 'is', null).eq('is_active', true);
    const linkedIds = new Set((linked || []).map(u => u.department_id));

    res.json({
      departments: (data || []).map(d => ({ ...d, is_linked: linkedIds.has(d.id) }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET users of a company (qua departments)
r.get('/company-users/:companyId', async (req, res) => {
  try {
    const unitId = req.params.companyId;
    console.log('[company-users] unitId:', unitId);

    // Step 1: Resolve ecosystem_units.id → companies.id
    const { data: unit, error: unitErr } = await supabase
      .from('ecosystem_units')
      .select('id, name, company_id')
      .eq('id', unitId)
      .single();

    console.log('[company-users] unit:', unit?.name, 'company_id:', unit?.company_id, 'err:', unitErr?.message);
    const companyId = unit?.company_id || null;

    // Step 2: Get departments by company_id
    let deptIds = [];
    if (companyId) {
      const { data: depts, error: deptErr } = await supabase
        .from('departments')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true);
      console.log('[company-users] depts:', depts?.length, 'err:', deptErr?.message);
      deptIds = (depts || []).map(d => d.id);
    }

    // Step 3: Get users - NO JOIN, flat query only
    let users = [];
    if (deptIds.length) {
      const { data, error: userErr } = await supabase
        .from('users')
        .select('id, full_name, email, phone, avatar, role, department_id, position')
        .in('department_id', deptIds)
        .eq('is_active', true)
        .order('full_name');
      
      console.log('[company-users] users:', data?.length, 'err:', userErr?.message);
      if (userErr) throw userErr;
      users = data || [];
    }

    console.log('[company-users] RESULT:', users.length, 'users for unit', unitId);
    res.json({ users, company_unit_id: unitId, company_id: companyId, count: users.length });
  } catch (e) { 
    console.error('[company-users] FATAL:', e.message);
    res.status(500).json({ error: e.message }); 
  }
});

// ─── POST Setup Wizard (batch create divisions + companies + departments) ──
r.post('/setup-wizard', async (req, res) => {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Không có quyền' });
  }

  try {
    const { divisions, companies, departments } = req.body;

    // Validation
    if (!divisions || !Array.isArray(divisions) || divisions.length === 0) {
      return res.status(400).json({ error: 'Cần ít nhất 1 Khối' });
    }
    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ error: 'Cần ít nhất 1 Công ty' });
    }

    // Get level IDs
    const { data: levels } = await supabase.from('ecosystem_levels')
      .select('id, level_index').order('level_index');
    const levelMap = {};
    (levels || []).forEach(l => { levelMap[l.level_index] = l.id; });

    const createdUnits = [];

    // 1. Create Divisions (Level 1 - Khối)
    const divisionMap = {}; // index -> unit_id
    for (let i = 0; i < divisions.length; i++) {
      const div = divisions[i];
      if (!div.name || !div.name.trim()) continue;

      const { data: unit, error } = await supabase.from('ecosystem_units').insert({
        name: div.name.trim(),
        description: div.description?.trim() || null,
        level_id: levelMap[1], // Level 1 = Khối
        parent_id: null,
        is_active: true,
      }).select().single();

      if (error) throw error;
      divisionMap[i] = unit.id;
      createdUnits.push(unit);
    }

    // 2. Create Companies (Level 2 - Công ty)
    const companyMap = {}; // index -> unit_id
    for (let i = 0; i < companies.length; i++) {
      const comp = companies[i];
      if (!comp.name || !comp.name.trim()) continue;

      const parentId = divisionMap[comp.divisionIndex];
      if (!parentId) continue; // Skip if parent not created

      const { data: unit, error } = await supabase.from('ecosystem_units').insert({
        name: comp.name.trim(),
        description: `Loại: ${comp.type || 'kitchen'}`,
        level_id: levelMap[2], // Level 2 = Công ty
        parent_id: parentId,
        is_active: true,
      }).select().single();

      if (error) throw error;
      companyMap[i] = unit.id;
      createdUnits.push(unit);
    }

    // 3. Create Departments (Level 3 - Phòng ban) for each company
    if (departments && Array.isArray(departments) && departments.length > 0) {
      for (const companyIdx in companyMap) {
        const companyUnitId = companyMap[companyIdx];

        for (const dept of departments) {
          const { data: deptUnit, error } = await supabase.from('ecosystem_units').insert({
            name: dept.label,
            description: `${dept.defaultCount || 0} nhân viên dự kiến`,
            level_id: levelMap[3], // Level 3 = Phòng ban
            parent_id: companyUnitId,
            is_active: true,
          }).select().single();

          if (error) throw error;
          createdUnits.push(deptUnit);
        }
      }
    }

    res.json({
      success: true,
      message: `Đã tạo ${createdUnits.length} đơn vị`,
      units: createdUnits,
    });
  } catch (e) {
    console.error('Wizard setup error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;

// Export helper functions for use in permission middleware
module.exports.canManageUnit = canManageUnit;
module.exports.getUserAccessibleUnits = getUserAccessibleUnits;
module.exports.getDescendantUnits = getDescendantUnits;



// ═══ ADD USER TO UNIT ═══
r.post("/units/members", async (req, res) => {
  try {
    const { unit_id, user_id } = req.body;
    if (!unit_id || !user_id) return res.status(400).json({ error: "Missing unit_id or user_id" });
    
    // Check if already exists
    const { data: existing } = await supabase
      .from("ecosystem_unit_members")
      .select("id")
      .eq("unit_id", unit_id)
      .eq("user_id", user_id)
      .single();
    
    if (existing) {
      return res.json({ member: existing, already_exists: true });
    }
    
    const { data, error } = await supabase
      .from("ecosystem_unit_members")
      .insert({ unit_id, user_id })
      .select()
      .single();
    
    if (error) throw error;
    res.json({ member: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ GET USERS IN UNIT (HIERARCHICAL) ═══
r.get('/units/:unitId/users', async (req, res) => {
  try {
    const { unitId } = req.params;
    
    // Get unit details
    const { data: unit, error: unitError } = await supabase
      .from('ecosystem_units')
      .select('*, level:ecosystem_levels(depth)')
      .eq('id', unitId)
      .single();
    
    if (unitError) throw unitError;
    
    const unitDepth = unit.level?.depth ?? null;
    let userIds = [];
    
    if (unitDepth === 0) {
      // Tập đoàn: all users
      const { data: allUsers } = await supabase.from('users').select('id').eq('is_active', true);
      userIds = (allUsers || []).map(u => u.id);
    } else if (unitDepth === 1) {
      // Khối: users in companies under this khối
      // Get all child units
      const { data: childUnits } = await supabase
        .from('ecosystem_units')
        .select('id, company_id, level:ecosystem_levels(depth)')
        .or(`parent_id.eq.${unitId},id.eq.${unitId}`);
      
      const companyIds = (childUnits || [])
        .filter(u => u.company_id)
        .map(u => u.company_id);
      
      if (companyIds.length > 0) {
        const { data: depts } = await supabase
          .from('departments')
          .select('id')
          .in('company_id', companyIds);
        
        const deptIds = (depts || []).map(d => d.id);
        
        if (deptIds.length > 0) {
          const { data: users } = await supabase
            .from('users')
            .select('id')
            .in('department_id', deptIds)
            .eq('is_active', true);
          
          userIds = (users || []).map(u => u.id);
        }
      }
    } else if (unitDepth === 2) {
      // Công ty: users in departments of this company
      if (unit.company_id) {
        const { data: depts } = await supabase
          .from('departments')
          .select('id')
          .eq('company_id', unit.company_id);
        
        const deptIds = (depts || []).map(d => d.id);
        
        if (deptIds.length > 0) {
          const { data: users } = await supabase
            .from('users')
            .select('id')
            .in('department_id', deptIds)
            .eq('is_active', true);
          
          userIds = (users || []).map(u => u.id);
        }
      }
    } else if (unitDepth === 3) {
      // Phòng ban: users in this department
      let deptId = null;
      
      // Try 1: Direct department_id link (if exists in future)
      if (unit.department_id) {
        deptId = unit.department_id;
        console.log('Department ID from unit:', deptId);
      }
      // Try 2: Match by name + company
      else if (unit.company_id && unit.name) {
        console.log('Looking for department:', { company_id: unit.company_id, name: unit.name });
        
        const { data: dept, error: deptError } = await supabase
          .from('departments')
          .select('id, name')
          .eq('company_id', unit.company_id)
          .ilike('name', unit.name) // Case-insensitive match
          .maybeSingle(); // Use maybeSingle instead of single (no error if not found)
        
        if (deptError) {
          console.error('Department lookup error:', deptError);
        }
        
        if (dept) {
          deptId = dept.id;
          console.log('Department found:', dept);
        } else {
          console.warn('No department match for:', unit.name, 'in company:', unit.company_id);
          
          // Fallback: Try partial match (in case name differs slightly)
          const { data: allDepts } = await supabase
            .from('departments')
            .select('id, name')
            .eq('company_id', unit.company_id);
          
          console.log('Available departments:', allDepts);
          
          // Try fuzzy match
          const match = (allDepts || []).find(d => 
            d.name.toLowerCase().includes(unit.name.toLowerCase()) ||
            unit.name.toLowerCase().includes(d.name.toLowerCase())
          );
          
          if (match) {
            deptId = match.id;
            console.log('Fuzzy match found:', match);
          }
        }
      }
      
      // Get users ONLY if department found
      if (deptId) {
        const { data: users } = await supabase
          .from('users')
          .select('id')
          .eq('department_id', deptId)
          .eq('is_active', true);
        
        console.log('Users found in department:', users?.length);
        userIds = (users || []).map(u => u.id);
      } else {
        console.warn('Department not found, returning empty user list');
        userIds = [];
      }
    } else if (unitDepth === 4) {
      // Team: users in ecosystem_unit_members
      const { data: members } = await supabase
        .from('ecosystem_unit_members')
        .select('user_id')
        .eq('unit_id', unitId);
      
      userIds = (members || []).map(m => m.user_id);
    }
    
    // Load full user details
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email, department_id, departments(name)')
        .in('id', userIds)
        .eq('is_active', true);
      
      res.json({ users: users || [] });
    } else {
      res.json({ users: [] });
    }
  } catch (e) {
    console.error('GET /units/:unitId/users error:', e);
    res.status(500).json({ error: e.message });
  }
});
