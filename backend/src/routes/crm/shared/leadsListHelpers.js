const { supabase } = require('../../../config/supabase');
const {
  userSeesAllCrmDealsForScope,
  userSeesAllCrmLeadsForScope,
} = require('../../../helpers/crmAccessRoles');
const {
  applyCrmLeadRegionFilterToQuery,
  assertLeadReadableByRegionScope,
  resolveRpcRegionIdsForCrmList,
} = require('../../../helpers/crmRegionScope');
const {
  getDefaultPipelineIdForCompany,
  getPipelineIdForCompanyRegion,
  getStagesByPipelineId,
} = require('../../../helpers/crmTaxonomyCache');
const { attachLeadUserFlagsForList } = require('../../../helpers/crmLeadUserFlags');
const { normalizePipelineStagesList } = require('./pipelineHelpers');
const {
  userIsAdmin,
  scopedAdminCompanyId,
  requireUserCompanyId,
  requireUserCompanyIdResolved,
} = require('./requestScope');
const { defaultKpiLedgerMonthStartYmd } = require('./kpiHelpers');

/** linked_project embed added in migration 76 — included here, stripped by runtime fallback if migration not applied */
const CRM_LEAD_LIST_SELECT_EXTRA = ', linked_project:projects!crm_leads_project_id_fkey(id, code, name, order_date, delivery_date, production_deadline, production_note)';
const CRM_LEAD_REGION_EMBED = ', crm_region:company_regions!crm_leads_region_id_fkey(id, name, code)';
const CRM_LEAD_LIST_SELECT_BASE =
  `*, customer:customers(id, full_name, phone, email, company), stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, pipeline_type, sync_role, order_index), source:crm_sources(id, name, icon), lead_type:crm_lead_types(id, name, color), assignee:users!crm_leads_assigned_to_fkey(id, full_name), lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name), company:companies!crm_leads_company_id_fkey(id, name, short_name)${CRM_LEAD_REGION_EMBED}, sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name)), vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)`;
/** Select tối ưu cho Kanban web/mobile — đủ field thẻ CRM, nhẹ hơn getCrmLeadListSelect ~60%. */
const CRM_LEAD_KANBAN_LITE_SELECT =
  'id, code, title, type, phone, estimated_value, probability, created_at, updated_at, assigned_to, lead_owner_id, stage_id, region_id, company_id, lead_type_id, project_id, stage_entered_at, kanban_deadline_at, kanban_deadline_reason, next_follow_up, expected_close_date, lost_reason, ' +
  'customer:customers(id, full_name, phone, company), ' +
  'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost, counts_as_completed_revenue, sla_days, sync_role, pipeline_type, order_index, default_probability), ' +
  'source:crm_sources(id, name, icon), ' +
  'lead_type:crm_lead_types(id, name, color), ' +
  'assignee:users!crm_leads_assigned_to_fkey(id, full_name), ' +
  'lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name), ' +
  'company:companies!crm_leads_company_id_fkey(id, name, short_name)' +
  CRM_LEAD_REGION_EMBED +
  ', sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name)), vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)' +
  CRM_LEAD_LIST_SELECT_EXTRA;

function resolveCrmLeadsKanbanLite(reqQuery, opts = {}) {
  if (opts.lite === false) return false;
  if (opts.lite === true) return true;
  if (reqQuery?.full === '1' || reqQuery?.full === 'true') return false;
  if (reqQuery?.lite === '1' || reqQuery?.lite === 'true') return true;
  if (reqQuery?.kanban === '1' || reqQuery?.kanban === 'true') return true;
  return false;
}

function resolveCrmLeadsSkipDeadline(reqQuery, opts = {}) {
  if (opts.skipDeadline === true) return true;
  if (opts.skipDeadline === false) return false;
  return reqQuery?.skip_deadline === '1' || reqQuery?.skip_deadline === 'true'
    || reqQuery?.defer_deadline === '1' || reqQuery?.defer_deadline === 'true';
}

/** Parse danh sách UUID từ query `lead_ids` (CSV) — tối đa maxIds. */
function parseLeadIdsCsvQuery(raw, maxIds = 500) {
  if (raw == null || raw === '') return [];
  const parts = String(raw).split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (!/^[0-9a-f-]{36}$/i.test(p)) continue;
    out.push(p);
    if (out.length >= maxIds) break;
  }
  return out;
}
let CRM_LEAD_LIST_SELECT = CRM_LEAD_LIST_SELECT_BASE + CRM_LEAD_LIST_SELECT_EXTRA;
let _crmLeadSelectMigrationChecked = false;
let _vcPipelineStageAvailable = true; // migration 81
let _crmLeadTypeColorAvailable = true; // migration 339

function stripCrmLeadTypeColorFromSelect(selectStr) {
  return String(selectStr || '').replace(
    'lead_type:crm_lead_types(id, name, color)',
    'lead_type:crm_lead_types(id, name)',
  );
}

function isCrmLeadTypeColorMissingError(err) {
  const m = String(err?.message || '');
  return /crm_lead_types.*\bcolor\b|\blead_type\b.*\bcolor\b/i.test(m);
}

