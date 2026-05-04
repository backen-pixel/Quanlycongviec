const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { notifyMultiple } = require('../helpers/notifications');
const r = Router();

r.use(auth);

function userIsAdmin(role) {
  return role === 'admin';
}

/** Admin: query company_id optional (null = tất cả). Không phải admin: luôn company của user. */
function resolveEventsCompanyScope(req, res) {
  if (userIsAdmin(req.user?.role)) {
    const q = req.query.company_id;
    const id = q && String(q).trim() ? String(q).trim() : null;
    return { ok: true, companyId: id };
  }
  const cid = req.user?.company_id;
  if (!cid) {
    res.status(400).json({ error: 'Thiếu company_id của user. Gán công ty cho tài khoản hoặc đăng nhập lại.' });
    return { ok: false, companyId: null };
  }
  return { ok: true, companyId: cid };
}

async function assertEventCompanyAccess(req, res, eventId) {
  const sc = resolveEventsCompanyScope(req, res);
  if (!sc.ok) return false;
  if (!sc.companyId) return true;
  const { data: row, error } = await supabase.from('crm_events').select('id, company_id, lead_id').eq('id', eventId).maybeSingle();
  if (error) throw error;
  if (!row) {
    res.status(404).json({ error: 'Không tìm thấy sự kiện' });
    return false;
  }
  if (row.company_id) {
    if (String(row.company_id) !== String(sc.companyId)) {
      res.status(403).json({ error: 'Không có quyền truy cập sự kiện này' });
      return false;
    }
    return true;
  }
  if (row.lead_id) {
    const { data: lead } = await supabase.from('crm_leads').select('company_id').eq('id', row.lead_id).maybeSingle();
    if (lead?.company_id && String(lead.company_id) !== String(sc.companyId)) {
      res.status(403).json({ error: 'Không có quyền truy cập sự kiện này' });
      return false;
    }
    return true;
  }
  res.status(403).json({ error: 'Không có quyền truy cập sự kiện này' });
  return false;
}

// ═══════════════════════════════════════════════════════════════
// EVENT TYPES — Quản lý loại sự kiện
// ═══════════════════════════════════════════════════════════════

