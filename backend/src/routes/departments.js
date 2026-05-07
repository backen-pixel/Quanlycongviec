const { Router } = require('express');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { syncDepartmentToEcosystem, syncUserToEcosystem, removeUserFromEcosystem } = require('../helpers/ecosystemSync');

// Upload storage for department chat
const uploadDir = 'uploads/dept-chat/';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const deptChatUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
  }),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const r = Router();
r.use(auth);

async function assertDivisionAllowedForCompany(companyId, divisionUnitId) {
  if (!companyId || !divisionUnitId) return { ok: true };
  const sid = String(divisionUnitId);
  const { data: link } = await supabase.from('company_division_units')
    .select('id')
    .eq('company_id', companyId)
    .eq('division_unit_id', divisionUnitId)
    .maybeSingle();
  if (link) return { ok: true };
  const { data: co } = await supabase.from('companies').select('division_unit_id').eq('id', companyId).maybeSingle();
  if (co?.division_unit_id && String(co.division_unit_id) === sid) return { ok: true };
  return { ok: false };
}

/** Slug UNIQUE toàn DB — không được chỉ dựa trên tên (trùng giữa các công ty / trùng seed). */
function uniqueDeptSlug({ slugInput, name, companyId }) {
  let base = String(slugInput || name || '').toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!base) {
    base = companyId ? `d-${String(companyId).replace(/-/g, '').slice(0, 12)}` : 'dept';
  }
  const suffix = crypto.randomBytes(4).toString('hex');
  const out = `${base}-${suffix}`;
  return out.length > 100 ? out.slice(0, 100) : out;
}

function formatDbError(err) {
  if (!err) return 'Lỗi';
  return err.message || err.details || err.hint || String(err.code || err);
}

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

    let q = supabase.from('departments').select('id, name, company_id, division_unit_id, color, is_active').order('name');
    if (resolvedCompanyId) q = q.eq('company_id', resolvedCompanyId);
    const divFilter = req.query.division_unit_id;
    if (divFilter) q = q.eq('division_unit_id', divFilter);
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
    let divisionUnitId = b.division_unit_id || null;
    if (b.company_id && !divisionUnitId) {
      const { data: co } = await supabase.from('companies').select('division_unit_id').eq('id', b.company_id).maybeSingle();
      divisionUnitId = co?.division_unit_id || null;
    }
    if (b.company_id && divisionUnitId) {
      const { ok } = await assertDivisionAllowedForCompany(b.company_id, divisionUnitId);
      if (!ok) return res.status(400).json({ error: 'Khối không thuộc công ty này' });
    }
    const slug = uniqueDeptSlug({ slugInput: b.slug, name: b.name, companyId: b.company_id });
    const { data, error } = await supabase.from('departments').insert({
      name: b.name, slug, description: b.description || null,
      color: b.color || '#6366F1', manager_id: b.manager_id || null,
      parent_id: b.parent_id || null, company_id: b.company_id || null,
      division_unit_id: divisionUnitId,
    }).select().single();
    if (error) throw error;

    // Auto sync to ecosystem
    if (b.company_id) {
      await syncDepartmentToEcosystem({ ...data, company_id: b.company_id, division_unit_id: data.division_unit_id });
    }

    res.status(201).json({ department: data });
  } catch (e) { console.error(e); res.status(500).json({ error: formatDbError(e) }); }
});

// UPDATE department
r.put('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    ['name', 'slug', 'description', 'color', 'manager_id', 'parent_id', 'is_active', 'company_id', 'division_unit_id'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data: before } = await supabase.from('departments').select('company_id, division_unit_id').eq('id', req.params.id).single();
    const targetCompany = b.company_id !== undefined ? b.company_id : before?.company_id;
    let targetDiv = b.division_unit_id !== undefined ? b.division_unit_id : before?.division_unit_id;
    if (targetCompany && !targetDiv) {
      const { data: co } = await supabase.from('companies').select('division_unit_id').eq('id', targetCompany).maybeSingle();
      targetDiv = co?.division_unit_id || null;
    }
    if (targetCompany && targetDiv) {
      const { ok } = await assertDivisionAllowedForCompany(targetCompany, targetDiv);
      if (!ok) return res.status(400).json({ error: 'Khối không thuộc công ty này' });
    }
    const { data, error } = await supabase.from('departments').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Auto sync to ecosystem
    if (data.company_id) {
      await syncDepartmentToEcosystem(data);
    }

    res.json({ department: data });
  } catch (e) { console.error(e); res.status(500).json({ error: formatDbError(e) }); }
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

