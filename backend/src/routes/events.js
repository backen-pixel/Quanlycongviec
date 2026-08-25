const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { notifyMultiple, getCompanyScopedAdminIds } = require('../helpers/notifications');
const { isCrmSystemAdminUser } = require('../helpers/crmAccessRoles');
const { isAdminLike, isCompanyScopedAdmin, isLogisticsAdmin, isProductionAdmin } = require('../helpers/adminRole');

/** Admin chọn công ty qua query (admin tổng, platform_admin, admin tenant — khớp CRM Dashboard). */
function canPickEventsCompanyScope(user) {
  if (isCrmSystemAdminUser(user)) return true;
  return isAdminLike(user) && !isCompanyScopedAdmin(user);
}

/** Admin công ty / module xem đủ lịch; NV thường chỉ thấy sự kiện ops mình phụ trách. */
function canSeeAllCompanyOpsEvents(user) {
  if (!user) return false;
  if (canPickEventsCompanyScope(user)) return true;
  if (isAdminLike(user) || isCompanyScopedAdmin(user)) return true;
  if (isLogisticsAdmin(user) || isProductionAdmin(user)) return true;
  const r = String(user.role || '').toLowerCase();
  return r === 'manager' || r === 'sales_admin';
}

const OPS_ASSIGNEE_EVENT_TYPES = new Set([
  'pickup', 'installation', 'delivery', 'production_finish',
]);

/**
 * NV thường: sự kiện ops (lấy hàng/lắp/giao/hoàn thiện) có assignee
 * → chỉ hiện nếu là assignee / người tạo / participant.
 */
async function filterOpsEventsForResponsibleStaff(user, events) {
  if (!user || canSeeAllCompanyOpsEvents(user)) return events || [];
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return list;
  const myId = String(user.userId || user.id || '');
  if (!myId) return list;
  const myPartIds = new Set(await fetchMyParticipantEventIds(myId));
  return list.filter((ev) => {
    const t = String(ev?.event_type || '').toLowerCase();
    if (!OPS_ASSIGNEE_EVENT_TYPES.has(t)) return true;
    if (!ev?.assignee_id) return true;
    if (String(ev.assignee_id) === myId) return true;
    if (String(ev.created_by || '') === myId) return true;
    if (myPartIds.has(String(ev.id))) return true;
    return false;
  });
}
const {
  normalizeEventModule,
  assertEventModuleWrite,
  resolveEventModulesQueryFilter,
} = require('../helpers/eventModuleScope');
const r = Router();

r.use(auth);

const { normalizeTimestamp: normalizeEventTimestamp } = require('../helpers/normalizeTimestamp');
const {
  forwardGeocode,
  extractLatLngFromMapUrl,
} = require('../helpers/forwardGeocode');

/** Loại sự kiện hiện trên bản đồ khảo sát (mặc định). */
const SURVEY_MAP_EVENT_TYPES = ['site_visit', 'measurement'];

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
 * Phạm vi công ty khi đọc/ghi sự kiện:
 * - Admin hệ thống (không company_id) / platform_admin: có thể chọn ?company_id hoặc xem tất cả.
 * - Mọi tài khoản có company_id (NV, admin công ty, sales_admin…): luôn khóa đúng công ty JWT —
 *   bỏ qua ?company_id client gửi để tránh lộ dữ liệu công ty khác.
 */
