const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { syncDepartmentToEcosystem, syncUserToEcosystem, removeUserFromEcosystem } = require('../helpers/ecosystemSync');

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════
// DEPARTMENTS CRUD
// ═══════════════════════════════════════════════

// GET my departments (MUST be before /:id)
r.get('/my/list', async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('department_id').eq('id', req.user.userId).single();
    if (!user?.department_id) return res.json({ departments: [] });

    const { data } = await supabase.from('departments')
      .select('*').eq('id', user.department_id);
    res.json({ departments: data || [] });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// LIST departments with member count
r.get('/', async (req, res) => {
  try {
    const { company_id, company_unit_id } = req.query;
    
    // Resolve company_unit_id → company_id if needed
    let resolvedCompanyId = company_id;
    if (!resolvedCompanyId && company_unit_id) {
      const { data: unit } = await supabase.from('ecosystem_units')
        .select('company_id').eq('id', company_unit_id).single();
      resolvedCompanyId = unit?.company_id;
    }

    let q = supabase.from('departments').select('id, name, company_id, color, is_active').order('name');
    if (resolvedCompanyId) q = q.eq('company_id', resolvedCompanyId);
    q = q.eq('is_active', true);
    
    const { data: depts, error } = await q;
    if (error) throw error;

    res.json({ departments: depts || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// GET department detail with members
r.get('/:id', async (req, res) => {
  try {
    const { data: dept, error } = await supabase.from('departments')
      .select('*').eq('id', req.params.id).single();
    if (error) throw error;

    // Members
    const { data: members } = await supabase.from('users')
      .select('id,full_name,email,phone,avatar,role,position,is_active')
      .eq('department_id', req.params.id).eq('is_active', true).order('full_name');

    // Manager info
    let manager = null;
    if (dept.manager_id) {
      const { data: m } = await supabase.from('users')
        .select('id,full_name,email,avatar,role').eq('id', dept.manager_id).single();
      manager = m;
    }

    // Unread count for current user
    const { data: readData } = await supabase.from('department_message_reads')
      .select('last_read_at')
      .eq('department_id', req.params.id).eq('user_id', req.user.userId).single();

    let unread = 0;
    if (readData?.last_read_at) {
      const { count } = await supabase.from('department_messages')
        .select('*', { count: 'exact', head: true })
        .eq('department_id', req.params.id)
        .gt('created_at', readData.last_read_at);
      unread = count || 0;
    } else {
      const { count } = await supabase.from('department_messages')
        .select('*', { count: 'exact', head: true })
        .eq('department_id', req.params.id);
      unread = count || 0;
    }

    res.json({ department: { ...dept, manager }, members: members || [], unread });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// CREATE department
r.post('/', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    const slug = (b.slug || b.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { data, error } = await supabase.from('departments').insert({
      name: b.name, slug, description: b.description || null,
      color: b.color || '#6366F1', manager_id: b.manager_id || null,
      parent_id: b.parent_id || null, company_id: b.company_id || null,
    }).select().single();
    if (error) throw error;

    // Auto sync to ecosystem
    if (b.company_id) {
      await syncDepartmentToEcosystem({ ...data, company_id: b.company_id });
    }

    res.status(201).json({ department: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// UPDATE department
r.put('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    ['name', 'slug', 'description', 'color', 'manager_id', 'parent_id', 'is_active', 'company_id'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase.from('departments').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Auto sync to ecosystem
    if (data.company_id) {
      await syncDepartmentToEcosystem(data);
    }

    res.json({ department: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// DELETE (soft) — sync ecosystem
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });

    // Get members before deleting
    const { data: members } = await supabase.from('users').select('id').eq('department_id', req.params.id).eq('is_active', true);

    // Soft delete department
    await supabase.from('departments').update({ is_active: false }).eq('id', req.params.id);

    // Remove members from department + ecosystem
    for (const m of (members || [])) {
      await supabase.from('users').update({ department_id: null, team_id: null }).eq('id', m.id);
      try { await removeUserFromEcosystem(m.id, req.params.id); } catch {}
    }

    // Soft delete teams in this department
    await supabase.from('teams').update({ is_active: false }).eq('department_id', req.params.id);

    // Soft delete ecosystem unit
    try {
      await supabase.from('ecosystem_units').update({ is_active: false })
        .eq('department_id', req.params.id).eq('is_active', true);
    } catch {}

    res.json({ message: 'Đã vô hiệu hóa' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ADD member to department (update user.department_id)
r.post('/:id/members', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const { user_id, unit_role } = req.body;
    const { data, error } = await supabase.from('users')
      .update({ department_id: req.params.id }).eq('id', user_id)
      .select('id,full_name,email,role,position').single();
    if (error) throw error;

    // Auto sync to ecosystem
    await syncUserToEcosystem(user_id, req.params.id, unit_role || 'member');

    res.json({ member: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// REMOVE member from department
r.delete('/:id/members/:userId', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    await supabase.from('users').update({ department_id: null }).eq('id', req.params.userId).eq('department_id', req.params.id);

    // Auto remove from ecosystem
    await removeUserFromEcosystem(req.params.userId, req.params.id);

    res.json({ message: 'Đã xóa khỏi phòng ban' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══════════════════════════════════════════════
// DEPARTMENT MESSAGES (TRAO ĐỔI)
// ═══════════════════════════════════════════════

// LIST messages (paginated)
r.get('/:id/messages', async (req, res) => {
  try {
    const { before, limit = 50 } = req.query;
    let q = supabase.from('department_messages')
      .select(`
        *,
        sender:users!department_messages_sender_id_fkey(id,full_name,avatar,role),
        reply_to:department_messages!department_messages_reply_to_id_fkey(id,content,sender:users!department_messages_sender_id_fkey(id,full_name))
      `)
      .eq('department_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(+limit);

    if (before) q = q.lt('created_at', before);
    const { data, error } = await q;
    if (error) throw error;

    // Mark as read
    await supabase.from('department_message_reads').upsert({
      department_id: req.params.id,
      user_id: req.user.userId,
      last_read_at: new Date().toISOString(),
    }, { onConflict: 'department_id,user_id' });

    res.json({ messages: (data || []).reverse() });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// SEND message
r.post('/:id/messages', async (req, res) => {
  try {
    const { content, reply_to_id, attachments } = req.body;
    if (!content?.trim() && !(attachments?.length)) return res.status(400).json({ error: 'Nội dung trống' });

    const { data, error } = await supabase.from('department_messages').insert({
      department_id: req.params.id,
      sender_id: req.user.userId,
      content: content?.trim() || '',
      reply_to_id: reply_to_id || null,
      attachments: attachments || [],
    }).select(`
      *,
      sender:users!department_messages_sender_id_fkey(id,full_name,avatar,role)
    `).single();
    if (error) throw error;

    // Realtime push via Socket.IO
    const io = req.app.get('io');
    if (io) {
      // Get all members of this dept
      const { data: members } = await supabase.from('users')
        .select('id').eq('department_id', req.params.id).eq('is_active', true);
      (members || []).forEach(m => {
        if (m.id !== req.user.userId) {
          io.to(`user:${m.id}`).emit('department_message', {
            department_id: req.params.id,
            message: data,
          });
        }
      });
    }

    // Update own read marker
    await supabase.from('department_message_reads').upsert({
      department_id: req.params.id,
      user_id: req.user.userId,
      last_read_at: new Date().toISOString(),
    }, { onConflict: 'department_id,user_id' });

    res.status(201).json({ message: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// EDIT message (own only)
r.put('/:deptId/messages/:msgId', async (req, res) => {
  try {
    const { content } = req.body;
    const { data, error } = await supabase.from('department_messages')
      .update({ content, is_edited: true, updated_at: new Date().toISOString() })
      .eq('id', req.params.msgId).eq('sender_id', req.user.userId)
      .select().single();
    if (error) throw error;
    res.json({ message: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// DELETE message (own or admin)
r.delete('/:deptId/messages/:msgId', async (req, res) => {
  try {
    let q = supabase.from('department_messages').delete().eq('id', req.params.msgId);
    if (!['admin', 'manager'].includes(req.user.role)) q = q.eq('sender_id', req.user.userId);
    await q;
    res.json({ message: 'Đã xóa' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// PIN/UNPIN message (admin/manager only)
r.put('/:deptId/messages/:msgId/pin', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const { is_pinned } = req.body;
    const { data } = await supabase.from('department_messages')
      .update({ is_pinned }).eq('id', req.params.msgId).select().single();
    res.json({ message: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