// Simple in-memory Map for rate limiting (per-user last message time)
const lastMessageMap = new Map();
const messageCountMap = new Map(); // Store array of timestamps for sliding window

function checkRateLimit(userId) {
  const now = Date.now();
  const lastTime = lastMessageMap.get(userId) || 0;
  if (now - lastTime < 1000) return { blocked: true, reason: 'Gửi quá nhanh, vui lòng chờ' };

  // Sliding window (max 30 messages per minute)
  const windowStart = now - 60000;
  let timestamps = messageCountMap.get(userId) || [];
  timestamps = timestamps.filter(t => t > windowStart);
  if (timestamps.length >= 30) return { blocked: true, reason: 'Gửi quá nhiều, vui lòng chờ' };

  timestamps.push(now);
  messageCountMap.set(userId, timestamps);
  lastMessageMap.set(userId, now);
  return { blocked: false };
}

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

    // Load reactions
    const msgIds = (data || []).map(m => m.id);
    let reactionsMap = {};
    if (msgIds.length) {
      const { data: reactions } = await supabase.from('department_message_reactions')
        .select('*, user:users(id, full_name)')
        .in('message_id', msgIds);
      (reactions || []).forEach(r => {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        reactionsMap[r.message_id].push(r);
      });
    }

    // Mark as read
    await supabase.from('department_message_reads').upsert({
      department_id: req.params.id,
      user_id: req.user.userId,
      last_read_at: new Date().toISOString(),
    }, { onConflict: 'department_id,user_id' });

    res.json({ messages: (data || []).reverse().map(m => ({ ...m, reactions: reactionsMap[m.id] || [] })) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// SEND message
r.post('/:id/messages', async (req, res) => {
  try {
    // Rate limit check
    const limitCheck = checkRateLimit(req.user.userId);
    if (limitCheck.blocked) return res.status(429).json({ error: limitCheck.reason });

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
      io.to(`dept:${req.params.id}`).emit('department_message', {
        department_id: req.params.id,
        message: data,
      });
    }

    // Push notifications
    const { data: members } = await supabase.from('users')
      .select('id, full_name').eq('department_id', req.params.id).eq('is_active', true);
    const { data: dept } = await supabase.from('departments').select('name').eq('id', req.params.id).single();

    if (members) {
      const { sendWebPush } = require('./push');
      for (const m of members) {
        if (m.id !== req.user.userId) {
          const { data: notif } = await supabase.from('notifications').insert({
            user_id: m.id,
            type: 'department_chat',
            title: dept.name,
            message: `${req.user.fullName}: ${content?.slice(0, 100) || 'Đã gửi file'}`,
            entity_type: 'department',
            entity_id: req.params.id,
          }).select().single();
          if (notif) sendWebPush(m.id, notif);
        }
      }
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

// Reaction toggling
r.post('/:deptId/messages/:msgId/react', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Thiếu emoji' });
    const { data: existing } = await supabase.from('department_message_reactions')
      .select('id').eq('message_id', req.params.msgId).eq('user_id', req.user.userId).eq('emoji', emoji).single();
    if (existing) {
      await supabase.from('department_message_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('department_message_reactions').insert({
        message_id: req.params.msgId, user_id: req.user.userId, emoji,
      });
    }
    const { data: reactions } = await supabase.from('department_message_reactions')
      .select('*, user:users(id, full_name)').eq('message_id', req.params.msgId);
    
    const io = req.app.get('io');
    if (io) io.to(`dept:${req.params.deptId}`).emit('department_reaction', { message_id: req.params.msgId, reactions });
    res.json({ reactions });
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

// ═══════════════════════════════════════════════
// CHAT: UPLOAD FILE/IMAGE/VIDEO
// ═══════════════════════════════════════════════
r.post('/:id/chat/upload', deptChatUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const mime = req.file.mimetype;
    let file_type = 'file';
    if (mime.startsWith('image/')) file_type = 'image';
    else if (mime.startsWith('video/')) file_type = 'video';
    else if (mime.startsWith('audio/')) file_type = 'audio';

    const attachment_url = `/uploads/dept-chat/${req.file.filename}`;
    const attachment = {
      url: attachment_url,
      name: req.file.originalname,
      size: req.file.size,
      type: mime,
      file_type,
    };

    const { data, error } = await supabase.from('department_messages').insert({
      department_id: req.params.id,
      sender_id: req.user.userId,
      content: req.body.content || '',
      attachments: [attachment],
    }).select(`
      *,
      sender:users!department_messages_sender_id_fkey(id,full_name,avatar,role)
    `).single();
    if (error) throw error;

    // Realtime
    const io = req.app.get('io');
    if (io) io.to(`dept:${req.params.id}`).emit('department_message', { department_id: req.params.id, message: data });

    // Notifications
    const { data: members } = await supabase.from('users')
      .select('id').eq('department_id', req.params.id).eq('is_active', true);
    const { data: dept } = await supabase.from('departments').select('name').eq('id', req.params.id).single();
    if (members) {
      const { sendWebPush } = require('./push');
      const preview = file_type === 'image' ? '[🖼️ Hình ảnh]' : file_type === 'video' ? '[🎬 Video]' : `[📎 ${req.file.originalname}]`;
      for (const m of members) {
        if (m.id !== req.user.userId) {
          const { data: notif } = await supabase.from('notifications').insert({
            user_id: m.id, type: 'department_chat', title: dept?.name || 'Chat',
            message: `${req.user.fullName}: ${preview}`,
            entity_type: 'department', entity_id: req.params.id,
          }).select().single();
          if (notif) sendWebPush(m.id, notif);
        }
      }
    }

    // Update read marker
    await supabase.from('department_message_reads').upsert({
      department_id: req.params.id, user_id: req.user.userId,
      last_read_at: new Date().toISOString(),
    }, { onConflict: 'department_id,user_id' });

    res.json({ message: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi upload' }); }
});

// ═══════════════════════════════════════════════
// CHAT: ADD/REMOVE CHAT PARTICIPANTS (beyond dept members)
// ═══════════════════════════════════════════════

// GET users available to add (not in this department)
r.get('/:id/chat/available-users', async (req, res) => {
  try {
    const { search } = req.query;
    let q = supabase.from('users')
      .select('id,full_name,email,avatar,role,position,department_id')
      .eq('is_active', true)
      .neq('department_id', req.params.id)
      .order('full_name')
      .limit(50);
    if (search) q = q.ilike('full_name', `%${search}%`);
    const { data } = await q;
    // Also include users with null department_id
    let q2 = supabase.from('users')
      .select('id,full_name,email,avatar,role,position,department_id')
      .eq('is_active', true)
      .is('department_id', null)
      .order('full_name')
      .limit(50);
    if (search) q2 = q2.ilike('full_name', `%${search}%`);
    const { data: noDepUsers } = await q2;
    const merged = [...(data || []), ...(noDepUsers || [])].filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i);
    res.json({ users: merged });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// POST /:id/chat/participants — add user to dept chat (update dept_id)
r.post('/:id/chat/participants', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Thiếu user_id' });

    const { data, error } = await supabase.from('users')
      .update({ department_id: req.params.id })
      .eq('id', user_id)
      .select('id,full_name,email,phone,avatar,role,position,is_active')
      .single();
    if (error) throw error;

    // Sync ecosystem
    try { await syncUserToEcosystem(user_id, req.params.id, 'member'); } catch {}

    // System message
    const { data: sysMsg } = await supabase.from('department_messages').insert({
      department_id: req.params.id,
      sender_id: req.user.userId,
      content: `📢 ${req.user.fullName} đã thêm ${data.full_name} vào nhóm`,
      attachments: [],
    }).select(`*, sender:users!department_messages_sender_id_fkey(id,full_name,avatar,role)`).single();

    const io = req.app.get('io');
    if (io && sysMsg) io.to(`dept:${req.params.id}`).emit('department_message', { department_id: req.params.id, message: sysMsg });

    res.json({ member: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi thêm thành viên' }); }
});

// DELETE /:id/chat/participants/:userId — remove from dept chat
r.delete('/:id/chat/participants/:userId', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    await supabase.from('users').update({ department_id: null }).eq('id', req.params.userId).eq('department_id', req.params.id);
    try { await removeUserFromEcosystem(req.params.userId, req.params.id); } catch {}

    // System message
    const { data: removed } = await supabase.from('users').select('full_name').eq('id', req.params.userId).single();
    const { data: sysMsg } = await supabase.from('department_messages').insert({
      department_id: req.params.id,
      sender_id: req.user.userId,
      content: `👋 ${removed?.full_name || 'Thành viên'} đã rời nhóm`,
      attachments: [],
    }).select(`*, sender:users!department_messages_sender_id_fkey(id,full_name,avatar,role)`).single();

    const io = req.app.get('io');
    if (io && sysMsg) io.to(`dept:${req.params.id}`).emit('department_message', { department_id: req.params.id, message: sysMsg });

    res.json({ message: 'Đã xóa thành viên' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