async function getCrmLeadListSelect() {
  if (_crmLeadSelectMigrationChecked) {
    let sel = CRM_LEAD_LIST_SELECT;
    if (!_vcPipelineStageAvailable) {
      sel = sel.replace(', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)', '');
    }
    if (!_crmLeadTypeColorAvailable) sel = stripCrmLeadTypeColorFromSelect(sel);
    return sel;
  }
  const { error } = await supabase.from('projects').select('production_deadline').limit(0);
  if (error && error.message?.includes('production_deadline')) {
    CRM_LEAD_LIST_SELECT = CRM_LEAD_LIST_SELECT_BASE;
    console.warn('[crm] Migration 76 not applied — linked_project.production_deadline unavailable');
  }
  // Kiểm tra migration 81 (vc_pipeline_stage_id + FK relationship)
  // Reset về true trước khi check — để re-check sau khi migration đã chạy
  _vcPipelineStageAvailable = true;
  const { error: vcColErr } = await supabase.from('crm_leads').select('vc_pipeline_stage_id').limit(0);
  if (vcColErr && vcColErr.message?.includes('vc_pipeline_stage_id')) {
    _vcPipelineStageAvailable = false;
    console.warn('[crm] Migration 81 not applied — vc_pipeline_stage_id column missing');
  } else if (!vcColErr) {
    // Cột tồn tại, kiểm tra tiếp FK relationship bằng thử join
    const { error: vcRelErr } = await supabase
      .from('crm_leads')
      .select('vc_pipeline_stage:logistics_pipeline_stages(id)')
      .limit(0);
    if (vcRelErr && (vcRelErr.message?.includes('relationship') || vcRelErr.message?.includes('logistics_pipeline_stages'))) {
      _vcPipelineStageAvailable = false;
      console.warn('[crm] Migration 82 not applied — vc_pipeline_stage FK relationship missing. Chạy migration 88 để thêm FK.');
    } else {
      console.log('[crm] vc_pipeline_stage join available ✓');
    }
  }
  const { error: ltColorErr } = await supabase.from('crm_lead_types').select('color').limit(0);
  if (ltColorErr && ltColorErr.message?.includes('color')) {
    _crmLeadTypeColorAvailable = false;
    console.warn('[crm] Migration 339 not applied — crm_lead_types.color unavailable');
  }
  _crmLeadSelectMigrationChecked = true;
  return getCrmLeadListSelect(); // re-call with flag set
}

/** Lead/deal tạo trong N ngày và user chưa mở chi tiết → badge "Mới" */
const CRM_NEW_LEAD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** JSONB đôi khi trả về object hoặc chuỗi JSON — chuẩn hóa thành object phẳng. */
function parseLeadSeenByRaw(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  return {};
}

/** Khóa user_id trong JSONB luôn lowercase để tránh lệch UUID (JWT vs DB). */
function normalizeLeadSeenByKeys(raw) {
  const src = parseLeadSeenByRaw(raw);
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    const kk = String(k).trim().toLowerCase();
    if (kk) out[kk] = v;
  }
  return out;
}

function userHasSeenLeadInSeenBy(rawSeen, userId) {
  const uid = String(userId || '').trim().toLowerCase();
  if (!uid) return false;
  const norm = normalizeLeadSeenByKeys(rawSeen);
  return !!norm[uid];
}

function computeIsNewLeadForUser(lead, userId) {
  if (!userId || !lead?.created_at) return false;
  if (userHasSeenLeadInSeenBy(lead.lead_seen_by, userId)) return false;
  const age = Date.now() - new Date(lead.created_at).getTime();
  if (age < 0 || age > CRM_NEW_LEAD_MAX_AGE_MS) return false;
  return true;
}

/** Trả về object list: bỏ lead_seen_by khỏi JSON, thêm is_new_for_current_user */
function attachLeadNewFlagForList(rows, userId) {
  return mapLeadDisplayPhone(rows).map((l) => {
    const is_new_for_current_user = computeIsNewLeadForUser(l, userId);
    const { lead_seen_by, ...rest } = l;
    return { ...rest, is_new_for_current_user };
  });
}

function mapLeadDisplayPhone(rows) {
  return (rows || []).map((l) => ({
    ...l,
    display_phone:
      l.customer?.phone && String(l.customer.phone).trim() !== ''
        ? l.customer.phone
        : l.phone && String(l.phone).trim() !== ''
          ? l.phone
          : null,
  }));
}