r.get('/event-types', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_types')
      .select('*').order('sort_order');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/event-types', async (req, res) => {
  try {
    const { name, slug, icon, color, stage_slug, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên loại sự kiện là bắt buộc' });
    const finalSlug = slug || name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    // Get max sort_order
    const { data: maxRow } = await supabase.from('event_types')
      .select('sort_order').order('sort_order', { ascending: false }).limit(1).single();
    const nextOrder = (maxRow?.sort_order || 0) + 1;

    const { data, error } = await supabase.from('event_types').insert({
      name, slug: finalSlug, icon: icon || '📋', color: color || '#6B7280',
      stage_slug: stage_slug || null, description: description || null,
      is_system: false, sort_order: nextOrder,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/event-types/:id', async (req, res) => {
  try {
    const update = {};
    ['name', 'slug', 'icon', 'color', 'stage_slug', 'description', 'sort_order'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    const { data, error } = await supabase.from('event_types')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/event-types/:id', async (req, res) => {
  try {
    // Không xóa loại system
    const { data: et } = await supabase.from('event_types')
      .select('is_system').eq('id', req.params.id).single();
    if (et?.is_system) return res.status(400).json({ error: 'Không thể xóa loại sự kiện mặc định' });
    const { error } = await supabase.from('event_types').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// EVENTS — CRUD + Feed + Calendar
// ═══════════════════════════════════════════════════════════════

const EVENT_SELECT = `*, 
  creator:users!crm_events_created_by_fkey(id, full_name, avatar),
  assignee:users!crm_events_assignee_id_fkey(id, full_name, avatar),
  lead:crm_leads(id, title, code, type, customer:customers(id, full_name)),
  customer:customers(id, full_name, phone),
  project:projects(id, name, code),
  event_type_ref:event_types(id, name, slug, icon, color, stage_slug),
  participants:crm_event_participants(id, user_id, status, user:users(id, full_name, avatar))`;

// GET /events — Feed (mới nhất trước) with filters
r.get('/', async (req, res) => {
  try {
    const sc = resolveEventsCompanyScope(req, res);
    if (!sc.ok) return;
    const { type, status, user_id, lead_id, customer_id, date_from, date_to, search, limit, offset } = req.query;
    let q = supabase.from('crm_events').select(EVENT_SELECT, { count: 'exact' });
    if (sc.companyId) q = q.eq('company_id', sc.companyId);

    if (type) q = q.eq('event_type', type);
    if (status) q = q.eq('status', status);
    if (user_id) q = q.or(`created_by.eq.${user_id},assignee_id.eq.${user_id}`);
    if (lead_id) q = q.eq('lead_id', lead_id);
    if (customer_id) q = q.eq('customer_id', customer_id);
    if (date_from) q = q.gte('start_time', date_from);
    if (date_to) q = q.lte('start_time', date_to + 'T23:59:59');
    if (search) q = q.or(`title.ilike.%${search}%,location.ilike.%${search}%,description.ilike.%${search}%`);

    q = q.order('start_time', { ascending: false })
      .range(parseInt(offset) || 0, (parseInt(offset) || 0) + (parseInt(limit) || 50) - 1);

    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ events: data || [], total: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /events/calendar — Calendar view (events in date range)
r.get('/calendar', async (req, res) => {
  try {
    const sc = resolveEventsCompanyScope(req, res);
    if (!sc.ok) return;
    const { month, year } = req.query; // month: 1-12, year: 2026
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();
    const startDate = `${y}-${String(m).padStart(2, '0')}-01T00:00:00`;
    const endDate = new Date(y, m, 0, 23, 59, 59).toISOString(); // last day of month

    let cq = supabase.from('crm_events')
      .select(EVENT_SELECT)
      .gte('start_time', startDate)
      .lte('start_time', endDate)
      .order('start_time');
    if (sc.companyId) cq = cq.eq('company_id', sc.companyId);
    const { data, error } = await cq;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /events/:id
r.get('/:id', async (req, res) => {
  try {
    const ok = await assertEventCompanyAccess(req, res, req.params.id);
    if (!ok) return;
    const { data, error } = await supabase.from('crm_events')
      .select(EVENT_SELECT)
      .eq('id', req.params.id).single();
    if (error) throw error;
    // Get comments
    const { data: comments } = await supabase.from('crm_event_comments')
      .select('*, user:users(id, full_name, avatar)')
      .eq('event_id', req.params.id)
      .order('created_at');
    res.json({ ...data, comments: comments || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /events — Tạo sự kiện
r.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.title) return res.status(400).json({ error: 'Tiêu đề là bắt buộc' });

    // Resolve event_type_id from slug if needed
    let eventTypeId = b.event_type_id || null;
    if (!eventTypeId && b.event_type) {
      const { data: et } = await supabase.from('event_types')
        .select('id').eq('slug', b.event_type).single();
      if (et) eventTypeId = et.id;
    }

    // Sanitize UUID fields
    const uuidFields = ['lead_id', 'customer_id', 'project_id', 'assignee_id', 'event_type_id'];
    const insert = {
      event_type_id: eventTypeId,
      event_type: b.event_type || 'other',
      title: b.title,
      description: b.description || null,
      location: b.location || null,
      start_time: b.start_time,
      end_time: b.end_time || null,
      all_day: b.all_day || false,
      status: b.status || 'planned',
      lead_id: b.lead_id || null,
      customer_id: b.customer_id || null,
      project_id: b.project_id || null,
      assignee_id: b.assignee_id || null,
      created_by: req.user.userId,
    };
    uuidFields.forEach(f => { if (insert[f] === '') insert[f] = null; });

    // Auto-fill customer from lead if not provided
    if (insert.lead_id && !insert.customer_id) {
      const { data: lead } = await supabase.from('crm_leads')
        .select('customer_id').eq('id', insert.lead_id).single();
      if (lead?.customer_id) insert.customer_id = lead.customer_id;
    }

    let evCompanyId = null;
    if (userIsAdmin(req.user?.role) && b.company_id !== undefined && b.company_id !== '') {
      evCompanyId = String(b.company_id).trim() || null;
    } else if (!userIsAdmin(req.user?.role)) {
      evCompanyId = req.user?.company_id ? String(req.user.company_id) : null;
    }
    if (!evCompanyId && insert.lead_id) {
      const { data: lr } = await supabase.from('crm_leads').select('company_id').eq('id', insert.lead_id).maybeSingle();
      if (lr?.company_id) evCompanyId = String(lr.company_id);
    }
    insert.company_id = evCompanyId;

    const { data, error } = await supabase.from('crm_events')
      .insert(insert).select(EVENT_SELECT).single();
    if (error) throw error;

    // Add participants
    if (b.participant_ids?.length) {
      const parts = b.participant_ids.map(uid => ({
        event_id: data.id, user_id: uid, status: 'pending',
      }));
      await supabase.from('crm_event_participants').insert(parts);
    }

    // Auto-add creator as organizer
    await supabase.from('crm_event_participants').upsert({
      event_id: data.id, user_id: req.user.userId, status: 'confirmed',
    }, { onConflict: 'event_id,user_id' });

    // Reload with participants
    const { data: full } = await supabase.from('crm_events')
      .select(EVENT_SELECT).eq('id', data.id).single();

    // ═══ NOTIFICATION: Chỉ thông báo cho người tham gia + người phụ trách ═══
    try {
      const { data: creator } = await supabase.from('users')
        .select('full_name').eq('id', req.user.userId).single();
      const creatorName = creator?.full_name || 'Ai đó';
      const typeInfo = full?.event_type_ref || {};
      const icon = typeInfo.icon || '📋';
      const timeStr = new Date(insert.start_time).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });

      // Chỉ notify: participants + assignee (không broadcast all)
      const notifyIds = new Set(b.participant_ids || []);
      if (insert.assignee_id) notifyIds.add(insert.assignee_id);

      if (notifyIds.size) await notifyMultiple(
        req,
        [...notifyIds],
        'event_created',
        `${icon} Sự kiện mới: ${full.title}`,
        `${creatorName} tạo sự kiện "${full.title}" vào ${timeStr}${insert.location ? ` tại ${insert.location}` : ''}`,
        'event',
        full.id,
        { event_type: insert.event_type, lead_id: insert.lead_id }
      );
    } catch (notifErr) {
      console.warn('[EVENT] Notification error:', notifErr.message);
    }

    res.status(201).json(full);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /events/:id — Sửa sự kiện
r.put('/:id', async (req, res) => {
  try {
    const ok = await assertEventCompanyAccess(req, res, req.params.id);
    if (!ok) return;
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['title', 'description', 'location', 'start_time', 'end_time',
      'all_day', 'status', 'result', 'event_type', 'event_type_id',
      'lead_id', 'customer_id', 'project_id', 'assignee_id'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f] === '' ? null : b[f]; });
    if (userIsAdmin(req.user?.role) && b.company_id !== undefined) {
      update.company_id = b.company_id === '' || b.company_id === null ? null : String(b.company_id);
    }

    // If completed, set result
    if (b.status === 'completed' && b.result) update.result = b.result;

    const { data, error } = await supabase.from('crm_events')
      .update(update).eq('id', req.params.id).select(EVENT_SELECT).single();
    if (error) throw error;

    // Update participants if provided
    if (b.participant_ids) {
      await supabase.from('crm_event_participants').delete().eq('event_id', req.params.id);
      if (b.participant_ids.length) {
        const parts = b.participant_ids.map(uid => ({
          event_id: req.params.id, user_id: uid, status: 'pending',
        }));
        await supabase.from('crm_event_participants').insert(parts);
      }
    }

    // Auto-complete linked task when event completed
    if (b.status === 'completed' && data.lead_id && data.event_type_ref?.stage_slug) {
      try {
        const stageSlug = data.event_type_ref.stage_slug;
        const { data: tasks } = await supabase.from('crm_tasks')
          .select('id, title, status')
          .eq('lead_id', data.lead_id)
          .eq('stage_slug', stageSlug)
          .neq('status', 'completed')
          .order('order_index').limit(1);
        if (tasks?.length) {
          await supabase.from('crm_tasks').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            notes: `✅ Hoàn thành qua sự kiện: ${data.title}\n📍 ${data.location || ''}\n${data.result || ''}`.trim(),
            updated_at: new Date().toISOString(),
          }).eq('id', tasks[0].id);
          data.auto_task_completed = { taskId: tasks[0].id, taskTitle: tasks[0].title };
        }
      } catch (taskErr) { console.warn('[EVENT] Auto-complete task:', taskErr.message); }
    }

    // Notification khi hoàn thành sự kiện
    if (b.status === 'completed') {
      try {
        const { data: creator } = await supabase.from('users')
          .select('full_name').eq('id', req.user.userId).single();
        const { data: allUsers } = await supabase.from('users')
          .select('id').eq('is_active', true);
        await notifyMultiple(
          req, (allUsers || []).map(u => u.id),
          'event_completed',
          `✅ Sự kiện hoàn thành: ${data.title}`,
          `${creator?.full_name || 'Ai đó'} đã hoàn thành sự kiện "${data.title}"${data.result ? `: ${data.result}` : ''}`,
          'event', data.id
        );
      } catch (ne) { console.warn('[EVENT] Complete notification error:', ne.message); }
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /events/:id/respond — Xác nhận/Từ chối tham gia
r.put('/:id/respond', async (req, res) => {
  try {
    const { status } = req.body; // confirmed | declined
    if (!['confirmed', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Status phải là confirmed hoặc declined' });
    }
    const { data, error } = await supabase.from('crm_event_participants')
      .upsert({ event_id: req.params.id, user_id: req.user.userId, status },
        { onConflict: 'event_id,user_id' })
      .select('*, user:users(id, full_name, avatar)').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /events/:id
r.delete('/:id', async (req, res) => {
  try {
    const ok = await assertEventCompanyAccess(req, res, req.params.id);
    if (!ok) return;
    const { error } = await supabase.from('crm_events').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════════════

r.get('/:id/comments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('crm_event_comments')
      .select('*, user:users(id, full_name, avatar)')
      .eq('event_id', req.params.id).order('created_at');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/:id/comments', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Nội dung bình luận trống' });
    const { data, error } = await supabase.from('crm_event_comments')
      .insert({ event_id: req.params.id, user_id: req.user.userId, content })
      .select('*, user:users(id, full_name, avatar)').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/:eventId/comments/:commentId', async (req, res) => {
  try {
    const { error } = await supabase.from('crm_event_comments')
      .delete().eq('id', req.params.commentId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
