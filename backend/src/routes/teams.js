const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { syncUserToEcosystem, removeUserFromEcosystem } = require('../helpers/ecosystemSync');

const r = Router();
r.use(auth);

// ═══ LIST teams (filter by department_id) ═══
r.get('/', async (req, res) => {
  try {
    const { department_id, company_id } = req.query;
    let q = supabase.from('teams')
      .select('*, leader:users!teams_leader_id_fkey(id,full_name,email,avatar)')
      .eq('is_active', true).order('name');

    if (department_id) q = q.eq('department_id', department_id);

    // Filter by company: get dept ids of that company first
    if (company_id && !department_id) {
      const { data: depts } = await supabase.from('departments')
        .select('id').eq('company_id', company_id).eq('is_active', true);
      const deptIds = (depts || []).map(d => d.id);
      if (deptIds.length) q = q.in('department_id', deptIds);
      else return res.json({ teams: [] });
    }

    const { data, error } = await q;
    if (error) throw error;

    // Count members per team
    const { data: users } = await supabase.from('users')
      .select('team_id').eq('is_active', true).not('team_id', 'is', null);
    const countMap = {};
    (users || []).forEach(u => { countMap[u.team_id] = (countMap[u.team_id] || 0) + 1; });

    const result = (data || []).map(t => ({ ...t, member_count: countMap[t.id] || 0 }));
    res.json({ teams: result });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET single team ═══
r.get('/:id', async (req, res) => {
  try {
    const { data: team, error } = await supabase.from('teams')
      .select('*, leader:users!teams_leader_id_fkey(id,full_name,email,avatar), department:departments(id,name,color,company_id)')
      .eq('id', req.params.id).single();
    if (error) throw error;

    // Get members
    const { data: members } = await supabase.from('users')
      .select('id,full_name,email,phone,avatar,role,position,is_active')
      .eq('team_id', req.params.id).eq('is_active', true).order('full_name');

    res.json({ team, members: members || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ CREATE team ═══
r.post('/', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const { name, short_name, department_id, leader_id, description, color } = req.body;
    if (!name || !department_id) return res.status(400).json({ error: 'Cần tên và phòng ban' });

    const { data, error } = await supabase.from('teams').insert({
      name, short_name: short_name || null,
      department_id, leader_id: leader_id || null,
      description: description || null, color: color || '#3B82F6',
    }).select().single();
    if (error) throw error;

    // Auto sync to ecosystem (tạo unit cấp Team)
    try {
      const { data: dept } = await supabase.from('departments').select('company_id').eq('id', department_id).single();
      if (dept?.company_id) {
        // Find department ecosystem unit
        const { data: deptUnit } = await supabase.from('ecosystem_units')
          .select('id').eq('department_id', department_id).eq('is_active', true).single();
        if (deptUnit) {
          const { data: teamLevel } = await supabase.from('ecosystem_levels').select('id').eq('slug', 'team').single();
          if (teamLevel) {
            await supabase.from('ecosystem_units').insert({
              name, short_name: short_name || null,
              level_id: teamLevel.id, parent_id: deptUnit.id,
            });
          }
        }
      }
    } catch (syncErr) { console.error('Team sync error:', syncErr.message); }

    res.status(201).json({ team: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ UPDATE team ═══
r.put('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const update = { updated_at: new Date().toISOString() };
    ['name', 'short_name', 'department_id', 'leader_id', 'description', 'color', 'is_active'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    const { data, error } = await supabase.from('teams').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ team: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ DELETE (soft) ═══
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    await supabase.from('teams').update({ is_active: false }).eq('id', req.params.id);
    res.json({ message: 'Đã vô hiệu hóa' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ ADD MEMBER(S) to team — supports single user_id or array user_ids ═══
r.post('/:id/members', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });

    // Support both single user_id and array user_ids
    const { user_id, user_ids } = req.body;
    const ids = user_ids?.length ? user_ids : (user_id ? [user_id] : []);
    if (!ids.length) return res.status(400).json({ error: 'Cần user_id hoặc user_ids' });

    // Get team info
    const { data: team } = await supabase.from('teams').select('id,name,department_id').eq('id', req.params.id).single();
    if (!team) return res.status(404).json({ error: 'Team không tồn tại' });

    // Find ecosystem unit for this team (for auto sync)
    let ecoUnitId = null;
    try {
      const { data: deptUnit } = await supabase.from('ecosystem_units')
        .select('id').eq('department_id', team.department_id).eq('is_active', true).single();
      if (deptUnit) {
        const { data: teamUnits } = await supabase.from('ecosystem_units')
          .select('id').eq('parent_id', deptUnit.id).eq('name', team.name).eq('is_active', true).limit(1);
        ecoUnitId = teamUnits?.[0]?.id || deptUnit.id;
      }
    } catch {}

    const addedMembers = [];
    for (const uid of ids) {
      // Update user's team_id + department_id
      await supabase.from('users').update({
        team_id: req.params.id,
        department_id: team.department_id,
        updated_at: new Date().toISOString(),
      }).eq('id', uid);

      // Auto sync to ecosystem
      if (ecoUnitId) {
        try {
          const { data: existing } = await supabase.from('ecosystem_unit_members')
            .select('id').eq('unit_id', ecoUnitId).eq('user_id', uid).single();
          if (!existing) {
            await supabase.from('ecosystem_unit_members').insert({
              unit_id: ecoUnitId, user_id: uid,
              unit_role: 'member', can_manage_children: false,
            });
          }
        } catch (syncErr) { console.error('Team member sync:', syncErr.message); }
      }

      const { data: user } = await supabase.from('users')
        .select('id,full_name,email,phone,avatar,role,position').eq('id', uid).single();
      if (user) addedMembers.push(user);
    }

    // Return single member for backward compat, plus array
    res.json({ member: addedMembers[0] || null, members: addedMembers, count: addedMembers.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ REMOVE MEMBER from team ═══
r.delete('/:id/members/:userId', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });

    // Clear team_id on user (keep department_id)
    await supabase.from('users').update({
      team_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.userId).eq('team_id', req.params.id);

    // Remove from ecosystem_unit_members
    try {
      const { data: team } = await supabase.from('teams').select('department_id,name').eq('id', req.params.id).single();
      if (team) {
        const { data: deptUnit } = await supabase.from('ecosystem_units')
          .select('id').eq('department_id', team.department_id).eq('is_active', true).single();
        if (deptUnit) {
          const { data: teamUnits } = await supabase.from('ecosystem_units')
            .select('id').eq('parent_id', deptUnit.id).eq('name', team.name).eq('is_active', true).limit(1);
          const unitId = teamUnits?.[0]?.id || deptUnit.id;
          await supabase.from('ecosystem_unit_members').delete().eq('unit_id', unitId).eq('user_id', req.params.userId);
        }
      }
    } catch (syncErr) { console.error('Remove member sync:', syncErr.message); }

    res.json({ message: 'Đã xóa khỏi team' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET NV của PB (để chọn thêm vào team) ═══
r.get('/:id/available-members', async (req, res) => {
  try {
    const { data: team } = await supabase.from('teams').select('department_id').eq('id', req.params.id).single();
    if (!team) return res.status(404).json({ error: 'Team không tồn tại' });

    // Lấy tất cả NV của PB (ưu tiên)
    const { data: deptUsers } = await supabase.from('users')
      .select('id,full_name,email,phone,avatar,role,position,team_id')
      .eq('department_id', team.department_id).eq('is_active', true).order('full_name');

    res.json({ users: deptUsers || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
