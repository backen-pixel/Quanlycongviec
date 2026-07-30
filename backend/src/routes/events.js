const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { notifyMultiple } = require('../helpers/notifications');
const { isCrmSystemAdminUser, isCrmCompanyAdminUser } = require('../helpers/crmAccessRoles');
const { isAdminLike, isCompanyScopedAdmin } = require('../helpers/adminRole');

/** Admin chọn công ty qua query (admin tổng, platform_admin, admin tenant — khớp CRM Dashboard). */
function canPickEventsCompanyScope(user) {
  if (isCrmSystemAdminUser(user)) return true;
  return isAdminLike(user) && !isCompanyScopedAdmin(user);
}
const {
  normalizeEventModule,
  assertEventModuleWrite,
  resolveEventModulesQueryFilter,
} = require('../helpers/eventModuleScope');
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
  if (canPickEventsCompanyScope(req.user)) {
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

const EVENTS_LEGACY_LEAD_OR_MAX = 320;
/** Giới hạn số người tạo khi lọc theo khu vực (một mệnh đề `.in`). */
const EVENTS_CREATOR_IN_MAX = 2000;

/** Lead IDs cho OR legacy — chỉ khi công ty nhỏ; công ty lớn chỉ lọc `company_id`. */
async function resolveCompanyLeadIdsForEvents(companyId) {
  const { count, error } = await supabase
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  if (error) throw error;
  if ((count || 0) > EVENTS_LEGACY_LEAD_OR_MAX) return [];
  return fetchAllLeadIdsForCompany(companyId);
}

/**
 * Escape giá trị cho PostgREST `or` / `ilike` (tránh phá cú pháp filter).
 */
function escapeEventsOrFilterValue(s) {
  return String(s || '')
    .replace(/[%_,.()"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Gộp company (legacy OR) + search + người (tạo/phụ trách) thành một filter `or`
 * để không ghi đè lẫn nhau.
 *
 * PostgREST chỉ giữ 1 param `or` — gọi `.or()` lần hai sẽ mất lọc công ty.
 * Công ty nhiều lead: chỉ `.eq('company_id')` — tránh OR URL quá dài gây 5xx.
 * Phải đồng bộ (không async) — builder Supabase là thenable.
 *
 * personIds: khớp `created_by` HOẶC `assignee_id` (người tạo hoặc người phụ trách).
 */
function applyEventsCombinedOrFilters(queryBuilder, {
  companyId = null,
  leadIdsForCompany = null,
  search = null,
  personIds = null,
} = {}) {
  const orGroups = [];

  if (companyId) {
    const leadIds = (leadIdsForCompany || []).filter(Boolean);
    if (!leadIds.length || leadIds.length > EVENTS_LEGACY_LEAD_OR_MAX) {
      queryBuilder = queryBuilder.eq('company_id', companyId);
    } else {
      orGroups.push(`company_id.eq.${companyId},lead_id.in.(${leadIds.join(',')})`);
    }
  }

  const qSearch = escapeEventsOrFilterValue(search);
  if (qSearch) {
    orGroups.push(
      `title.ilike.%${qSearch}%,location.ilike.%${qSearch}%,description.ilike.%${qSearch}%`,
    );
  }

  if (personIds && personIds.length) {
    if (personIds.length === 1) {
      const id = personIds[0];
      orGroups.push(`created_by.eq.${id},assignee_id.eq.${id}`);
    } else {
      const list = personIds.join(',');
      orGroups.push(`created_by.in.(${list}),assignee_id.in.(${list})`);
    }
  }

  if (orGroups.length === 0) return queryBuilder;
  if (orGroups.length === 1) return queryBuilder.or(orGroups[0]);
  // `or=and(or(...),or(...))` → PostgREST đánh giá như AND của các nhóm OR
  return queryBuilder.or(`and(${orGroups.map((g) => `or(${g})`).join(',')})`);
}

/** Khoảng ngày theo VN (+07:00) cho start_time — khớp calendar/overview. */
function eventsDateFromBound(dateFrom) {
  if (!dateFrom) return null;
  const d = String(dateFrom).trim();
  if (!d) return null;
  if (/[T\s]/.test(d) || /[Zz]|[+-]\d{2}:?\d{2}$/.test(d)) return d;
  return `${d}T00:00:00+07:00`;
}
function eventsDateToBound(dateTo) {
  if (!dateTo) return null;
  const d = String(dateTo).trim();
  if (!d) return null;
  if (/[T\s]/.test(d) || /[Zz]|[+-]\d{2}:?\d{2}$/.test(d)) return d;
  return `${d}T23:59:59.999+07:00`;
}

/**
 * Lọc theo người liên quan sự kiện (tạo HOẶC phụ trách) + khu vực của họ (user_company_regions).
 * - user_id → created_by = user HOẶC assignee_id = user
 * - region_id → created_by/assignee ∈ NV được gán khu vực (không phụ thuộc users.company_id)
 * - cả hai → giao: user đã chọn phải thuộc khu vực đã chọn
 * @returns {{ empty: true } | { personIds: string[] | null }}
 */
async function resolveEventPersonFilter({ companyId = null, regionId = null, userId = null } = {}) {
  const uid = userId && String(userId).trim() ? String(userId).trim() : null;
  const rid = regionId && String(regionId).trim() ? String(regionId).trim() : null;

  let regionPersonIds = null;
  if (rid) {
    // Đảm bảo khu vực thuộc đúng công ty đang xem (nếu có scope công ty)
    if (companyId) {
      const { data: regionRow, error: rErr } = await supabase
        .from('company_regions')
        .select('id')
        .eq('id', rid)
        .eq('company_id', companyId)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!regionRow) return { empty: true };
    }

    const { data: links, error } = await supabase
      .from('user_company_regions')
      .select('user_id')
      .eq('region_id', rid);
    if (error) throw error;
    const ids = [...new Set((links || []).map((r) => r.user_id).filter(Boolean).map(String))]
      .slice(0, EVENTS_CREATOR_IN_MAX);
    if (ids.length === 0) return { empty: true };
    regionPersonIds = ids;
  }

  if (uid) {
    if (regionPersonIds && !regionPersonIds.includes(uid)) {
      return { empty: true };
    }
    return { personIds: [uid] };
  }

  if (regionPersonIds) return { personIds: regionPersonIds };
  return { personIds: null };
}

async function fetchMyParticipantEventIds(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('crm_event_participants')
    .select('event_id')
    .eq('user_id', userId);
  if (error) {
    console.warn('[events] participant ids:', error.message);
    return [];
  }
  return [...new Set((data || []).map((r) => String(r.event_id)).filter(Boolean))];
}

async function isEventParticipant(userId, eventId) {
  if (!userId || !eventId) return false;
  const { data } = await supabase
    .from('crm_event_participants')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data?.id;
}

function mergeEventsById(primary, extra) {
  const map = new Map();
  for (const ev of primary || []) {
    if (ev?.id != null) map.set(String(ev.id), ev);
  }
  for (const ev of extra || []) {
    if (ev?.id != null && !map.has(String(ev.id))) map.set(String(ev.id), ev);
  }
  return [...map.values()];
}

async function assertEventCompanyAccess(req, res, eventId) {
  const sc = resolveEventsCompanyScope(req, res);
  if (!sc.ok) return false;
  if (!sc.companyId && canPickEventsCompanyScope(req.user)) return true;
  const { data: row, error } = await supabase.from('crm_events').select('id, company_id, lead_id, module').eq('id', eventId).maybeSingle();
  if (error) throw error;
  if (!row) {
    res.status(404).json({ error: 'Không tìm thấy sự kiện' });
    return false;
  }
  // Người được mời tham gia được xem/xác nhận dù khác công ty / khối module.
  if (await isEventParticipant(req.user.userId, eventId)) return true;
  if (!(await assertEventModuleAccessOnRow(req, res, row))) return false;
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
  lead:crm_leads(id, title, code, type, project_id, customer:customers(id, full_name)),
  customer:customers(id, full_name, phone),
  project:projects(id, name, code),
  event_type_ref:event_types(id, name, slug, icon, color, stage_slug),
  participants:crm_event_participants(id, user_id, status, user:users(id, full_name, avatar))`;

/** SX/VC calendar: gồm event khối SX/VC + loại lắp đặt (hay lưu module=crm khi tạo từ CRM). */
function applyEventsModuleScopeFilter(queryBuilder, moduleFilter, modulesFilter) {
  if (moduleFilter) return queryBuilder.eq('module', moduleFilter);
  if (!modulesFilter?.length) return queryBuilder;
  const hasWorkshop = modulesFilter.some((m) => m === 'production' || m === 'logistics');
  if (hasWorkshop) {
    const mods = modulesFilter.map((m) => String(m).replace(/[(),]/g, '')).filter(Boolean);
    if (!mods.length) return queryBuilder;
    return queryBuilder.or(`module.in.(${mods.join(',')}),event_type.eq.installation`);
  }
  return queryBuilder.in('module', modulesFilter);
}

function normalizeModuleParam(v) {
  return normalizeEventModule(v);
}
function normalizeModulesParam(v) {
  if (v == null) return null;
  const raw = Array.isArray(v) ? v : String(v).split(',');
  const out = [];
  for (const x of raw) {
    const m = normalizeEventModule(x);
    if (m && !out.includes(m)) out.push(m);
  }
  return out.length ? out : null;
}

async function assertEventModuleAccessOnRow(req, res, row) {
  if (!row) return true;
  const mod = normalizeEventModule(row.module) || 'crm';
  const check = await assertEventModuleWrite(req.user, mod);
  if (check.ok) return true;
  res.status(403).json({ error: check.message });
  return false;
}

// GET /events — Feed (mới nhất trước) with filters
r.get('/', async (req, res) => {
  try {
    const sc = resolveEventsCompanyScope(req, res);
    if (!sc.ok) return;
    const { type, status, user_id, lead_id, customer_id, date_from, date_to, search, limit, offset, region_id } = req.query;
    let moduleFilter = normalizeModuleParam(req.query.module);
    let modulesFilter = moduleFilter ? null : normalizeModulesParam(req.query.modules);
    const modScope = await resolveEventModulesQueryFilter(req.user, moduleFilter, modulesFilter);
    if (modScope.error) {
      return res.status(403).json({ error: modScope.error.message });
    }
    moduleFilter = modScope.moduleFilter;
    modulesFilter = modScope.modulesFilter;
    let companyLeadIds = [];
    if (sc.companyId) {
      companyLeadIds = await resolveCompanyLeadIdsForEvents(sc.companyId);
    }
    const personScope = await resolveEventPersonFilter({
      companyId: sc.companyId,
      regionId: region_id,
      userId: user_id,
    });
    if (personScope.empty) {
      return res.json({ events: [], total: 0 });
    }

    let q = supabase.from('crm_events').select(EVENT_SELECT, { count: 'exact' });
    q = applyEventsCombinedOrFilters(q, {
      companyId: sc.companyId,
      leadIdsForCompany: companyLeadIds,
      search,
      personIds: personScope.personIds,
    });

    if (type) q = q.eq('event_type', type);
    if (status) q = q.eq('status', status);
    q = applyEventsModuleScopeFilter(q, moduleFilter, modulesFilter);
    if (lead_id) q = q.eq('lead_id', lead_id);
    if (customer_id) q = q.eq('customer_id', customer_id);
    const fromBound = eventsDateFromBound(date_from);
    const toBound = eventsDateToBound(date_to);
    if (fromBound) q = q.gte('start_time', fromBound);
    if (toBound) q = q.lte('start_time', toBound);

    q = q.order('start_time', { ascending: false })
      .range(parseInt(offset) || 0, (parseInt(offset) || 0) + (parseInt(limit) || 50) - 1);

    let result = await q;
    // Migration 245 chưa chạy — bỏ filter module và thử lại.
    if (result.error && /column.*module.*does not exist|42703/i.test(String(result.error.message || ''))) {
      let q2 = supabase.from('crm_events').select(EVENT_SELECT, { count: 'exact' });
      q2 = applyEventsCombinedOrFilters(q2, {
        companyId: sc.companyId,
        leadIdsForCompany: companyLeadIds,
        search,
        personIds: personScope.personIds,
      });
      if (type) q2 = q2.eq('event_type', type);
      if (status) q2 = q2.eq('status', status);
      if (lead_id) q2 = q2.eq('lead_id', lead_id);
      if (customer_id) q2 = q2.eq('customer_id', customer_id);
      if (fromBound) q2 = q2.gte('start_time', fromBound);
      if (toBound) q2 = q2.lte('start_time', toBound);
      q2 = q2.order('start_time', { ascending: false })
        .range(parseInt(offset) || 0, (parseInt(offset) || 0) + (parseInt(limit) || 50) - 1);
      result = await q2;
    }
    const { data, error, count } = result;
    if (error) throw error;

    let eventsOut = data || [];
    let totalOut = typeof count === 'number' ? count : eventsOut.length;
    const includeAsParticipant = ['1', 'true', 'yes'].includes(String(req.query.include_as_participant || '').toLowerCase());
    if (includeAsParticipant) {
      const myIds = await fetchMyParticipantEventIds(req.user.userId);
      const have = new Set(eventsOut.map((e) => String(e.id)));
      const missing = myIds.filter((id) => !have.has(String(id)));
      if (missing.length) {
        let pq = supabase.from('crm_events').select(EVENT_SELECT).in('id', missing.slice(0, 500));
        if (type) pq = pq.eq('event_type', type);
        if (status) pq = pq.eq('status', status);
        if (lead_id) pq = pq.eq('lead_id', lead_id);
        if (customer_id) pq = pq.eq('customer_id', customer_id);
        if (fromBound) pq = pq.gte('start_time', fromBound);
        if (toBound) pq = pq.lte('start_time', toBound);
        // Không lọc module/company — sự kiện mình được mời (vd. Lấy hàng VC) vẫn hiện trên SX.
        const { data: extra, error: pErr } = await pq;
        if (!pErr && extra?.length) {
          eventsOut = mergeEventsById(eventsOut, extra);
          eventsOut.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
          totalOut = eventsOut.length;
        }
      }
    }

    res.json({ events: eventsOut, total: totalOut, module_filter: moduleFilter });
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
      companyLeadIds = await resolveCompanyLeadIdsForEvents(sc.companyId);
    }

    const personScope = await resolveEventPersonFilter({
      companyId: sc.companyId,
      regionId,
      userId,
    });
    if (personScope.empty) {
      return res.json(emptyOverviewPayload(dateFrom, dateTo, granularityQ));
    }

    const pageSize = 1000;
    let from = 0;
    const selectCols = 'id, event_type, event_type_id, status, start_time, created_by, assignee_id, lead_id';
    const rawEvents = [];
    for (;;) {
      let q = supabase.from('crm_events').select(selectCols);
      q = applyEventsCombinedOrFilters(q, {
        companyId: sc.companyId,
        leadIdsForCompany: companyLeadIds,
        personIds: personScope.personIds,
      });
      q = q.gte('start_time', `${dateFrom}T00:00:00+07:00`);
      q = q.lte('start_time', `${dateTo}T23:59:59.999+07:00`);
      if (eventType) q = q.eq('event_type', eventType);
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
    const { month, year, region_id, type, status, user_id, search } = req.query; // month: 1-12, year: 2026
    let moduleFilter = normalizeModuleParam(req.query.module);
    let modulesFilter = moduleFilter ? null : normalizeModulesParam(req.query.modules);
    const modScope = await resolveEventModulesQueryFilter(req.user, moduleFilter, modulesFilter);
    if (modScope.error) {
      return res.status(403).json({ error: modScope.error.message });
    }
    moduleFilter = modScope.moduleFilter;
    modulesFilter = modScope.modulesFilter;
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    const startDate = new Date(`${y}-${pad(m)}-01T00:00:00+07:00`).toISOString();
    const endDate = new Date(`${y}-${pad(m)}-${pad(lastDay)}T23:59:59.999+07:00`).toISOString();

    let companyLeadIds = [];
    if (sc.companyId) {
      companyLeadIds = await resolveCompanyLeadIdsForEvents(sc.companyId);
    }
    const personScope = await resolveEventPersonFilter({
      companyId: sc.companyId,
      regionId: region_id,
      userId: user_id,
    });
    if (personScope.empty) {
      return res.json([]);
    }

    let cq = supabase.from('crm_events')
      .select(EVENT_SELECT)
      .gte('start_time', startDate)
      .lte('start_time', endDate);
    cq = applyEventsCombinedOrFilters(cq, {
      companyId: sc.companyId,
      leadIdsForCompany: companyLeadIds,
      search,
      personIds: personScope.personIds,
    });

    if (type) cq = cq.eq('event_type', type);
    if (status) cq = cq.eq('status', status);
    cq = applyEventsModuleScopeFilter(cq, moduleFilter, modulesFilter);
    cq = cq.order('start_time');
    let cqRes = await cq;
    if (cqRes.error && /column.*module.*does not exist|42703/i.test(String(cqRes.error.message || ''))) {
      let cq2 = supabase.from('crm_events').select(EVENT_SELECT)
        .gte('start_time', startDate).lte('start_time', endDate);
      cq2 = applyEventsCombinedOrFilters(cq2, {
        companyId: sc.companyId,
        leadIdsForCompany: companyLeadIds,
        search,
        personIds: personScope.personIds,
      });
      if (type) cq2 = cq2.eq('event_type', type);
      if (status) cq2 = cq2.eq('status', status);
      cq2 = cq2.order('start_time');
      cqRes = await cq2;
    }
    const { data, error } = cqRes;
    if (error) throw error;

    let calOut = data || [];
    const includeAsParticipant = ['1', 'true', 'yes'].includes(String(req.query.include_as_participant || '').toLowerCase());
    if (includeAsParticipant) {
      const myIds = await fetchMyParticipantEventIds(req.user.userId);
      const have = new Set(calOut.map((e) => String(e.id)));
      const missing = myIds.filter((id) => !have.has(String(id)));
      if (missing.length) {
        let pq = supabase.from('crm_events').select(EVENT_SELECT)
          .in('id', missing.slice(0, 500))
          .gte('start_time', startDate)
          .lte('start_time', endDate);
        if (type) pq = pq.eq('event_type', type);
        if (status) pq = pq.eq('status', status);
        const { data: extra, error: pErr } = await pq;
        if (!pErr && extra?.length) {
          calOut = mergeEventsById(calOut, extra);
          calOut.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        }
      }
    }

    res.json(calOut);
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
      module: normalizeModuleParam(b.module) || 'crm',
      lead_id: b.lead_id || null,
      customer_id: b.customer_id || null,
      project_id: b.project_id || null,
      assignee_id: b.assignee_id || null,
      created_by: req.user.userId,
    };
    uuidFields.forEach(f => { if (insert[f] === '') insert[f] = null; });

    // Lắp đặt thuộc khối VC/LĐ — tránh lưu module=crm khiến lịch SX/VC lọc mất
    if (String(insert.event_type || '') === 'installation') {
      const explicit = normalizeModuleParam(b.module);
      insert.module = (explicit === 'production' || explicit === 'logistics') ? explicit : 'logistics';
    }

    // Auto-fill customer + project from lead if not provided
    if (insert.lead_id && (!insert.customer_id || !insert.project_id)) {
      const { data: lead } = await supabase.from('crm_leads')
        .select('customer_id, project_id').eq('id', insert.lead_id).single();
      if (lead?.customer_id && !insert.customer_id) insert.customer_id = lead.customer_id;
      if (lead?.project_id && !insert.project_id) insert.project_id = lead.project_id;
    }

    let evCompanyId = null;
    if (canPickEventsCompanyScope(req.user) && b.company_id !== undefined && b.company_id !== null && b.company_id !== '') {
      evCompanyId = String(b.company_id).trim() || null;
    } else if (!canPickEventsCompanyScope(req.user)) {
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
    if (!evCompanyId) {
      return res.status(400).json({
        error: canPickEventsCompanyScope(req.user)
          ? 'Thiếu công ty — chọn công ty trên trang Sự kiện (bộ lọc) hoặc gắn lead/deal trước khi tạo'
          : 'Thiếu công ty — gắn lead/deal hoặc gán công ty cho tài khoản',
      });
    }
    insert.company_id = evCompanyId;

    const modCheck = await assertEventModuleWrite(req.user, insert.module);
    if (!modCheck.ok) {
      return res.status(403).json({ error: modCheck.message });
    }

    let insertRes = await supabase.from('crm_events').insert(insert).select(EVENT_SELECT).single();
    // Migration 245 chưa chạy — bỏ field module và thử lại.
    if (insertRes.error && /column.*module.*does not exist|42703/i.test(String(insertRes.error.message || ''))) {
      const { module: _omitMod, ...legacyInsert } = insert;
      void _omitMod;
      insertRes = await supabase.from('crm_events').insert(legacyInsert).select(EVENT_SELECT).single();
    }
    const { data, error } = insertRes;
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
    if (b.module !== undefined) {
      const m = normalizeModuleParam(b.module);
      if (m) {
        const modCheck = await assertEventModuleWrite(req.user, m);
        if (!modCheck.ok) {
          return res.status(403).json({ error: modCheck.message });
        }
        // Cho phép đổi khối SX ↔ VC/LĐ khi user có quyền ghi khối đích
        // (trước đây chỉ admin — chặn luồng bàn giao Sale/xưởng).
        update.module = m;
      }
    }
    // Đổi loại → lắp đặt: gắn khối VC/LĐ nếu chưa chỉ định production/logistics
    if (String(update.event_type || b.event_type || '') === 'installation' && update.module === undefined) {
      const modCheck = await assertEventModuleWrite(req.user, 'logistics');
      if (modCheck.ok) update.module = 'logistics';
    }
    if (canPickEventsCompanyScope(req.user) && b.company_id !== undefined) {
      update.company_id = b.company_id === '' || b.company_id === null ? null : String(b.company_id);
    }

    if (b.lead_id !== undefined) {
      const newLead = b.lead_id === '' ? null : b.lead_id;
      if (newLead) {
        const leadCid = await resolveLeadCompanyId(newLead);
        if (!leadCid) return res.status(400).json({ error: 'Lead/deal không gắn công ty' });
        if (!canPickEventsCompanyScope(req.user)) {
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

    let updRes = await supabase.from('crm_events').update(update).eq('id', req.params.id).select(EVENT_SELECT).single();
    if (updRes.error && /column.*module.*does not exist|42703/i.test(String(updRes.error.message || ''))) {
      const { module: _om, ...legacyUpdate } = update;
      void _om;
      updRes = await supabase.from('crm_events').update(legacyUpdate).eq('id', req.params.id).select(EVENT_SELECT).single();
    }
    const { data, error } = updRes;
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