function resolveEventsCompanyScope(req, res) {
  const userCid = req.user?.company_id != null && String(req.user.company_id).trim()
    ? String(req.user.company_id).trim()
    : null;

  if (userCid && !canPickEventsCompanyScope(req.user)) {
    return { ok: true, companyId: userCid };
  }
  if (canPickEventsCompanyScope(req.user)) {
    const q = req.query.company_id;
    const id = q && String(q).trim() ? String(q).trim() : null;
    return { ok: true, companyId: id };
  }
  if (!userCid) {
    res.status(400).json({ error: 'Thiếu company_id của user. Gán công ty cho tài khoản hoặc đăng nhập lại.' });
    return { ok: false, companyId: null };
  }
  return { ok: true, companyId: userCid };
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
 * regionLeadIds: lead thuộc khu vực — mặc định OR với personIds; nếu regionLeadAnd thì AND.
 */
function applyEventsCombinedOrFilters(queryBuilder, {
  companyId = null,
  leadIdsForCompany = null,
  search = null,
  personIds = null,
  regionLeadIds = null,
  regionLeadAnd = false,
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

  const personParts = [];
  if (personIds && personIds.length) {
    if (personIds.length === 1) {
      const id = personIds[0];
      personParts.push(`created_by.eq.${id}`, `assignee_id.eq.${id}`);
    } else {
      const list = personIds.join(',');
      personParts.push(`created_by.in.(${list})`, `assignee_id.in.(${list})`);
    }
  }
  const cappedRegionLeads = (regionLeadIds && regionLeadIds.length)
    ? regionLeadIds.slice(0, EVENTS_LEGACY_LEAD_OR_MAX)
    : [];
  if (cappedRegionLeads.length && !regionLeadAnd) {
    personParts.push(`lead_id.in.(${cappedRegionLeads.join(',')})`);
  }
  if (personParts.length) {
    orGroups.push(personParts.join(','));
  }
  if (cappedRegionLeads.length && regionLeadAnd) {
    orGroups.push(`lead_id.in.(${cappedRegionLeads.join(',')})`);
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

/** Loại sự kiện hỗ trợ chọn nhiều ngày (lắp đặt / vận chuyển / lấy hàng). */
const MULTI_DAY_EVENT_TYPES = new Set(['installation', 'delivery', 'pickup']);

/**
 * Chuẩn hoá occurrence_dates → date[] YYYY-MM-DD (sorted unique) hoặc null.
 * @param {unknown} raw
 * @returns {string[]|null}
 */
function normalizeOccurrenceDates(raw) {
  if (raw == null || raw === '') return null;
  const list = Array.isArray(raw) ? raw : [raw];
  const ymds = [...new Set(
    list
      .map((d) => {
        if (d == null) return '';
        if (d instanceof Date && !Number.isNaN(d.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        }
        const s = String(d).trim();
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : '';
      })
      .filter(Boolean),
  )].sort();
  return ymds.length ? ymds : null;
}

/**
 * Từ occurrence_dates + giờ trong start/end → neo start_time/end_time (ngày đầu/cuối).
 */
function applyOccurrenceDatesToInsert(insert, occurrenceDates, bodyStart, bodyEnd) {
  const dates = normalizeOccurrenceDates(occurrenceDates);
  if (!dates || !dates.length) {
    insert.occurrence_dates = null;
    return insert;
  }
  insert.occurrence_dates = dates;
  const first = dates[0];
  const last = dates[dates.length - 1];
  const startIso = normalizeEventTimestamp(bodyStart);
  const endIso = bodyEnd != null && bodyEnd !== '' ? normalizeEventTimestamp(bodyEnd) : null;
  const startHm = startIso
    ? new Date(startIso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
    : '09:00';
  const endHm = endIso
    ? new Date(endIso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
    : startHm;
  insert.start_time = normalizeEventTimestamp(`${first}T${startHm}:00+07:00`);
  insert.end_time = normalizeEventTimestamp(`${last}T${endHm}:00+07:00`);
  return insert;
}

function isOccurrenceDatesColumnMissingError(err) {
  return /column.*occurrence_dates.*does not exist|42703/i.test(String(err?.message || err || ''));
}

/**
 * Lead thuộc khu vực (crm_leads.region_id) — dùng lọc sự kiện theo vùng địa bàn Lead.
 */
async function resolveLeadIdsForRegion(regionId, companyId = null) {
  const rid = regionId && String(regionId).trim() ? String(regionId).trim() : null;
  if (!rid) return [];
  const ids = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    let q = supabase.from('crm_leads').select('id').eq('region_id', rid);
    if (companyId) q = q.eq('company_id', companyId);
    q = q.range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = data || [];
    ids.push(...chunk.map((r) => String(r.id)).filter(Boolean));
    if (chunk.length < pageSize || ids.length >= EVENTS_CREATOR_IN_MAX) break;
    from += pageSize;
  }
  return ids.slice(0, EVENTS_CREATOR_IN_MAX);
}

/**
 * Lọc theo người liên quan sự kiện (tạo HOẶC phụ trách) + khu vực.
 * - user_id → created_by = user HOẶC assignee_id = user
 * - region_id → (created_by/assignee ∈ NV gán khu vực) HOẶC (lead.region_id = khu vực)
 * - cả hai → sự kiện của NV đó trong khu vực (NV thuộc vùng, hoặc sự kiện gắn Lead thuộc vùng)
 * @returns {{ empty: true } | { personIds: string[] | null, regionLeadIds: string[] | null, regionLeadAnd?: boolean }}
 */
async function resolveEventPersonFilter({ companyId = null, regionId = null, userId = null } = {}) {
  const uid = userId && String(userId).trim() ? String(userId).trim() : null;
  const rid = regionId && String(regionId).trim() ? String(regionId).trim() : null;

  let regionPersonIds = null;
  let regionLeadIds = null;
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
    regionPersonIds = ids;
    regionLeadIds = await resolveLeadIdsForRegion(rid, companyId);
    if (!regionPersonIds.length && !regionLeadIds.length) return { empty: true };
  }

  if (uid) {
    if (!rid) return { personIds: [uid], regionLeadIds: null };
    if (regionPersonIds.includes(uid)) {
      // NV thuộc khu vực → mọi sự kiện họ tạo/phụ trách
      return { personIds: [uid], regionLeadIds: null };
    }
    // NV ngoài danh sách vùng: chỉ sự kiện họ liên quan trên Lead thuộc vùng
    if (regionLeadIds.length) {
      return { personIds: [uid], regionLeadIds, regionLeadAnd: true };
    }
    return { empty: true };
  }

  if (rid) {
    return {
      personIds: regionPersonIds.length ? regionPersonIds : null,
      regionLeadIds: regionLeadIds.length ? regionLeadIds : null,
      regionLeadAnd: false,
    };
  }
  return { personIds: null, regionLeadIds: null };
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
  project:projects(id, name, code, vc_notes),
  event_type_ref:event_types(id, name, slug, icon, color, stage_slug),
  participants:crm_event_participants(id, user_id, status, user:users(id, full_name, avatar))`;

/**
 * Lead/deal gắn 1 dự án: crm_leads.project_id + crm_deal_projects.deal_id.
 */
async function resolveLeadIdsForProjectEvents(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return [];
  const [{ data: leadRows }, { data: dealLinkRows }] = await Promise.all([
    supabase.from('crm_leads').select('id').eq('project_id', pid).limit(2000),
    supabase.from('crm_deal_projects').select('deal_id').eq('project_id', pid).limit(2000),
  ]);
  return [...new Set([
    ...(leadRows || []).map((r) => r.id),
    ...(dealLinkRows || []).map((r) => r.deal_id),
  ].filter(Boolean))];
}

/**
 * Lọc sự kiện theo dự án:
 * - project_id: đúng 1 dự án (crm_events.project_id hoặc lead/deal gắn dự án)
 * - project_linked=1: mọi sự kiện gắn dự án (có project_id hoặc lead đã có project)
 * @returns {Promise<{ empty?: boolean, scoped?: boolean }>}
 */
async function applyEventsProjectScopeFilter(queryBuilder, { projectId = null, projectLinked = false } = {}) {
  const pid = projectId ? String(projectId).trim() : '';
  const linked = projectLinked === true
    || ['1', 'true', 'yes'].includes(String(projectLinked || '').toLowerCase());

  if (pid) {
    const leadIds = await resolveLeadIdsForProjectEvents(pid);
    if (leadIds.length) {
      // PostgREST: project_id.eq.X OR lead_id.in.(...)
      // Lưu ý: `.or()` ghi đè param `or` trước đó — caller không được gọi `.or()` sau bước này.
      return {
        q: queryBuilder.or(`project_id.eq.${pid},lead_id.in.(${leadIds.join(',')})`),
        empty: false,
        scoped: true,
      };
    }
    return { q: queryBuilder.eq('project_id', pid), empty: false, scoped: true };
  }

  if (!linked) return { q: queryBuilder, empty: false, scoped: false };

  const { data: leadRows } = await supabase
    .from('crm_leads')
    .select('id')
    .not('project_id', 'is', null)
    .limit(5000);
  const leadIds = [...new Set((leadRows || []).map((r) => r.id).filter(Boolean))];
  if (leadIds.length) {
    return {
      q: queryBuilder.or(`project_id.not.is.null,lead_id.in.(${leadIds.join(',')})`),
      empty: false,
      scoped: true,
    };
  }
  return { q: queryBuilder.not('project_id', 'is', null), empty: false, scoped: true };
}

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
    const projectIdQ = req.query.project_id ? String(req.query.project_id).trim() : '';
    // Lịch theo 1 dự án: không lọc company_id — sự kiện CRM thường thuộc công ty sale,
    // trong khi projects.company_id có thể là xưởng SX (khác công ty).
    let companyLeadIds = [];
    if (sc.companyId && !projectIdQ) {
      companyLeadIds = await resolveCompanyLeadIdsForEvents(sc.companyId);
    }
    const personScope = await resolveEventPersonFilter({
      companyId: projectIdQ ? null : sc.companyId,
      regionId: region_id,
      userId: user_id,
    });
    if (personScope.empty) {
      return res.json({ events: [], total: 0 });
    }

    let q = supabase.from('crm_events').select(EVENT_SELECT, { count: 'exact' });
    q = applyEventsCombinedOrFilters(q, {
      companyId: projectIdQ ? null : sc.companyId,
      leadIdsForCompany: companyLeadIds,
      search,
      personIds: personScope.personIds,
      regionLeadIds: personScope.regionLeadIds,
      regionLeadAnd: !!personScope.regionLeadAnd,
    });

    if (type) q = q.eq('event_type', type);
    if (status) q = q.eq('status', status);
    q = applyEventsModuleScopeFilter(q, moduleFilter, modulesFilter);
    if (lead_id) q = q.eq('lead_id', lead_id);
    if (customer_id) q = q.eq('customer_id', customer_id);

    const projectScope = await applyEventsProjectScopeFilter(q, {
      projectId: projectIdQ || req.query.project_id,
      projectLinked: req.query.project_linked,
    });
    q = projectScope.q;
    if (projectScope.empty) return res.json({ events: [], total: 0 });

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
        companyId: projectIdQ ? null : sc.companyId,
        leadIdsForCompany: companyLeadIds,
        search,
        personIds: personScope.personIds,
      regionLeadIds: personScope.regionLeadIds,
      regionLeadAnd: !!personScope.regionLeadAnd,
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
    // Theo dự án: không merge sự kiện participant ngoài phạm vi (tránh lẫn lịch deal khác).
    if (includeAsParticipant && !projectIdQ) {
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

    eventsOut = projectIdQ
      ? (eventsOut || [])
      : await filterOpsEventsForResponsibleStaff(req.user, eventsOut);
    totalOut = eventsOut.length;

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

    let moduleFilter = normalizeModuleParam(req.query.module);
    let modulesFilter = moduleFilter ? null : normalizeModulesParam(req.query.modules);
    const modScope = await resolveEventModulesQueryFilter(req.user, moduleFilter, modulesFilter);
    if (modScope.error) {
      return res.status(403).json({ error: modScope.error.message });
    }
    moduleFilter = modScope.moduleFilter;
    modulesFilter = modScope.modulesFilter;

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
    const selectCols = 'id, event_type, event_type_id, status, start_time, created_by, assignee_id, lead_id, module';
    const rawEvents = [];
    let skipModuleFilter = false;
    for (;;) {
      let q = supabase.from('crm_events').select(selectCols);
      q = applyEventsCombinedOrFilters(q, {
        companyId: sc.companyId,
        leadIdsForCompany: companyLeadIds,
        personIds: personScope.personIds,
      regionLeadIds: personScope.regionLeadIds,
      regionLeadAnd: !!personScope.regionLeadAnd,
      });
      q = q.gte('start_time', `${dateFrom}T00:00:00+07:00`);
      q = q.lte('start_time', `${dateTo}T23:59:59.999+07:00`);
      if (eventType) q = q.eq('event_type', eventType);
      if (!skipModuleFilter) q = applyEventsModuleScopeFilter(q, moduleFilter, modulesFilter);
      q = q.order('start_time', { ascending: true }).range(from, from + pageSize - 1);
      const { data, error } = await q;
      if (error) {
        if (!skipModuleFilter && /column.*module.*does not exist|42703/i.test(String(error.message || ''))) {
          skipModuleFilter = true;
          from = 0;
          rawEvents.length = 0;
          continue;
        }
        throw error;
      }
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

    // Lấy tên NV theo đúng id xuất hiện trên sự kiện — không lọc company_id/is_active
    // (admin hệ thống thường company_id=null → bị lệch nếu chỉ load users theo company).
    const staffIdSet = new Set();
    for (const ev of rawEvents) {
      if (ev.created_by) staffIdSet.add(String(ev.created_by));
      if (ev.assignee_id) staffIdSet.add(String(ev.assignee_id));
    }
    const staffIdList = [...staffIdSet];
    const userById = {};
    const USER_IN_PAGE = 200;
    const loadStaffUsers = async () => {
      for (let i = 0; i < staffIdList.length; i += USER_IN_PAGE) {
        const chunk = staffIdList.slice(i, i + USER_IN_PAGE);
        const { data: userRows, error: userErr } = await supabase
          .from('users')
          .select('id, full_name, avatar')
          .in('id', chunk);
        if (userErr) throw userErr;
        (userRows || []).forEach((u) => {
          userById[String(u.id)] = u;
        });
      }
    };
    const [{ data: typeRows }] = await Promise.all([
      supabase.from('event_types').select('id, name, slug, icon, color').order('sort_order'),
      loadStaffUsers(),
    ]);

    const typeBySlug = {};
    const typeById = {};
    (typeRows || []).forEach((t) => {
      typeBySlug[t.slug] = t;
      typeById[t.id] = t;
    });

    // Khu vực của NV tạo / phụ trách → phân bổ sự kiện theo khu vực
    const regionsByUserId = {};
    const regionMetaById = {};
    if (staffIdList.length) {
      const REGION_IN_PAGE = 200;
      for (let i = 0; i < staffIdList.length; i += REGION_IN_PAGE) {
        const chunk = staffIdList.slice(i, i + REGION_IN_PAGE);
        const { data: ucRows, error: ucErr } = await supabase
          .from('user_company_regions')
          .select('user_id, region_id')
          .in('user_id', chunk);
        if (ucErr) throw ucErr;
        (ucRows || []).forEach((row) => {
          const uid = String(row.user_id);
          const rid = String(row.region_id);
          if (!regionsByUserId[uid]) regionsByUserId[uid] = new Set();
          regionsByUserId[uid].add(rid);
        });
      }
      const allRegionIds = [...new Set(Object.values(regionsByUserId).flatMap((s) => [...s]))];
      if (allRegionIds.length) {
        let rq = supabase.from('company_regions').select('id, name, company_id').in('id', allRegionIds);
        if (sc.companyId) rq = rq.eq('company_id', sc.companyId);
        const { data: regionRows, error: rgErr } = await rq;
        if (rgErr) throw rgErr;
        const allowed = new Set((regionRows || []).map((r) => String(r.id)));
        (regionRows || []).forEach((r) => {
          regionMetaById[String(r.id)] = { id: String(r.id), name: r.name || 'Khu vực', company_id: r.company_id };
        });
        // Bỏ region ngoài công ty đang lọc khỏi map user
        if (sc.companyId) {
          Object.keys(regionsByUserId).forEach((uid) => {
            const next = new Set([...regionsByUserId[uid]].filter((rid) => allowed.has(rid)));
            regionsByUserId[uid] = next;
          });
        }
      }
    }

    const STATUS_KEYS = ['planned', 'in_progress', 'completed', 'cancelled'];
    const MODULE_META = {
      crm: { name: 'Kinh doanh', icon: '💼', color: '#0EA5E9', order: 1 },
      production: { name: 'Sản xuất', icon: '🏭', color: '#8B5CF6', order: 2 },
      logistics: { name: 'Lắp đặt', icon: '🔧', color: '#F97316', order: 3 },
      general: { name: 'Chung công ty', icon: '🏢', color: '#10B981', order: 4 },
    };
    const byStatus = {};
    STATUS_KEYS.forEach((s) => { byStatus[s] = 0; });

    const byType = {};
    const byStaff = {};
    const byRegion = {};
    const byModule = {};
    const timelineMap = {};
    const staffSeen = new Set();

    const bumpRegion = (rid, patch) => {
      const key = rid || '__none__';
      if (!byRegion[key]) {
        const meta = rid && regionMetaById[rid];
        byRegion[key] = {
          region_id: rid || null,
          name: meta?.name || (rid ? 'Khu vực' : 'Chưa gán khu vực'),
          count: 0,
          as_creator: 0,
          as_assignee: 0,
        };
      }
      if (patch.count) byRegion[key].count += patch.count;
      if (patch.as_creator) byRegion[key].as_creator += patch.as_creator;
      if (patch.as_assignee) byRegion[key].as_assignee += patch.as_assignee;
    };

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

      const modKey = normalizeEventModule(ev.module) || 'crm';
      if (!byModule[modKey]) {
        const meta = MODULE_META[modKey] || { name: modKey, icon: '📋', color: '#94A3B8', order: 99 };
        byModule[modKey] = {
          module: modKey,
          name: meta.name,
          icon: meta.icon,
          color: meta.color,
          order: meta.order,
          count: 0,
          completed: 0,
          planned: 0,
          in_progress: 0,
          cancelled: 0,
        };
      }
      byModule[modKey].count += 1;
      if (st === 'completed') byModule[modKey].completed += 1;
      else if (st === 'planned') byModule[modKey].planned += 1;
      else if (st === 'in_progress') byModule[modKey].in_progress += 1;
      else if (st === 'cancelled') byModule[modKey].cancelled += 1;

      const bKey = bucketKey(ev.start_time);
      if (bKey) {
        if (!timelineMap[bKey]) timelineMap[bKey] = { bucket: bKey, label: formatBucketLabel(bKey), count: 0 };
        timelineMap[bKey].count += 1;
      }

      const staffIds = new Set();
      if (ev.created_by) staffIds.add(String(ev.created_by));
      if (ev.assignee_id) staffIds.add(String(ev.assignee_id));
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
        if (String(ev.created_by || '') === uid) byStaff[uid].as_creator += 1;
        if (String(ev.assignee_id || '') === uid) byStaff[uid].as_assignee += 1;
        byStaff[uid].total += 1;
      });

      // Phân theo khu vực: sự kiện thuộc mọi khu vực của người tạo ∪ người phụ trách (đếm 1 lần / khu vực)
      const regionIdsForEvent = new Set();
      const creatorRegions = ev.created_by ? (regionsByUserId[String(ev.created_by)] || new Set()) : new Set();
      const assigneeRegions = ev.assignee_id ? (regionsByUserId[String(ev.assignee_id)] || new Set()) : new Set();
      creatorRegions.forEach((rid) => regionIdsForEvent.add(rid));
      assigneeRegions.forEach((rid) => regionIdsForEvent.add(rid));
      if (regionIdsForEvent.size === 0) {
        bumpRegion(null, { count: 1 });
        if (ev.created_by) bumpRegion(null, { as_creator: 1 });
        if (ev.assignee_id) bumpRegion(null, { as_assignee: 1 });
      } else {
        regionIdsForEvent.forEach((rid) => {
          bumpRegion(rid, { count: 1 });
          if (ev.created_by && creatorRegions.has(rid)) bumpRegion(rid, { as_creator: 1 });
          if (ev.assignee_id && assigneeRegions.has(rid)) bumpRegion(rid, { as_assignee: 1 });
        });
      }
    }

    const total = rawEvents.length;
    const completed = byStatus.completed || 0;
    const timeline = Object.values(timelineMap).sort((a, b) => a.bucket.localeCompare(b.bucket));
    const byTypeList = Object.values(byType).sort((a, b) => b.count - a.count);
    const byStaffList = Object.values(byStaff).sort((a, b) => b.total - a.total);
    const byRegionList = Object.values(byRegion).sort((a, b) => {
      if (!a.region_id && b.region_id) return 1;
      if (a.region_id && !b.region_id) return -1;
      return b.count - a.count;
    });
    const byModuleList = Object.values(byModule).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return b.count - a.count;
    });

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
        unique_regions: byRegionList.filter((r) => r.region_id).length,
        unique_modules: byModuleList.length,
      },
      by_status: STATUS_KEYS.map((status) => ({
        status,
        count: byStatus[status] || 0,
      })),
      by_type: byTypeList,
      by_staff: byStaffList,
      by_region: byRegionList,
      by_module: byModuleList,
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
      completion_rate: 0, avg_per_day: 0, avg_per_week: 0, unique_staff: 0, unique_regions: 0,
      unique_modules: 0,
    },
    by_status: ['planned', 'in_progress', 'completed', 'cancelled'].map((status) => ({ status, count: 0 })),
    by_type: [],
    by_staff: [],
    by_region: [],
    by_module: [],
    timeline: [],
  };
}

/**
 * GET /events/map — Điểm khảo sát / đo đạc trên bản đồ.
 * Geocode địa chỉ sự kiện (hoặc địa chỉ khách) → lat/lng (cache + Nominatim/Google).
 */
r.get('/map', async (req, res) => {
  try {
    const sc = resolveEventsCompanyScope(req, res);
    if (!sc.ok) return;
    const {
      date_from: dateFromQ,
      date_to: dateToQ,
      user_id: userId,
      region_id: regionId,
      type: eventType,
      types: typesQ,
      status: statusQ,
      limit: limitQ,
    } = req.query;

    let moduleFilter = normalizeModuleParam(req.query.module);
    let modulesFilter = moduleFilter ? null : normalizeModulesParam(req.query.modules);
    const modScope = await resolveEventModulesQueryFilter(req.user, moduleFilter, modulesFilter);
    if (modScope.error) {
      return res.status(403).json({ error: modScope.error.message });
    }
    moduleFilter = modScope.moduleFilter;
    modulesFilter = modScope.modulesFilter;

    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const defaultTo = vnDateKey(now.toISOString()) || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const defaultFrom = `${defaultTo.slice(0, 7)}-01`;
    const dateFrom = (dateFromQ && String(dateFromQ).trim()) || defaultFrom;
    const dateTo = (dateToQ && String(dateToQ).trim()) || defaultTo;
    if (dateFrom > dateTo) {
      return res.status(400).json({ error: 'date_from phải trước hoặc bằng date_to' });
    }

    let typeSlugs = SURVEY_MAP_EVENT_TYPES;
    if (eventType && String(eventType).trim()) {
      typeSlugs = [String(eventType).trim()];
    } else if (typesQ != null && String(typesQ).trim()) {
      typeSlugs = String(typesQ).split(',').map((s) => s.trim()).filter(Boolean);
      if (!typeSlugs.length) typeSlugs = SURVEY_MAP_EVENT_TYPES;
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
      return res.json({
        period: { from: dateFrom, to: dateTo },
        types: typeSlugs,
        points: [],
        stats: { total: 0, with_location: 0, plotted: 0, no_location: 0, geocode_failed: 0 },
      });
    }

    const maxEvents = Math.min(Math.max(parseInt(limitQ, 10) || 200, 1), 400);
    const selectCols = `
      id, title, location, start_time, end_time, status, event_type, event_type_id,
      created_by, assignee_id, lead_id, customer_id,
      assignee:users!crm_events_assignee_id_fkey(id, full_name),
      lead:crm_leads(id, title, code, type),
      customer:customers(id, full_name, phone, address),
      event_type_ref:event_types(id, name, slug, icon, color)
    `;

    let skipModuleFilter = false;
    const rawEvents = [];
    let from = 0;
    const pageSize = 500;
    for (;;) {
      let q = supabase.from('crm_events').select(selectCols);
      q = applyEventsCombinedOrFilters(q, {
        companyId: sc.companyId,
        leadIdsForCompany: companyLeadIds,
        personIds: personScope.personIds,
      regionLeadIds: personScope.regionLeadIds,
      regionLeadAnd: !!personScope.regionLeadAnd,
      });
      q = q.gte('start_time', `${dateFrom}T00:00:00+07:00`);
      q = q.lte('start_time', `${dateTo}T23:59:59.999+07:00`);
      q = q.in('event_type', typeSlugs);
      if (statusQ) q = q.eq('status', statusQ);
      if (!skipModuleFilter) q = applyEventsModuleScopeFilter(q, moduleFilter, modulesFilter);
      q = q.order('start_time', { ascending: false }).range(from, from + pageSize - 1);
      const { data, error } = await q;
      if (error) {
        if (!skipModuleFilter && /column.*module.*does not exist|42703/i.test(String(error.message || ''))) {
          skipModuleFilter = true;
          from = 0;
          rawEvents.length = 0;
          continue;
        }
        throw error;
      }
      const chunk = data || [];
      rawEvents.push(...chunk);
      if (chunk.length < pageSize || rawEvents.length >= maxEvents) break;
      from += pageSize;
    }

    const events = rawEvents.slice(0, maxEvents);
    let noLocation = 0;
    let geocodeFailed = 0;
    const candidates = [];

    for (const ev of events) {
      // Ưu tiên địa chỉ trên sự kiện; fallback địa chỉ khách
      const locText = String(ev.location || '').trim();
      const custAddr = String(ev.customer?.address || '').trim();
      const address = locText || custAddr;
      if (!address) {
        noLocation += 1;
        continue;
      }
      const fromUrl = extractLatLngFromMapUrl(address);
      candidates.push({
        ev,
        address,
        addressSource: locText ? 'event' : 'customer',
        preLatLng: fromUrl,
      });
    }

    // Geocode song song nhẹ (alias VN nhanh; Nominatim giới hạn concurrency)
    const points = [];
    const CONCURRENCY = 6;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const chunk = candidates.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(chunk.map(async (c) => {
        let lat = c.preLatLng?.lat;
        let lng = c.preLatLng?.lng;
        let geoSource = c.preLatLng ? 'map_url' : null;
        let geoAddress = null;
        if (lat == null || lng == null) {
          const hit = await forwardGeocode({ address: c.address, map_url: c.address });
          if (hit) {
            lat = hit.lat;
            lng = hit.lng;
            geoSource = hit.source;
            geoAddress = hit.address || null;
          }
        }
        if (lat == null || lng == null) return { failed: true };
        const typeRef = c.ev.event_type_ref || {};
        return {
          failed: false,
          point: {
            id: c.ev.id,
            lat,
            lng,
            title: c.ev.title,
            location: c.ev.location || null,
            address: geoAddress || c.address,
            address_source: c.addressSource,
            geo_source: geoSource,
            start_time: c.ev.start_time,
            status: c.ev.status,
            event_type: c.ev.event_type,
            event_type_name: typeRef.name || c.ev.event_type,
            event_type_icon: typeRef.icon || '🏠',
            event_type_color: typeRef.color || '#F59E0B',
            assignee_name: c.ev.assignee?.full_name || null,
            customer_name: c.ev.customer?.full_name || null,
            customer_phone: c.ev.customer?.phone || null,
            lead_id: c.ev.lead_id || null,
            lead_code: c.ev.lead?.code || null,
            lead_title: c.ev.lead?.title || null,
            lead_type: c.ev.lead?.type || null,
          },
        };
      }));
      for (const r of settled) {
        if (r.failed) geocodeFailed += 1;
        else points.push(r.point);
      }
    }

    res.json({
      period: { from: dateFrom, to: dateTo },
      types: typeSlugs,
      points,
      stats: {
        total: events.length,
        with_location: candidates.length,
        plotted: points.length,
        no_location: noLocation,
        geocode_failed: geocodeFailed,
      },
    });
  } catch (e) {
    console.error('GET /events/map:', e);
    res.status(500).json({ error: e.message });
  }
});

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

    const projectIdQ = req.query.project_id ? String(req.query.project_id).trim() : '';
    let companyLeadIds = [];
    if (sc.companyId && !projectIdQ) {
      companyLeadIds = await resolveCompanyLeadIdsForEvents(sc.companyId);
    }
    const personScope = await resolveEventPersonFilter({
      companyId: projectIdQ ? null : sc.companyId,
      regionId: region_id,
      userId: user_id,
    });
    if (personScope.empty) {
      return res.json([]);
    }

    let cq = supabase.from('crm_events')
      .select(EVENT_SELECT)
      // start <= cuối tháng; overlap chính xác lọc ở calFiltered (tránh `.or` đè company/project).
      .lte('start_time', endDate);
    cq = applyEventsCombinedOrFilters(cq, {
      companyId: projectIdQ ? null : sc.companyId,
      leadIdsForCompany: companyLeadIds,
      search,
      personIds: personScope.personIds,
      regionLeadIds: personScope.regionLeadIds,
      regionLeadAnd: !!personScope.regionLeadAnd,
    });

    if (type) cq = cq.eq('event_type', type);
    if (status) cq = cq.eq('status', status);
    cq = applyEventsModuleScopeFilter(cq, moduleFilter, modulesFilter);

    const projectScope = await applyEventsProjectScopeFilter(cq, {
      projectId: projectIdQ || req.query.project_id,
      projectLinked: req.query.project_linked,
    });
    cq = projectScope.q;
    if (projectScope.empty) return res.json([]);

    cq = cq.order('start_time');
    let cqRes = await cq;
    if (cqRes.error && /column.*module.*does not exist|42703/i.test(String(cqRes.error.message || ''))) {
      let cq2 = supabase.from('crm_events').select(EVENT_SELECT)
        .lte('start_time', endDate);
      cq2 = applyEventsCombinedOrFilters(cq2, {
        companyId: projectIdQ ? null : sc.companyId,
        leadIdsForCompany: companyLeadIds,
        search,
        personIds: personScope.personIds,
      regionLeadIds: personScope.regionLeadIds,
      regionLeadAnd: !!personScope.regionLeadAnd,
      });
      if (type) cq2 = cq2.eq('event_type', type);
      if (status) cq2 = cq2.eq('status', status);
      cq2 = cq2.order('start_time');
      cqRes = await cq2;
    }
    const { data, error } = cqRes;
    if (error) throw error;

    // Lọc chính xác overlap tháng (VN): single-day chỉ khi start trong tháng;
    // multi-day khi occurrence_dates hoặc [start,end] giao tháng.
    const monthPrefix = `${y}-${pad(m)}`;
    const calFiltered = (data || []).filter((ev) => {
      const occ = Array.isArray(ev.occurrence_dates) ? ev.occurrence_dates : null;
      if (occ && occ.length) {
        return occ.some((d) => String(d).slice(0, 7) === monthPrefix);
      }
      const startMs = new Date(ev.start_time).getTime();
      const endMs = ev.end_time ? new Date(ev.end_time).getTime() : startMs;
      const rangeStart = new Date(startDate).getTime();
      const rangeEnd = new Date(endDate).getTime();
      return startMs <= rangeEnd && endMs >= rangeStart;
    });

    let calOut = calFiltered;
    const includeAsParticipant = ['1', 'true', 'yes'].includes(String(req.query.include_as_participant || '').toLowerCase());
    if (includeAsParticipant && !projectIdQ) {
      const myIds = await fetchMyParticipantEventIds(req.user.userId);
      const have = new Set(calOut.map((e) => String(e.id)));
      const missing = myIds.filter((id) => !have.has(String(id)));
      if (missing.length) {
        let pq = supabase.from('crm_events').select(EVENT_SELECT)
          .in('id', missing.slice(0, 500))
          .lte('start_time', endDate);
        if (type) pq = pq.eq('event_type', type);
        if (status) pq = pq.eq('status', status);
        const { data: extra, error: pErr } = await pq;
        if (!pErr && extra?.length) {
          const monthPrefix2 = `${y}-${pad(m)}`;
          const extraFiltered = extra.filter((ev) => {
            const occ = Array.isArray(ev.occurrence_dates) ? ev.occurrence_dates : null;
            if (occ && occ.length) {
              return occ.some((d) => String(d).slice(0, 7) === monthPrefix2);
            }
            const startMs = new Date(ev.start_time).getTime();
            const endMs = ev.end_time ? new Date(ev.end_time).getTime() : startMs;
            return startMs <= new Date(endDate).getTime() && endMs >= new Date(startDate).getTime();
          });
          calOut = mergeEventsById(calOut, extraFiltered);
          calOut.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        }
      }
    }

    calOut = projectIdQ
      ? calOut
      : await filterOpsEventsForResponsibleStaff(req.user, calOut);
    res.json(calOut);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /events/module-owners — người trên dự án (thành viên + NV xưởng + phụ trách) để mời sự kiện kế hoạch
r.get('/module-owners', async (req, res) => {
  try {
    const leadId = req.query.lead_id ? String(req.query.lead_id).trim() : '';
    const projectId = req.query.project_id ? String(req.query.project_id).trim() : '';
    if (!leadId && !projectId) {
      return res.json({ user_ids: [], owners: { crm: [], sx: [], vc: [] } });
    }
    const { collectProjectEventParticipantIds } = require('../helpers/dealModuleResponsibleUsers');
    const owners = await collectProjectEventParticipantIds({
      leadId: leadId || null,
      projectId: projectId || null,
    });
    res.json({
      user_ids: owners.userIds,
      owners: { crm: owners.crmIds, sx: owners.sxIds, vc: owners.vcIds },
    });
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
      occurrence_dates: null,
    };
    uuidFields.forEach(f => { if (insert[f] === '') insert[f] = null; });

    // Lắp đặt / vận chuyển / lấy hàng: cho phép nhiều ngày (liên tiếp hoặc cách ngày)
    if (MULTI_DAY_EVENT_TYPES.has(String(insert.event_type || '')) && b.occurrence_dates !== undefined) {
      applyOccurrenceDatesToInsert(insert, b.occurrence_dates, b.start_time, b.end_time);
    } else if (Array.isArray(b.occurrence_dates) && b.occurrence_dates.length > 1) {
      applyOccurrenceDatesToInsert(insert, b.occurrence_dates, b.start_time, b.end_time);
    }

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
    if (insertRes.error && isOccurrenceDatesColumnMissingError(insertRes.error)) {
      const { occurrence_dates: _omitOcc, ...noOccInsert } = insert;
      void _omitOcc;
      insertRes = await supabase.from('crm_events').insert(noOccInsert).select(EVENT_SELECT).single();
    }
    const { data, error } = insertRes;
    if (error) throw error;

    // Lắp đặt / duyệt thiết kế / hoàn thiện: tự mời người chịu trách nhiệm CRM + SX + VC/LĐ
    let participantIds = Array.isArray(b.participant_ids) ? b.participant_ids.filter(Boolean).map(String) : [];
    try {
      const { shouldInviteAllModuleOwners, collectProjectEventParticipantIds } = require('../helpers/dealModuleResponsibleUsers');
      if (
        shouldInviteAllModuleOwners(insert.event_type, insert.title)
        && (insert.lead_id || insert.project_id)
      ) {
        const owners = await collectProjectEventParticipantIds({
          leadId: insert.lead_id,
          projectId: insert.project_id,
        });
        participantIds = [...new Set([...participantIds, ...(owners.userIds || [])])];
      }
    } catch (ownerErr) {
      console.warn('[events] module owners:', ownerErr.message);
    }

    // Add participants
    if (participantIds.length) {
      const parts = participantIds.map(uid => ({
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
      const notifyIds = new Set(participantIds);
      if (insert.assignee_id) notifyIds.add(insert.assignee_id);
      const eventModule = normalizeEventModule(insert.module || full?.module) || 'crm';
      const ecoKey = eventModule === 'production' || eventModule === 'logistics' ? eventModule : 'crm';

      if (notifyIds.size) await notifyMultiple(
        req,
        [...notifyIds],
        'event_created',
        `${icon} Sự kiện mới: ${full.title}`,
        `${creatorName} tạo sự kiện "${full.title}" vào ${timeStr}${insert.location ? ` tại ${insert.location}` : ''}`,
        'event',
        full.id,
        {
          event_type: insert.event_type,
          lead_id: insert.lead_id,
          module: eventModule,
          ecosystem_module_key: ecoKey,
          company_id: insert.company_id || full?.company_id || null,
        }
      );
    } catch (notifErr) {
      console.warn('[EVENT] Notification error:', notifErr.message);
    }

    emitCalendarEventChanged(req, full || data, 'created');
    try {
      const { syncProjectInstallDateFromInstallationEvent } = require('../helpers/createPlannedVcLdEvents');
      await syncProjectInstallDateFromInstallationEvent(full || data);
    } catch (syncErr) {
      console.warn('[events] sync install deadline:', syncErr.message);
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
    if (b.occurrence_dates !== undefined) {
      const dates = normalizeOccurrenceDates(b.occurrence_dates);
      update.occurrence_dates = dates;
      if (dates && dates.length) {
        applyOccurrenceDatesToInsert(update, dates, b.start_time ?? update.start_time, b.end_time ?? update.end_time);
      }
    }
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
    if (updRes.error && isOccurrenceDatesColumnMissingError(updRes.error)) {
      const { occurrence_dates: _oo, ...noOcc } = update;
      void _oo;
      updRes = await supabase.from('crm_events').update(noOcc).eq('id', req.params.id).select(EVENT_SELECT).single();
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

    // Notification khi hoàn thành — chỉ người liên quan + Admin công ty (không broadcast cả công ty)
    if (b.status === 'completed') {
      try {
        const { data: creator } = await supabase.from('users')
          .select('full_name').eq('id', req.user.userId).single();
        const notifyIds = new Set();
        if (data.assignee_id) notifyIds.add(data.assignee_id);
        if (data.created_by) notifyIds.add(data.created_by);
        try {
          const { data: parts } = await supabase
            .from('crm_event_participants')
            .select('user_id')
            .eq('event_id', data.id);
          (parts || []).forEach((p) => { if (p?.user_id) notifyIds.add(p.user_id); });
        } catch (_) { /* ignore */ }
        const notifyCompanyId = data.company_id
          || (data.lead_id ? await resolveLeadCompanyId(data.lead_id) : null);
        if (notifyCompanyId) {
          const adminIds = await getCompanyScopedAdminIds(notifyCompanyId);
          adminIds.forEach((id) => notifyIds.add(id));
        }
        notifyIds.delete(req.user.userId);
        const eventModule = normalizeEventModule(data.module) || 'crm';
        const ecoKey = eventModule === 'production' || eventModule === 'logistics' ? eventModule : 'crm';
        const ids = [...notifyIds];
        if (ids.length) {
          await notifyMultiple(
            req,
            ids,
            'event_completed',
            `✅ Sự kiện hoàn thành: ${data.title}`,
            `${creator?.full_name || 'Ai đó'} đã hoàn thành sự kiện "${data.title}"${data.result ? `: ${data.result}` : ''}`,
            'event',
            data.id,
            {
              event_type: data.event_type,
              lead_id: data.lead_id || null,
              module: eventModule,
              ecosystem_module_key: ecoKey,
              company_id: notifyCompanyId || null,
            },
          );
        }
      } catch (ne) { console.warn('[EVENT] Complete notification error:', ne.message); }
    }

    emitCalendarEventChanged(req, data, 'updated');
    try {
      const { syncProjectInstallDateFromInstallationEvent } = require('../helpers/createPlannedVcLdEvents');
      await syncProjectInstallDateFromInstallationEvent(data);
    } catch (syncErr) {
      console.warn('[events] sync install deadline:', syncErr.message);
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
    emitCalendarEventChanged(req, { id: req.params.id, company_id: req.user?.company_id || null }, 'updated');
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
    const { data: existingEv } = await supabase
      .from('crm_events')
      .select('id, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    const { error } = await supabase.from('crm_events').delete().eq('id', req.params.id);
    if (error) throw error;
    emitCalendarEventChanged(req, existingEv || { id: req.params.id }, 'deleted');
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

function emitCalendarEventChanged(req, eventRow, action) {
  try {
    const io = req.app?.get?.('io');
    if (!io) return;
    const { emitScoped } = require('../helpers/socketEmit');
    emitScoped(io, {
      companyId: eventRow?.company_id || req.user?.company_id || null,
    }, 'calendar:event_changed', {
      event_id: eventRow?.id || null,
      company_id: eventRow?.company_id || null,
      action: action || 'updated',
    });
  } catch (_) { /* ignore */ }
}

module.exports = r;