/** Lead gắn Zalo inbox — vẫn hiện Kanban khi lọc «Có SĐT» dù chưa quét được SĐT (riêng Zalo, không áp dụng FB). */
async function loadZaloLinkedLeadIdSet(leadIds) {
  const ids = [...new Set((leadIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return new Set();
  const out = new Set();
  for (let b = 0; b < ids.length; b += 500) {
    const batch = ids.slice(b, b + 500);
    const { data: zaloRows } = await supabase.from('zalo_contacts').select('lead_id').in('lead_id', batch);
    (zaloRows || []).forEach((r) => { if (r.lead_id) out.add(String(r.lead_id)); });
  }
  return out;
}



function isUuidString(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ''));
}

function uuidQueryOrNull(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s || null;
}

/** stage_id (đơn) hoặc stage_ids (UUID cách nhau bởi dấu phẩy) từ query string. */
function parseStageIdsFromQuery(reqQuery) {
  const raw = reqQuery?.stage_ids;
  if (raw != null && raw !== '') {
    const parts = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    const uuids = parts.filter((s) => isUuidString(s));
    if (uuids.length) return uuids;
  }
  const single = uuidQueryOrNull(reqQuery?.stage_id);
  return single && isUuidString(single) ? [single] : [];
}

function applyStageIdFilterToQuery(q, stageIds) {
  if (!stageIds?.length) return q;
  if (stageIds.length === 1) return q.eq('stage_id', stageIds[0]);
  return q.in('stage_id', stageIds);
}

/** Chỉ chấp nhận YYYY-MM-DD — tránh lỗi cast timestamptz trong RPC Postgres */
function sanitizeIsoDateQueryParam(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  console.warn('[crm/leads] Bỏ qua date_from/date_to không đúng ISO (YYYY-MM-DD):', s);
  return null;
}

/**
 * Chuẩn hoá kết quả rpc('crm_leads_page_ids') — tránh 500 khi ids không phải mảng hoặc payload lạ.
 */
function parseCrmLeadsPageRpc(raw) {
  let v = raw;
  if (Array.isArray(raw) && raw.length === 1 && raw[0] && typeof raw[0] === 'object' && Array.isArray(raw[0].ids)) {
    v = raw[0];
  }
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  if (v.total === undefined || v.total === null) return null;
  const total = Number(v.total);
  if (Number.isNaN(total)) return null;
  let ids = v.ids;
  if (!Array.isArray(ids)) {
    if (ids && typeof ids === 'object') ids = Object.values(ids);
    else ids = [];
  }
  ids = ids.map((id) => String(id).trim()).filter(Boolean);
  const seenRpc = new Set();
  ids = ids.filter((id) => {
    if (seenRpc.has(id)) return false;
    seenRpc.add(id);
    return true;
  });
  return { total, ids };
}

/**
 * Gắn `crm_next_open_task_deadline`: ngày hẹn (`deadline`) của **một** NV CRM đang mở
 * (pending/in_progress) **mới nhất** theo `updated_at` → `created_at` → `id`.
 * Chỉ lấy hạn của NV đó (kể cả null); Kanban / view Deadline dùng khi có hẹn, không thì fallback SLA / expected_close_date.
 */
async function attachCrmNextOpenTaskDeadline(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (list.length === 0) return [];
  /** lead_id → { updatedMs, createdMs, idNum, deadlineTs | null } */
  const byLeadNewest = new Map();
  // Giảm từ 400 xuống 200: response Supabase nhỏ hơn → tránh undici reset TLS giữa chừng trên local Windows.
  const chunkSize = 200;
  const idChunks = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize).map((r) => String(r.id)).filter(Boolean);
    if (chunk.length) idChunks.push(chunk);
  }
  const taskRows = (
    await Promise.all(
      idChunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from('crm_tasks')
          .select('id, lead_id, deadline, created_at, updated_at')
          .in('lead_id', chunk)
          .in('status', ['pending', 'in_progress']);
        if (error) {
          console.warn('[crm] attachCrmNextOpenTaskDeadline:', error.message);
          return [];
        }
        return data || [];
      }),
    )
  ).flat();
  for (const t of taskRows) {
      const lid = String(t.lead_id);
      const updatedMs = new Date(t.updated_at || t.created_at || 0).getTime();
      const createdMs = new Date(t.created_at || 0).getTime();
      const idNum = Number(t.id);
      const safeId = Number.isFinite(idNum) ? idNum : 0;
      const prev = byLeadNewest.get(lid);
      const newer =
        !prev ||
        updatedMs > prev.updatedMs ||
        (updatedMs === prev.updatedMs && createdMs > prev.createdMs) ||
        (updatedMs === prev.updatedMs && createdMs === prev.createdMs && safeId > prev.idNum);
      if (!newer) continue;
      let deadlineTs = null;
      if (t.deadline != null && t.deadline !== '') {
        const d = new Date(t.deadline).getTime();
        if (!Number.isNaN(d)) deadlineTs = d;
      }
      byLeadNewest.set(lid, { updatedMs, createdMs, idNum: safeId, deadlineTs });
  }
  return list.map((row) => {
    const newest = byLeadNewest.get(String(row.id));
    const ts = newest?.deadlineTs;
    return {
      ...row,
      crm_next_open_task_deadline: ts != null ? new Date(ts).toISOString() : null,
    };
  });
}

