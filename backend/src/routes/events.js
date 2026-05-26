const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { notifyMultiple } = require('../helpers/notifications');
const { isCrmSystemAdminUser, isCrmCompanyAdminUser } = require('../helpers/crmAccessRoles');
const { isAdminLike } = require('../helpers/adminRole');
const r = Router();

r.use(auth);

const { normalizeTimestamp: normalizeEventTimestamp } = require('../helpers/normalizeTimestamp');

/** Lead IDs của một công ty (đủ trang) — dùng lọc sự kiện legacy thiếu company_id. */
async function fetchAllLeadIdsForCompany(companyId) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('company_id', companyId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk.map((r) => r.id));
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

/**
 * Chỉ admin hệ thống được company_id null (= xem mọi công ty qua query).
 * Admin theo công ty / nhân viên: luôn giới hạn company_id JWT — không đọc company_id query để tránh lộ dữ liệu công ty khác.
 */
function resolveEventsCompanyScope(req, res) {
  if (isCrmCompanyAdminUser(req.user)) {
    return { ok: true, companyId: String(req.user.company_id).trim() };
  }
  if (isCrmSystemAdminUser(req.user)) {
    const q = req.query.company_id;
    const id = q && String(q).trim() ? String(q).trim() : null;
    return { ok: true, companyId: id };
  }
  const cid = req.user?.company_id;
  if (!cid) {
    res.status(400).json({ error: 'Thiếu company_id của user. Gán công ty cho tài khoản hoặc đăng nhập lại.' });
    return { ok: false, companyId: null };
  }
  return { ok: true, companyId: String(cid).trim() };
}

const EVENTS_COMPANY_OR_MAX_IN = 320;

/**
 * Lọc sự kiện thuộc công ty: company_id khớp HOẶC (legacy) lead/deal thuộc công ty đó.
 * Phải là hàm đồng bộ — không được `async` + `return queryBuilder`: builder Supabase là thenable,
 * async function sẽ await nhầm và trả về { data, error } → lỗi «q.order is not a function».
 */
function applyEventsCompanyFilter(queryBuilder, companyId, leadIdsForCompany) {
  if (!companyId) return queryBuilder;
  const slice = (leadIdsForCompany || []).slice(0, EVENTS_COMPANY_OR_MAX_IN);
  if (slice.length === 0) {
    return queryBuilder.eq('company_id', companyId);
  }
  return queryBuilder.or(`company_id.eq.${companyId},lead_id.in.(${slice.join(',')})`);
}

async function assertEventCompanyAccess(req, res, eventId) {
  const sc = resolveEventsCompanyScope(req, res);
  if (!sc.ok) return false;
  if (!sc.companyId && isCrmSystemAdminUser(req.user)) return true;
  const { data: row, error } = await supabase.from('crm_events').select('id, company_id, lead_id').eq('id', eventId).maybeSingle();
  if (error) throw error;
  if (!row) {
    res.status(404).json({ error: 'Không tìm thấy sự kiện' });
    return false;
  }
  if (!sc.companyId) return true;
  if (row.company_id && String(row.company_id) === String(sc.companyId)) return true;
  if (row.lead_id) {
    const { data: lead } = await supabase.from('crm_leads').select('company_id').eq('id', row.lead_id).maybeSingle();
    if (lead?.company_id && String(lead.company_id) === String(sc.companyId)) return true;
  }
  res.status(403).json({ error: 'Không có quyền truy cập sự kiện này' });
  return false;
}

/**
 * Cho phép hủy/xóa sự kiện: chỉ người tạo (`created_by`) hoặc admin.
 * Gọi sau `assertEventCompanyAccess` để đã đảm bảo cùng công ty.
 */
async function assertEventDeletable(req, res, eventId) {
  if (isAdminLike(req.user)) return true;
  const { data: row, error } = await supabase
    .from('crm_events')
    .select('created_by')
    .eq('id', eventId)
    .maybeSingle();
  if (error) {
    res.status(500).json({ error: error.message });
    return false;
  }
  if (!row) {
    res.status(404).json({ error: 'Không tìm thấy sự kiện' });
    return false;
  }
  if (String(row.created_by || '') === String(req.user?.userId || '')) return true;
  res.status(403).json({ error: 'Chỉ người tạo hoặc admin mới được hủy/xóa sự kiện' });
  return false;
}