async function fetchCrmLeadsByIdsOrdered(ids, opts = {}) {
  const { skipEnrich = false, lite = false } = opts;
  const raw = Array.isArray(ids) ? ids : [];
  if (raw.length === 0) return [];
  // RPC có thể trả trùng id trong một page → hydrate ra hai row giống id khác stage snapshot → Kanban hai cột.
  const seen = new Set();
  const list = [];
  for (const id of raw) {
    const sid = String(id == null ? '' : id).trim();
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    list.push(sid);
  }
  if (list.length === 0) return [];
  const selectStr = lite ? CRM_LEAD_KANBAN_LITE_SELECT : await getCrmLeadListSelect();
  // Giảm từ 300 xuống 150: payload mỗi chunk nhẹ hơn (~vài MB → vài trăm KB),
  // hạn chế "TypeError: fetch failed" khi local Windows gặp AV/VPN/keep-alive thối.
  const chunkSize = 150;
  const byId = new Map();
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    let { data, error } = await supabase.from('crm_leads').select(selectStr).in('id', chunk);
    if (error && /region|company_regions|crm_leads_region_id/i.test(String(error.message || ''))) {
      const stripped = selectStr.replace(CRM_LEAD_REGION_EMBED, '');
      const r2 = await supabase.from('crm_leads').select(stripped).in('id', chunk);
      data = r2.data;
      error = r2.error;
    }
    if (error && isCrmLeadTypeColorMissingError(error)) {
      _crmLeadTypeColorAvailable = false;
      _crmLeadSelectMigrationChecked = true;
      const stripped = stripCrmLeadTypeColorFromSelect(selectStr);
      console.warn('[crm] Auto-strip crm_lead_types.color embed (migration 339)');
      const r2 = await supabase.from('crm_leads').select(stripped).in('id', chunk);
      data = r2.data;
      error = r2.error;
    }
    if (error) throw error;
    (data || []).forEach((row) => {
      if (row?.id != null) byId.set(String(row.id), row);
    });
  }
  const rows = list.map((id) => byId.get(String(id))).filter(Boolean);
  if (skipEnrich) return rows;
  try {
    const { enrichCrmLeadsWithProductionStaff } = require('../../helpers/productionWorkshopTypeStaff');
    return await enrichCrmLeadsWithProductionStaff(rows);
  } catch (e) {
    console.warn('[crm] enrich production_staff:', e.message);
    return rows;
  }
}

async function hydrateCrmLeadsByIdsWithStaff(raw) {
  return fetchCrmLeadsByIdsOrdered(raw);
}