async function resolveLeadCompanyId(leadId) {
  if (!leadId) return null;
  const { data: lr } = await supabase.from('crm_leads').select('company_id').eq('id', leadId).maybeSingle();
  return lr?.company_id ? String(lr.company_id) : null;
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
    const { type, status, user_id, lead_id, customer_id, date_from, date_to, search, limit, offset, region_id } = req.query;
    let companyLeadIds = [];
    if (sc.companyId) {
      companyLeadIds = await fetchAllLeadIdsForCompany(sc.companyId);
    }
    let q = supabase.from('crm_events').select(EVENT_SELECT, { count: 'exact' });
    q = applyEventsCompanyFilter(q, sc.companyId, companyLeadIds);

    /** Lọc theo khu vực CRM (lead.region_id): chỉ sự kiện gắn lead thuộc khu vực đó */
    if (region_id && String(region_id).trim()) {
      let lq = supabase.from('crm_leads').select('id').eq('region_id', String(region_id).trim());
      if (sc.companyId) lq = lq.eq('company_id', sc.companyId);
      const { data: lr, error: lRegErr } = await lq;
      if (lRegErr) throw lRegErr;
      const lids = (lr || []).map((x) => x.id).filter(Boolean);
      if (lids.length === 0) {
        return res.json({ events: [], total: 0 });
      }
      const slice = lids.slice(0, EVENTS_COMPANY_OR_MAX_IN);
      q = q.in('lead_id', slice);
    }

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

/** Ngày theo múi giờ VN (YYYY-MM-DD) */
function vnDateKey(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** Thứ Hai tuần chứa ngày (YYYY-MM-DD, VN) */
function vnWeekStartKey(isoStr) {
  const key = vnDateKey(isoStr);
  if (!key) return null;
  const [y, m, day] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  const dow = dt.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diff);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function vnMonthKey(isoStr) {
  const key = vnDateKey(isoStr);
  return key ? key.slice(0, 7) : null;
}

function daysBetweenInclusive(fromStr, toStr) {
  const a = new Date(`${fromStr}T12:00:00`);
  const b = new Date(`${toStr}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function weeksBetweenInclusive(fromStr, toStr) {
  const days = daysBetweenInclusive(fromStr, toStr);
  return Math.max(1, Math.ceil(days / 7));
}

// GET /events/overview — Tổng quan / thống kê sự kiện
r.get('/overview', async (req, res) => {
  try {
    const sc = resolveEventsCompanyScope(req, res);
    if (!sc.ok) return;
    const {
      date_from: dateFromQ,
      date_to: dateToQ,
      user_id: userId,
      region_id: regionId,
      type: eventType,
      granularity: granularityQ,
    } = req.query;

    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const defaultTo = vnDateKey(now.toISOString()) || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const defaultFrom = `${defaultTo.slice(0, 7)}-01`;

    const dateFrom = (dateFromQ && String(dateFromQ).trim()) || defaultFrom;
    const dateTo = (dateToQ && String(dateToQ).trim()) || defaultTo;
    if (dateFrom > dateTo) {
      return res.status(400).json({ error: 'date_from phải trước hoặc bằng date_to' });
    }

    let companyLeadIds = [];
    if (sc.companyId) {
      companyLeadIds = await fetchAllLeadIdsForCompany(sc.companyId);
    }

    let regionLeadIds = null;
    if (regionId && String(regionId).trim()) {
      let lq = supabase.from('crm_leads').select('id').eq('region_id', String(regionId).trim());
      if (sc.companyId) lq = lq.eq('company_id', sc.companyId);
      const { data: lr, error: lRegErr } = await lq;
      if (lRegErr) throw lRegErr;
      regionLeadIds = new Set((lr || []).map((x) => x.id).filter(Boolean));
    }

    const pageSize = 1000;
    let from = 0;
    const selectCols = 'id, event_type, event_type_id, status, start_time, created_by, assignee_id, lead_id';
    const rawEvents = [];
    for (;;) {
      let q = supabase.from('crm_events').select(selectCols);
      q = applyEventsCompanyFilter(q, sc.companyId, companyLeadIds);
      q = q.gte('start_time', `${dateFrom}T00:00:00+07:00`);
      q = q.lte('start_time', `${dateTo}T23:59:59.999+07:00`);
      if (userId) q = q.or(`created_by.eq.${userId},assignee_id.eq.${userId}`);
      if (eventType) q = q.eq('event_type', eventType);
      if (regionLeadIds) {
        const lids = [...regionLeadIds].slice(0, EVENTS_COMPANY_OR_MAX_IN);
        if (lids.length === 0) {
          return res.json(emptyOverviewPayload(dateFrom, dateTo, granularityQ));
        }
        q = q.in('lead_id', lids);
      }
      q = q.order('start_time', { ascending: true }).range(from, from + pageSize - 1);
      const { data, error } = await q;
      if (error) throw error;
      const chunk = data || [];
      rawEvents.push(...chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }

    const daySpan = daysBetweenInclusive(dateFrom, dateTo);
    let granularity = granularityQ && ['day', 'week', 'month'].includes(granularityQ) ? granularityQ : null;
    if (!granularity) {
      if (daySpan <= 14) granularity = 'day';
      else if (daySpan <= 92) granularity = 'week';
      else granularity = 'month';
    }

    const [{ data: typeRows }, { data: userRows }] = await Promise.all([
      supabase.from('event_types').select('id, name, slug, icon, color').order('sort_order'),
      sc.companyId
        ? supabase.from('users').select('id, full_name, avatar').eq('company_id', sc.companyId).eq('is_active', true)
        : supabase.from('users').select('id, full_name, avatar').eq('is_active', true),
    ]);

    const typeBySlug = {};
    const typeById = {};
    (typeRows || []).forEach((t) => {
      typeBySlug[t.slug] = t;
      typeById[t.id] = t;
    });
    const userById = {};
    (userRows || []).forEach((u) => { userById[u.id] = u; });

    const STATUS_KEYS = ['planned', 'in_progress', 'completed', 'cancelled'];
    const byStatus = {};
    STATUS_KEYS.forEach((s) => { byStatus[s] = 0; });

    const byType = {};
    const byStaff = {};
    const timelineMap = {};
    const staffSeen = new Set();

    const bucketKey = (iso) => {
      if (granularity === 'week') return vnWeekStartKey(iso);
      if (granularity === 'month') return vnMonthKey(iso);
      return vnDateKey(iso);
    };

    const formatBucketLabel = (key) => {
      if (!key) return '';
      if (granularity === 'month') {
        const [y, m] = key.split('-');
        return `T${parseInt(m, 10)}/${y}`;
      }
      const [y, m, d] = key.split('-');
      return `${d}/${m}`;
    };

    for (const ev of rawEvents) {
      const st = ev.status && STATUS_KEYS.includes(ev.status) ? ev.status : 'planned';
      byStatus[st] = (byStatus[st] || 0) + 1;

      const slug = ev.event_type || 'other';
      if (!byType[slug]) {
        const ref = typeBySlug[slug] || (ev.event_type_id && typeById[ev.event_type_id]) || {};
        byType[slug] = {
          slug,
          name: ref.name || slug,
          icon: ref.icon || '📋',
          color: ref.color || '#6B7280',
          count: 0,
        };
      }
      byType[slug].count += 1;

      const bKey = bucketKey(ev.start_time);
      if (bKey) {
        if (!timelineMap[bKey]) timelineMap[bKey] = { bucket: bKey, label: formatBucketLabel(bKey), count: 0 };
        timelineMap[bKey].count += 1;
      }

      const staffIds = new Set();
      if (ev.created_by) staffIds.add(ev.created_by);
      if (ev.assignee_id) staffIds.add(ev.assignee_id);
      staffIds.forEach((uid) => {
        staffSeen.add(uid);
        if (!byStaff[uid]) {
          const u = userById[uid] || {};
          byStaff[uid] = {
            user_id: uid,
            full_name: u.full_name || 'Không rõ',
            avatar: u.avatar || null,
            as_creator: 0,
            as_assignee: 0,
            total: 0,
          };
        }
        if (ev.created_by === uid) byStaff[uid].as_creator += 1;
        if (ev.assignee_id === uid) byStaff[uid].as_assignee += 1;
        byStaff[uid].total += 1;
      });
    }

    const total = rawEvents.length;
    const completed = byStatus.completed || 0;
    const timeline = Object.values(timelineMap).sort((a, b) => a.bucket.localeCompare(b.bucket));
    const byTypeList = Object.values(byType).sort((a, b) => b.count - a.count);
    const byStaffList = Object.values(byStaff).sort((a, b) => b.total - a.total);

    res.json({
      period: { from: dateFrom, to: dateTo, days: daySpan, weeks: weeksBetweenInclusive(dateFrom, dateTo) },
      granularity,
      summary: {
        total,
        planned: byStatus.planned || 0,
        in_progress: byStatus.in_progress || 0,
        completed,
        cancelled: byStatus.cancelled || 0,
        completion_rate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
        avg_per_day: total > 0 ? Math.round((total / daySpan) * 100) / 100 : 0,
        avg_per_week: total > 0 ? Math.round((total / weeksBetweenInclusive(dateFrom, dateTo)) * 100) /  100 : 0,
        unique_staff: staffSeen.size,
      },
      by_status: STATUS_KEYS.map((status) => ({
        status,
        count: byStatus[status] || 0,
      })),
      by_type: byTypeList,
      by_staff: byStaffList,
      timeline,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function emptyOverviewPayload(dateFrom, dateTo, granularityQ) {
  const daySpan = daysBetweenInclusive(dateFrom, dateTo);
  let granularity = granularityQ && ['day', 'week', 'month'].includes(granularityQ) ? granularityQ : 'day';
  if (!granularityQ) {
    if (daySpan <= 14) granularity = 'day';
    else if (daySpan <= 92) granularity = 'week';
    else granularity = 'month';
  }
  return {
    period: { from: dateFrom, to: dateTo, days: daySpan, weeks: weeksBetweenInclusive(dateFrom, dateTo) },
    granularity,
    summary: {
      total: 0, planned: 0, in_progress: 0, completed: 0, cancelled: 0,
      completion_rate: 0, avg_per_day: 0, avg_per_week: 0, unique_staff: 0,
    },
    by_status: ['planned', 'in_progress', 'completed', 'cancelled'].map((status) => ({ status, count: 0 })),
    by_type: [],
    by_staff: [],
    timeline: [],
  };
}

// GET /events/calendar — Calendar view (events in date range)
r.get('/calendar', async (req, res) => {
  try {
    const sc = resolveEventsCompanyScope(req, res);
    if (!sc.ok) return;
    const { month, year, region_id } = req.query; // month: 1-12, year: 2026
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    const startDate = new Date(`${y}-${pad(m)}-01T00:00:00+07:00`).toISOString();
    const endDate = new Date(`${y}-${pad(m)}-${pad(lastDay)}T23:59:59.999+07:00`).toISOString();

    let companyLeadIds = [];
    if (sc.companyId) {
      companyLeadIds = await fetchAllLeadIdsForCompany(sc.companyId);
    }
    let cq = supabase.from('crm_events')
      .select(EVENT_SELECT)
      .gte('start_time', startDate)
      .lte('start_time', endDate);
    cq = applyEventsCompanyFilter(cq, sc.companyId, companyLeadIds);

    if (region_id && String(region_id).trim()) {
      let lq = supabase.from('crm_leads').select('id').eq('region_id', String(region_id).trim());
      if (sc.companyId) lq = lq.eq('company_id', sc.companyId);
      const { data: lr, error: lRegErr } = await lq;
      if (lRegErr) throw lRegErr;
      const lids = (lr || []).map((x) => x.id).filter(Boolean);
      if (lids.length === 0) {
        return res.json([]);
      }
      cq = cq.in('lead_id', lids.slice(0, EVENTS_COMPANY_OR_MAX_IN));
    }
    cq = cq.order('start_time');
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
      start_time: normalizeEventTimestamp(b.start_time),
      end_time: b.end_time != null && b.end_time !== '' ? normalizeEventTimestamp(b.end_time) : null,
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
    if (isCrmSystemAdminUser(req.user) && b.company_id !== undefined && b.company_id !== null && b.company_id !== '') {
      evCompanyId = String(b.company_id).trim() || null;
    } else if (!isCrmSystemAdminUser(req.user)) {
      evCompanyId = req.user?.company_id ? String(req.user.company_id).trim() : null;
    }
    if (!evCompanyId && insert.lead_id) {
      evCompanyId = await resolveLeadCompanyId(insert.lead_id);
    }
    if (insert.lead_id) {
      const leadCid = await resolveLeadCompanyId(insert.lead_id);
      if (!leadCid) return res.status(400).json({ error: 'Lead/deal không gắn công ty — không thể tạo sự kiện' });
      if (evCompanyId && String(leadCid) !== String(evCompanyId)) {
        return res.status(403).json({ error: 'Lead/deal không thuộc công ty của sự kiện' });
      }
      if (!evCompanyId) evCompanyId = leadCid;
    }
    if (!isCrmSystemAdminUser(req.user) && !evCompanyId) {
      return res.status(400).json({ error: 'Thiếu công ty — gắn lead/deal hoặc gán công ty cho tài khoản' });
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
    // Hủy sự kiện (status='cancelled') chỉ cho phép người tạo / admin.
    if (b && b.status === 'cancelled') {
      const canCancel = await assertEventDeletable(req, res, req.params.id);
      if (!canCancel) return;
    }
    const update = { updated_at: new Date().toISOString() };
    const fields = ['title', 'description', 'location', 'start_time', 'end_time',
      'all_day', 'status', 'result', 'event_type', 'event_type_id',
      'lead_id', 'customer_id', 'project_id', 'assignee_id', 'cancel_reason'];
    fields.forEach((f) => {
      if (b[f] === undefined) return;
      if (b[f] === '') {
        update[f] = null;
        return;
      }
      if (f === 'start_time' || f === 'end_time') {
        update[f] = normalizeEventTimestamp(b[f]);
        return;
      }
      update[f] = b[f];
    });
    if (isCrmSystemAdminUser(req.user) && b.company_id !== undefined) {
      update.company_id = b.company_id === '' || b.company_id === null ? null : String(b.company_id);
    }

    if (b.lead_id !== undefined) {
      const newLead = b.lead_id === '' ? null : b.lead_id;
      if (newLead) {
        const leadCid = await resolveLeadCompanyId(newLead);
        if (!leadCid) return res.status(400).json({ error: 'Lead/deal không gắn công ty' });
        if (!isCrmSystemAdminUser(req.user)) {
          update.company_id = leadCid;
        } else {
          const co = update.company_id;
          if (co != null && String(co) !== String(leadCid)) {
            return res.status(403).json({ error: 'Lead/deal không thuộc công ty của sự kiện' });
          }
          if (co == null && b.company_id === undefined) {
            update.company_id = leadCid;
          }
        }
      }
    }

    // If completed, set result
    if (b.status === 'completed' && b.result) update.result = b.result;
    // Khi chuyển status khác cancelled → xóa lý do hủy cũ (nếu user gỡ hủy).
    if (b.status && b.status !== 'cancelled' && b.cancel_reason === undefined) {
      update.cancel_reason = null;
    }

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

    // Notification khi hoàn thành — chỉ user thuộc cùng công ty (theo sự kiện / lead)
    if (b.status === 'completed') {
      try {
        const { data: creator } = await supabase.from('users')
          .select('full_name').eq('id', req.user.userId).single();
        let notifyCompanyId = data.company_id || null;
        if (!notifyCompanyId && data.lead_id) {
          notifyCompanyId = await resolveLeadCompanyId(data.lead_id);
        }
        let uq = supabase.from('users').select('id').eq('is_active', true);
        if (notifyCompanyId) uq = uq.eq('company_id', notifyCompanyId);
        const { data: companyUsers } = await uq;
        const ids = (companyUsers || []).map((u) => u.id);
        if (ids.length) {
          await notifyMultiple(
            req,
            ids,
            'event_completed',
            `✅ Sự kiện hoàn thành: ${data.title}`,
            `${creator?.full_name || 'Ai đó'} đã hoàn thành sự kiện "${data.title}"${data.result ? `: ${data.result}` : ''}`,
            'event', data.id
          );
        }
      } catch (ne) { console.warn('[EVENT] Complete notification error:', ne.message); }
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /events/:id/respond — Xác nhận/Từ chối tham gia
r.put('/:id/respond', async (req, res) => {
  try {
    const ok = await assertEventCompanyAccess(req, res, req.params.id);
    if (!ok) return;
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
    const canDelete = await assertEventDeletable(req, res, req.params.id);
    if (!canDelete) return;
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
    const ok = await assertEventCompanyAccess(req, res, req.params.id);
    if (!ok) return;
    const { data, error } = await supabase.from('crm_event_comments')
      .select('*, user:users(id, full_name, avatar)')
      .eq('event_id', req.params.id).order('created_at');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/:id/comments', async (req, res) => {
  try {
    const ok = await assertEventCompanyAccess(req, res, req.params.id);
    if (!ok) return;
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
    const ok = await assertEventCompanyAccess(req, res, req.params.eventId);
    if (!ok) return;
    const { error } = await supabase.from('crm_event_comments')
      .delete().eq('id', req.params.commentId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