/** Fallback: dùng .range() — giới hạn parsedLimit dòng để tránh egress lớn. */
async function getCrmLeadsListLegacy(reqQuery, opts = {}) {
  const { assigneeStrict = false, viewerUserId = null, req: scopeReq = null } = opts;
  const stageIds = parseStageIdsFromQuery(reqQuery);
  const {
    assigned_to,
    source_id,
    search,
    limit = 100,
    offset = 0,
    type = 'lead',
    company_id,
    date_from,
    date_to,
    phone_filter,
    lead_type_id,
    referrer_name,
    customer_company,
    pipeline_id,
    next_follow_up_from,
    next_follow_up_to,
    next_follow_up_empty,
  } = reqQuery;
  const referrerNameTrim = String(referrer_name || '').trim();
  const customerCompanyTrim = String(customer_company || '').trim();
  const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 2000);
  const parsedOffset = Math.max(parseInt(offset) || 0, 0);
  const useLite = resolveCrmLeadsKanbanLite(reqQuery, opts);
  const skipDeadline = resolveCrmLeadsSkipDeadline(reqQuery, opts);
  let customerIdsForCompanyFilter = null;
  if (customerCompanyTrim && customerCompanyTrim !== '__none__') {
    const { data: custRows, error: custErr } = await supabase
      .from('customers')
      .select('id')
      .eq('company', customerCompanyTrim);
    if (custErr) throw custErr;
    customerIdsForCompanyFilter = (custRows || []).map((r) => r.id);
    if (!customerIdsForCompanyFilter.length) {
      return {
        data: [],
        total: 0,
        offset: parsedOffset,
        limit: parsedLimit,
        hasMore: false,
        nextOffset: parsedOffset,
      };
    }
  }

  const nfFrom = sanitizeIsoDateQueryParam(next_follow_up_from);
  const nfTo = sanitizeIsoDateQueryParam(next_follow_up_to);
  const nfEmpty =
    next_follow_up_empty === 'true' || next_follow_up_empty === '1' || next_follow_up_empty === true;
  const pipeId = uuidQueryOrNull(pipeline_id);
  const orderByFollowUp = !!(nfFrom || nfTo || nfEmpty);

  const selectStr = useLite ? CRM_LEAD_KANBAN_LITE_SELECT : await getCrmLeadListSelect();
  const applyPipelineFollowUpFilters = (q) => {
    let x = q;
    if (pipeId) x = x.eq('pipeline_id', pipeId);
    if (nfEmpty) x = x.is('next_follow_up', null);
    else {
      if (nfFrom) x = x.gte('next_follow_up', nfFrom);
      if (nfTo) x = x.lte('next_follow_up', nfTo);
    }
    return x;
  };

  const buildBaseQuery = () => {
    let q = supabase
      .from('crm_leads')
      .select(selectStr)
      .eq('type', type)
      .is('parent_lead_id', null)
      .order(orderByFollowUp ? 'next_follow_up' : 'created_at', { ascending: orderByFollowUp });
    q = applyStageIdFilterToQuery(q, stageIds);
    if (assigned_to) {
      if (assigneeStrict) q = q.eq('assigned_to', assigned_to);
      else q = q.or(`assigned_to.eq.${assigned_to},lead_owner_id.eq.${assigned_to}`);
    }
    if (source_id) q = q.eq('source_id', source_id);
    if (company_id) q = q.eq('company_id', company_id);
    if (lead_type_id) q = q.eq('lead_type_id', lead_type_id);
    if (referrerNameTrim) q = q.eq('referrer_name', referrerNameTrim);
    if (customerIdsForCompanyFilter) q = q.in('customer_id', customerIdsForCompanyFilter);
    q = applyPipelineFollowUpFilters(q);
    const df = sanitizeIsoDateQueryParam(date_from);
    const dt = sanitizeIsoDateQueryParam(date_to);
    if (df) q = q.gte('created_at', df);
    if (dt) q = q.lte('created_at', `${dt}T23:59:59.999Z`);
    if (search) q = q.or(`title.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`);
    if (scopeReq) q = applyCrmLeadRegionFilterToQuery(q, scopeReq);
    return q;
  };

  // Chỉ lấy đúng parsedLimit dòng từ parsedOffset, không vòng lặp không giới hạn
  const rows = [];
  const PAGE = Math.min(1000, parsedLimit);
  let currentSelectStr = selectStr;
  for (let fetched = 0, guard = 0; fetched < parsedLimit && guard < 20; guard += 1) {
    const need = Math.min(PAGE, parsedLimit - fetched);
    const from = parsedOffset + fetched;
    let q = supabase
      .from('crm_leads')
      .select(currentSelectStr)
      .eq('type', type)
      .is('parent_lead_id', null)
      .order(orderByFollowUp ? 'next_follow_up' : 'created_at', { ascending: orderByFollowUp });
    q = applyStageIdFilterToQuery(q, stageIds);
    if (assigned_to) {
      if (assigneeStrict) q = q.eq('assigned_to', assigned_to);
      else q = q.or(`assigned_to.eq.${assigned_to},lead_owner_id.eq.${assigned_to}`);
    }
    if (source_id) q = q.eq('source_id', source_id);
    if (company_id) q = q.eq('company_id', company_id);
    if (lead_type_id) q = q.eq('lead_type_id', lead_type_id);
    if (referrerNameTrim) q = q.eq('referrer_name', referrerNameTrim);
    if (customerIdsForCompanyFilter) q = q.in('customer_id', customerIdsForCompanyFilter);
    q = applyPipelineFollowUpFilters(q);
    const df = sanitizeIsoDateQueryParam(date_from);
    const dt = sanitizeIsoDateQueryParam(date_to);
    if (df) q = q.gte('created_at', df);
    if (dt) q = q.lte('created_at', `${dt}T23:59:59.999Z`);
    if (search) q = q.or(`title.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`);
    if (scopeReq) q = applyCrmLeadRegionFilterToQuery(q, scopeReq);
    let { data, error } = await q.range(from, from + need - 1);
    if (error && isVcRelationshipError(error)) {
      // FK chưa có — strip join và retry
      _vcPipelineStageAvailable = false;
      _crmLeadSelectMigrationChecked = false;
      currentSelectStr = currentSelectStr.replace(', vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)', '');
      console.warn('[crm] Auto-strip vc_pipeline_stage join do FK chưa tồn tại trong schema cache');
      ({ data, error } = await q.select(currentSelectStr).range(from, from + need - 1));
    }
    if (error && /region|company_regions|crm_leads_region_id/i.test(String(error.message || ''))) {
      currentSelectStr = currentSelectStr.replace(CRM_LEAD_REGION_EMBED, '');
      console.warn('[crm] Auto-strip crm_region embed (migration 131 / FK)');
      ({ data, error } = await q.select(currentSelectStr).range(from, from + need - 1));
    }
    if (error && isCrmLeadTypeColorMissingError(error)) {
      _crmLeadTypeColorAvailable = false;
      _crmLeadSelectMigrationChecked = true;
      currentSelectStr = stripCrmLeadTypeColorFromSelect(currentSelectStr);
      console.warn('[crm] Auto-strip crm_lead_types.color embed (migration 339)');
      ({ data, error } = await q.select(currentSelectStr).range(from, from + need - 1));
    }
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    fetched += chunk.length;
    if (chunk.length < need) break;
  }

  let result = mapLeadDisplayPhone(rows);
  if (customerCompanyTrim === '__none__') {
    result = result.filter((l) => !String(l.customer?.company || '').trim());
  }
  if (phone_filter === 'has_phone') {
    const zaloIds = await loadZaloLinkedLeadIdSet(result.map((l) => l.id));
    result = result.filter((l) => !!l.display_phone || zaloIds.has(String(l.id)));
  } else if (phone_filter === 'no_phone') {
    result = result.filter((l) => !l.display_phone);
  }
  if (orderByFollowUp) {
    result.sort((a, b) => {
      const na = a.next_follow_up ? new Date(a.next_follow_up).getTime() : Infinity;
      const nb = b.next_follow_up ? new Date(b.next_follow_up).getTime() : Infinity;
      if (na !== nb) return na - nb;
      const ap = a.display_phone ? 1 : 0;
      const bp = b.display_phone ? 1 : 0;
      if (bp !== ap) return bp - ap;
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });
  } else {
    result.sort((a, b) => {
      const ap = a.display_phone ? 1 : 0;
      const bp = b.display_phone ? 1 : 0;
      if (bp !== ap) return bp - ap;
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });
  }

  const total = result.length;
  const page = result.slice(parsedOffset, parsedOffset + parsedLimit);
  if (useLite) {
    let withDeadline = page;
    if (!skipDeadline) withDeadline = await attachCrmNextOpenTaskDeadline(page);
    const withNewFlag = attachLeadNewFlagForList(withDeadline, viewerUserId);
    return {
      data: withNewFlag,
      total,
      offset: parsedOffset,
      limit: parsedLimit,
      hasMore: parsedOffset + page.length < total,
      nextOffset: parsedOffset + page.length,
    };
  }
  const pageWithDeadline = await attachCrmNextOpenTaskDeadline(page);
  const withNewFlag = attachLeadNewFlagForList(pageWithDeadline, viewerUserId);
  const withUserFlags = await attachLeadUserFlagsForList(withNewFlag, viewerUserId);
  let enrichedStaff = withUserFlags;
  try {
    const { enrichCrmLeadsWithProductionStaff } = require('../../helpers/productionWorkshopTypeStaff');
    enrichedStaff = await enrichCrmLeadsWithProductionStaff(withUserFlags);
  } catch (e) {
    console.warn('[crm] enrich production_staff (legacy list):', e.message);
  }
  return {
    data: enrichedStaff,
    total,
    offset: parsedOffset,
    limit: parsedLimit,
    hasMore: parsedOffset + page.length < total,
    nextOffset: parsedOffset + page.length,
  };
}


function parseCrmStageCountsRpc(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const total = Number(v.total);
  if (Number.isNaN(total)) return null;
  const countsObj = v.counts && typeof v.counts === 'object' ? v.counts : {};
  const counts = {};
  for (const [k, val] of Object.entries(countsObj)) {
    if (k === '__none__') continue;
    const n = Number(val);
    if (!Number.isNaN(n)) counts[String(k)] = n;
  }
  return { total, counts };
}

async function invokeCrmLeadsStageCountsRpc(rpcParams) {
  let { data, error } = await supabase.rpc('crm_leads_stage_counts', rpcParams);
  if (error && /crm_leads_stage_counts|does not exist|Could not find|argument/i.test(String(error.message || ''))) {
    const { p_region_ids: _r, p_pipeline_stage_ids: _p, ...noExtras } = rpcParams;
    const r2 = await supabase.rpc('crm_leads_stage_counts', noExtras);
    if (!r2.error) {
      data = r2.data;
      error = null;
    }
  }
  if (error) {
    console.warn('[crm/stage-counts] RPC error:', error.message);
    return null;
  }
  return parseCrmStageCountsRpc(data);
}

function buildCrmLeadsRpcFilterParams(mergedQuery, type, rpcAssigneeStrict, rpcRegionIds) {
  const { assigned_to, source_id, company_id, date_from, date_to, search, phone_filter } = mergedQuery;
  return {
    p_type: type,
    p_assigned_to: uuidQueryOrNull(assigned_to),
    p_source_id: uuidQueryOrNull(source_id),
    p_company_id: uuidQueryOrNull(company_id),
    p_date_from: sanitizeIsoDateQueryParam(date_from),
    p_date_to: sanitizeIsoDateQueryParam(date_to),
    p_search: search || null,
    p_phone_filter: phone_filter || null,
    p_assigned_strict: rpcAssigneeStrict,
    p_region_ids: rpcRegionIds,
  };
}

/** Dashboard `light=1`: stage counts qua RPC — không quét toàn bộ crm_leads. */
async function computeCrmDashboardLightStats(req, type, {
  effectiveCompanyId,
  region_id,
  stages,
  assigned_to_only,
  date_from,
  date_to,
  phone_filter,
}) {
  const mergedQuery = {
    type,
    company_id: effectiveCompanyId || undefined,
    region_id: region_id || undefined,
    assigned_to: assigned_to_only || undefined,
    date_from,
    date_to,
    phone_filter: phone_filter || undefined,
  };
  const dealAssigneeStrict = type === 'deal' && !!uuidQueryOrNull(assigned_to_only);
  const leadAssigneeStrict = type === 'lead' && !!uuidQueryOrNull(assigned_to_only);
  const rpcAssigneeStrict = dealAssigneeStrict || leadAssigneeStrict;
  const rpcRegionIds = resolveRpcRegionIdsForCrmList(req, mergedQuery.region_id);
  const filterParams = buildCrmLeadsRpcFilterParams(mergedQuery, type, rpcAssigneeStrict, rpcRegionIds);
  const stageIds = (stages || []).map((s) => s.id).filter(Boolean);
  const countsParsed = await invokeCrmLeadsStageCountsRpc({
    ...filterParams,
    p_pipeline_stage_ids: stageIds.length ? stageIds : null,
  });
  const counts = countsParsed?.counts || {};
  const totalItems = countsParsed?.total ?? 0;
  const wonStageIdSet = new Set((stages || []).filter((s) => s.is_won).map((s) => String(s.id)));
  let wonCount = 0;
  for (const [sid, n] of Object.entries(counts)) {
    if (wonStageIdSet.has(String(sid))) wonCount += Number(n) || 0;
  }
  const stageStats = (stages || []).map((s) => ({
    ...s,
    count: counts[String(s.id)] || 0,
    value: 0,
    weighted: 0,
  }));
  return { stageStats, totalItems, wonCount, countsParsed };
}

async function resolveCrmLeadsMergedQuery(req, res) {
  const type = req.query.type || 'lead';
  const forcedDealSelf = type === 'deal' && req.user?.userId && !userSeesAllCrmDealsForScope(req.user);
  const forcedLeadSelf = type === 'lead' && req.user?.userId && !userSeesAllCrmLeadsForScope(req.user);
  let mergedQuery =
    forcedDealSelf || forcedLeadSelf ? { ...req.query, assigned_to: req.user.userId } : { ...req.query };
  const sacLeads = scopedAdminCompanyId(req);
  if (sacLeads) {
    mergedQuery = { ...mergedQuery, company_id: sacLeads };
  } else if (!userIsAdmin(req.user?.role)) {
    const cid = await requireUserCompanyIdResolved(req, res);
    if (!cid) return null;
    mergedQuery = { ...mergedQuery, company_id: cid };
  }
  const { assigned_to } = mergedQuery;
  const dealAssigneeStrict = type === 'deal' && (!!uuidQueryOrNull(assigned_to) || forcedDealSelf);
  const leadAssigneeStrict = type === 'lead' && (!!uuidQueryOrNull(assigned_to) || forcedLeadSelf);
  const rpcAssigneeStrict = dealAssigneeStrict || leadAssigneeStrict;
  const rpcRegionIds = resolveRpcRegionIdsForCrmList(req, mergedQuery.region_id);
  return { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds };
}

async function hydrateCrmLeadsRpcPage(parsedRpc, req, parsedOffset, parsedLimit, opts = {}) {
  const { lite = false, skipDeadline = false } = opts;
  const { total, ids } = parsedRpc;
  const hydrated = await fetchCrmLeadsByIdsOrdered(ids, { skipEnrich: lite, lite });
  const windowLen = Array.isArray(ids) ? ids.length : hydrated.length;
  if (lite) {
    let page = attachLeadNewFlagForList(hydrated, req.user?.userId);
    if (!skipDeadline) page = await attachCrmNextOpenTaskDeadline(page);
    return {
      data: page,
      total,
      offset: parsedOffset,
      limit: parsedLimit,
      hasMore: parsedOffset + windowLen < total,
      nextOffset: parsedOffset + windowLen,
    };
  }
  const rows = await attachCrmNextOpenTaskDeadline(hydrated);
  const page = attachLeadNewFlagForList(rows, req.user?.userId);
  const pageWithUserFlags = await attachLeadUserFlagsForList(page, req.user?.userId);
  return {
    data: pageWithUserFlags,
    total,
    offset: parsedOffset,
    limit: parsedLimit,
    hasMore: parsedOffset + windowLen < total,
    nextOffset: parsedOffset + windowLen,
  };
}

async function resolveKanbanStagesForCompany(type, companyId, regionId, req) {
  let effectiveCompanyId = companyId ? String(companyId).trim() : '';
  let effectivePipelineId = null;

  if (effectiveCompanyId) {
    const rid = regionId && String(regionId).trim() ? String(regionId).trim() : '';
    effectivePipelineId = rid
      ? await getPipelineIdForCompanyRegion(effectiveCompanyId, rid)
      : await getDefaultPipelineIdForCompany(effectiveCompanyId);
  } else if (req) {
    const sac = scopedAdminCompanyId(req);
    if (sac) {
      effectivePipelineId = await getDefaultPipelineIdForCompany(sac);
    } else if (!userIsAdmin(req.user?.role)) {
      const { resolveCompanyIdForUser } = require('../../middleware/auth');
      const cid = await resolveCompanyIdForUser(req.user?.userId);
      if (cid) {
        effectiveCompanyId = cid;
        effectivePipelineId = await getDefaultPipelineIdForCompany(cid);
      }
    } else {
      let q = supabase
        .from('crm_pipeline_stages')
        .select('*')
        .eq('is_active', true)
        .eq('pipeline_type', type || 'lead')
        .order('order_index', { ascending: true });
      const { data: rows } = await q;
      return normalizePipelineStagesList(rows || []);
    }
  }

  if (!effectivePipelineId) return [];
  const data = await getStagesByPipelineId(effectivePipelineId, { type: type || null, activeOnly: true });
  return normalizePipelineStagesList(data || []);
}

function crmListUsesLegacyFilters(mergedQuery) {
  const referrerNameQuery = String(mergedQuery.referrer_name || '').trim();
  const customerCompanyQuery = String(mergedQuery.customer_company || '').trim();
  if (uuidQueryOrNull(mergedQuery.lead_type_id) || referrerNameQuery || customerCompanyQuery) return true;
  const legacyFollowUpFrom = sanitizeIsoDateQueryParam(mergedQuery.next_follow_up_from);
  const legacyFollowUpTo = sanitizeIsoDateQueryParam(mergedQuery.next_follow_up_to);
  const legacyFollowUpEmpty =
    mergedQuery.next_follow_up_empty === 'true' || mergedQuery.next_follow_up_empty === '1';
  const legacyPipelineId = uuidQueryOrNull(mergedQuery.pipeline_id);
  return !!(legacyFollowUpFrom || legacyFollowUpTo || legacyFollowUpEmpty || legacyPipelineId);
}

async function fetchCrmLeadsPageViaRpc(req, mergedQuery, type, parsedOffset, parsedLimit, opts = {}) {
  const forcedDealSelf = type === 'deal' && req.user?.userId && !userSeesAllCrmDealsForScope(req.user);
  const forcedLeadSelf = type === 'lead' && req.user?.userId && !userSeesAllCrmLeadsForScope(req.user);
  const dealAssigneeStrict = type === 'deal' && (!!uuidQueryOrNull(mergedQuery.assigned_to) || forcedDealSelf);
  const leadAssigneeStrict = type === 'lead' && (!!uuidQueryOrNull(mergedQuery.assigned_to) || forcedLeadSelf);
  const rpcAssigneeStrict = dealAssigneeStrict || leadAssigneeStrict;
  const rpcRegionIds = resolveRpcRegionIdsForCrmList(req, mergedQuery.region_id);
  const { assigned_to, source_id, search, company_id, date_from, date_to, phone_filter, stage_id } = mergedQuery;
  const rpcParams = {
    p_type: type,
    p_stage_id: uuidQueryOrNull(stage_id),
    p_assigned_to: uuidQueryOrNull(assigned_to),
    p_source_id: uuidQueryOrNull(source_id),
    p_company_id: uuidQueryOrNull(company_id),
    p_date_from: sanitizeIsoDateQueryParam(date_from),
    p_date_to: sanitizeIsoDateQueryParam(date_to),
    p_search: search || null,
    p_phone_filter: phone_filter || null,
    p_limit: parsedLimit,
    p_offset: parsedOffset,
    p_assigned_strict: rpcAssigneeStrict,
    p_region_ids: rpcRegionIds,
  };
  let { data: rpcData, error: rpcError } = await supabase.rpc('crm_leads_page_ids', rpcParams);
  if (rpcError && /crm_leads_page_ids|does not exist|Could not find|argument/i.test(String(rpcError.message || ''))) {
    const { p_region_ids: _reg, ...rpcNoRegion } = rpcParams;
    let r2 = await supabase.rpc('crm_leads_page_ids', rpcNoRegion);
    if (r2.error && /crm_leads_page_ids|does not exist|Could not find/i.test(String(r2.error.message || ''))) {
      const { p_assigned_strict: _s, ...rpcLegacy } = rpcNoRegion;
      r2 = await supabase.rpc('crm_leads_page_ids', rpcLegacy);
    }
    if (!r2.error) {
      rpcData = r2.data;
      rpcError = null;
    }
  }
  const parsedRpc = !rpcError ? parseCrmLeadsPageRpc(rpcData) : null;
  if (!parsedRpc) return null;
  const lite = resolveCrmLeadsKanbanLite(mergedQuery, opts);
  const skipDeadline = resolveCrmLeadsSkipDeadline(mergedQuery, opts);
  return hydrateCrmLeadsRpcPage(parsedRpc, req, parsedOffset, parsedLimit, { lite, skipDeadline });
}

function buildCrmDashboardMinimalKpis(type, totalItems, wonItemCount, totalValue, wonValue, ledgerPeriodStart) {
  if (type === 'lead') {
    return {
      total_leads: totalItems,
      converted_to_deals: 0,
      conversion_rate: 0,
      total_value: totalValue,
      conversion_value: wonValue,
      overdue_tasks: 0,
      kpi_ledger_month_net_sum: 0,
      kpi_ledger_period_start: ledgerPeriodStart,
      deferred: true,
    };
  }
  return {
    total_deals: totalItems,
    won_deals: wonItemCount,
    won_rate: totalItems > 0 ? Math.round(wonItemCount / totalItems * 100) : 0,
    total_value: totalValue,
    won_value: wonValue,
    overdue_tasks: 0,
    kpi_ledger_month_net_sum: 0,
    kpi_ledger_period_start: ledgerPeriodStart,
    deferred: true,
  };
}
module.exports = {
  CRM_LEAD_REGION_EMBED,
  CRM_LEAD_KANBAN_LITE_SELECT,
  resolveCrmLeadsKanbanLite,
  resolveCrmLeadsSkipDeadline,
  parseLeadIdsCsvQuery,
  getCrmLeadListSelect,
  parseLeadSeenByRaw,
  normalizeLeadSeenByKeys,
  userHasSeenLeadInSeenBy,
  computeIsNewLeadForUser,
  attachLeadNewFlagForList,
  mapLeadDisplayPhone,
  loadZaloLinkedLeadIdSet,
  uuidQueryOrNull,
  parseStageIdsFromQuery,
  applyStageIdFilterToQuery,
  sanitizeIsoDateQueryParam,
  parseCrmLeadsPageRpc,
  attachCrmNextOpenTaskDeadline,
  fetchCrmLeadsByIdsOrdered,
  hydrateCrmLeadsByIdsWithStaff,
  getCrmLeadsListLegacy,
  parseCrmStageCountsRpc,
  invokeCrmLeadsStageCountsRpc,
  buildCrmLeadsRpcFilterParams,
  computeCrmDashboardLightStats,
  resolveCrmLeadsMergedQuery,
  hydrateCrmLeadsRpcPage,
  resolveKanbanStagesForCompany,
  crmListUsesLegacyFilters,
  fetchCrmLeadsPageViaRpc,
  buildCrmDashboardMinimalKpis,
};
