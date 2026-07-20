/**
 * AI Báo cáo công ty — tool functions cho OpenAI function-calling.
 * Mọi query read-only qua Supabase service key.
 */

const { supabase } = require('../config/supabase');
const config = require('../config');

const VN_TZ = 'Asia/Ho_Chi_Minh';
const AI_BOT_USER_ID = '00000000-0000-0000-0000-0000000000a1';

function leadDetailUrl(leadId) {
  if (!leadId || !config.frontendUrl) return null;
  return `${config.frontendUrl}/crm/leads/${leadId}`;
}

function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString('vi-VN');
}

function vnDateYmd(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Chuyển time_scope → { from_iso, to_iso, label_vn } */
function resolveTimeRange(scope, daysOffset = 0) {
  const todayStr = vnDateYmd();
  const todayStart = new Date(`${todayStr}T00:00:00+07:00`);

  let from;
  let to;
  let label;

  switch (scope) {
    case 'yesterday': {
      const y = new Date(todayStart);
      y.setDate(y.getDate() - 1);
      const yStr = vnDateYmd(y);
      from = new Date(`${yStr}T00:00:00+07:00`);
      to = new Date(`${yStr}T23:59:59.999+07:00`);
      label = `hôm qua (${new Date(y).toLocaleDateString('vi-VN')})`;
      break;
    }
    case 'last_7d': {
      from = new Date(todayStart);
      from.setDate(from.getDate() - 6);
      to = new Date();
      label = '7 ngày qua';
      break;
    }
    case 'last_30d': {
      from = new Date(todayStart);
      from.setDate(from.getDate() - 29);
      to = new Date();
      label = '30 ngày qua';
      break;
    }
    case 'this_month': {
      // Lấy ngày đầu tháng hiện tại theo VN
      const [yy, mm] = todayStr.split('-');
      from = new Date(`${yy}-${mm}-01T00:00:00+07:00`);
      to = new Date();
      label = `tháng ${parseInt(mm, 10)}/${yy}`;
      break;
    }
    case 'last_month': {
      const [yy, mm] = todayStr.split('-');
      const yInt = parseInt(yy, 10);
      const mInt = parseInt(mm, 10);
      const prevM = mInt === 1 ? 12 : mInt - 1;
      const prevY = mInt === 1 ? yInt - 1 : yInt;
      const lastDay = new Date(prevY, prevM, 0).getDate(); // ngày cuối tháng prev
      from = new Date(`${prevY}-${String(prevM).padStart(2, '0')}-01T00:00:00+07:00`);
      to = new Date(`${prevY}-${String(prevM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999+07:00`);
      label = `tháng ${prevM}/${prevY}`;
      break;
    }
    case 'custom': {
      const off = Math.max(0, parseInt(daysOffset, 10) || 0);
      const d = new Date(todayStart);
      d.setDate(d.getDate() - off);
      const dStr = vnDateYmd(d);
      from = new Date(`${dStr}T00:00:00+07:00`);
      to = off === 0 ? new Date() : new Date(`${dStr}T23:59:59.999+07:00`);
      label = off === 0 ? 'hôm nay' : `${off} ngày trước (${new Date(d).toLocaleDateString('vi-VN')})`;
      break;
    }
    case 'today':
    default: {
      from = todayStart;
      to = new Date();
      label = `hôm nay (${new Date().toLocaleDateString('vi-VN')})`;
      break;
    }
  }

  return {
    from_iso: from.toISOString(),
    to_iso: to.toISOString(),
    label_vn: label,
    scope: scope || 'today',
  };
}

async function loadSchedule(scheduleId) {
  if (!scheduleId) return null;
  const { data } = await supabase
    .from('ai_chat_bot_schedules')
    .select('*')
    .eq('id', scheduleId)
    .maybeSingle();
  return data;
}

/**
 * Suy ra danh sách user_id thuộc phạm vi schedule:
 *   0) personal_recipient_user_id (override từ context, vd DM 1-1) → chỉ user đó
 *   1) user_whitelist → dùng đúng
 *   2) department_whitelist → query users theo department_id
 *   3) cả 3 NULL → trả null (= không giới hạn theo nhân viên)
 */
async function resolveAssigneeIds({
  schedule_id: scheduleId,
  user_whitelist: userWl,
  department_whitelist: deptWl,
  personal_recipient_user_id: personalUid,
  user_filter_ids: filterIds,
} = {}) {
  // user_filter_ids — GPT truyền khi user hỏi về NV cụ thể (override mọi whitelist)
  if (Array.isArray(filterIds) && filterIds.length) return filterIds.map(String);
  if (personalUid) return [String(personalUid)];
  if (Array.isArray(userWl) && userWl.length) return [...userWl];
  if (Array.isArray(deptWl) && deptWl.length) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .in('department_id', deptWl)
      .eq('is_active', true);
    return (data || []).map((u) => u.id);
  }
  if (scheduleId) {
    const sched = await loadSchedule(scheduleId);
    if (Array.isArray(sched?.user_whitelist) && sched.user_whitelist.length) {
      return [...sched.user_whitelist];
    }
    if (Array.isArray(sched?.department_whitelist) && sched.department_whitelist.length) {
      const { data } = await supabase
        .from('users')
        .select('id')
        .in('department_id', sched.department_whitelist)
        .eq('is_active', true);
      return (data || []).map((u) => u.id);
    }
  }
  return null;
}

/**
 * Enrich user rows với department + company + regions.
 * Trả về Map<userId, { department, company, regions[] }>.
 */
async function loadUserOrgContext(userRows) {
  const out = new Map();
  if (!userRows?.length) return out;

  const deptIds = [...new Set(userRows.map((u) => u.department_id).filter(Boolean))];
  const directCompanyIds = userRows.map((u) => u.company_id).filter(Boolean);
  const userIds = userRows.map((u) => u.id).filter(Boolean);

  const deptMap = new Map();
  if (deptIds.length) {
    const { data: depts } = await supabase
      .from('departments')
      .select('id, name, color, company_id')
      .in('id', deptIds);
    (depts || []).forEach((d) => deptMap.set(d.id, d));
  }

  const companyIds = [
    ...new Set([
      ...directCompanyIds,
      ...[...deptMap.values()].map((d) => d.company_id).filter(Boolean),
    ]),
  ];
  const companyMap = new Map();
  if (companyIds.length) {
    const { data: comps } = await supabase
      .from('companies')
      .select('id, name, short_name')
      .in('id', companyIds);
    (comps || []).forEach((c) => companyMap.set(c.id, c));
  }

  // Regions (user_company_regions là M-N user ↔ region)
  const regionLinkMap = new Map();
  let regionsById = new Map();
  if (userIds.length) {
    try {
      const { data: links } = await supabase
        .from('user_company_regions')
        .select('user_id, region_id')
        .in('user_id', userIds);
      const regionIds = [...new Set((links || []).map((l) => l.region_id).filter(Boolean))];
      if (regionIds.length) {
        const { data: regions } = await supabase
          .from('company_regions')
          .select('id, name, code, company_id')
          .in('id', regionIds);
        regionsById = new Map((regions || []).map((r) => [r.id, r]));
      }
      for (const l of links || []) {
        if (!regionLinkMap.has(l.user_id)) regionLinkMap.set(l.user_id, []);
        const r = regionsById.get(l.region_id);
        if (r) regionLinkMap.get(l.user_id).push(r);
      }
    } catch {
      /* bảng có thể chưa migrate — bỏ qua */
    }
  }

  for (const u of userRows) {
    const dept = u.department_id ? deptMap.get(u.department_id) : null;
    const cid = u.company_id || dept?.company_id || null;
    const company = cid ? companyMap.get(cid) : null;
    const regions = regionLinkMap.get(u.id) || [];
    out.set(u.id, {
      department: dept
        ? { id: dept.id, name: dept.name, color: dept.color || null }
        : null,
      company: company
        ? { id: company.id, name: company.name, short_name: company.short_name }
        : (cid ? { id: cid, name: null, short_name: null } : null),
      effective_company_id: cid,
      regions: regions.map((r) => ({ id: r.id, name: r.name, code: r.code, company_id: r.company_id })),
    });
  }
  return out;
}

/** Tra cứu user theo tên gần đúng (full_name ILIKE). Trả mảng các ứng viên có org context đầy đủ. */
async function findUsersByName({ name } = {}) {
  if (!name || !String(name).trim()) return { matches: [] };
  const term = String(name).trim().replace(/[,]/g, ' ');
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, phone, role, position, department_id, company_id, is_active')
    .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
    .eq('is_active', true)
    .limit(20);
  if (error) return { matches: [], error: error.message };

  const ctxMap = await loadUserOrgContext(data || []);

  return {
    matches: (data || []).map((u) => {
      const ctx = ctxMap.get(u.id) || {};
      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        position: u.position,
        department_id: u.department_id,
        department_name: ctx.department?.name || null,
        company_id: ctx.effective_company_id || null,
        company_name: ctx.company?.name || null,
        company_short_name: ctx.company?.short_name || null,
        regions: ctx.regions || [],
        effective_company_id: ctx.effective_company_id || null,
      };
    }),
  };
}

/** Lấy user_id duy nhất khác bot trong direct group (DM 1-1). Trả null nếu không phải DM. */
async function getDmRecipientUserId(groupId) {
  if (!groupId) return null;
  const { data: group } = await supabase
    .from('messenger_groups')
    .select('id, is_direct')
    .eq('id', groupId)
    .maybeSingle();
  if (!group?.is_direct) return null;
  const { data: members } = await supabase
    .from('messenger_group_members')
    .select('user_id')
    .eq('group_id', groupId);
  const others = (members || [])
    .map((m) => String(m.user_id))
    .filter((uid) => uid && uid !== AI_BOT_USER_ID);
  return others[0] || null;
}

/** Danh sách công ty trong phạm vi schedule. Auto thu hẹp về công ty mà NV trong whitelist
 *  đang làm việc — nếu admin chỉ chọn NV mà không chọn công ty, menu chỉ liệt kê đúng
 *  công ty có data liên quan thay vì tất cả. */
/** Danh sách phòng ban của 1 công ty (kèm số NV active). */
async function listDepartmentsInCompany({ company_id: companyId, search } = {}) {
  if (!companyId) return { error: 'Thiếu company_id', departments: [] };
  let q = supabase
    .from('departments')
    .select('id, name, color, is_active')
    .eq('company_id', companyId)
    .order('name');
  if (search) q = q.ilike('name', `%${search}%`);
  const { data: depts, error } = await q;
  if (error) return { error: error.message, departments: [] };

  const ids = (depts || []).map((d) => d.id);
  const counts = new Map();
  if (ids.length) {
    const { data: users } = await supabase
      .from('users')
      .select('department_id, is_active')
      .in('department_id', ids)
      .neq('is_active', false);
    for (const u of users || []) {
      counts.set(u.department_id, (counts.get(u.department_id) || 0) + 1);
    }
  }
  return {
    company_id: companyId,
    count: depts?.length || 0,
    departments: (depts || []).map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color,
      is_active: d.is_active,
      active_user_count: counts.get(d.id) || 0,
    })),
  };
}

async function listCompaniesInScope({ schedule_id: scheduleId, company_whitelist: whitelistOverride, personal_recipient_user_id: personalUid } = {}) {
  let whitelist = whitelistOverride;
  if (scheduleId && whitelist === undefined) {
    const sched = await loadSchedule(scheduleId);
    whitelist = sched?.company_whitelist || null;
  }

  let q = supabase
    .from('companies')
    .select('id, name, short_name')
    .eq('is_active', true)
    .order('short_name', { nullsFirst: false });

  if (Array.isArray(whitelist) && whitelist.length) {
    q = q.in('id', whitelist);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let companies = data || [];

  // Auto narrow: nếu chưa whitelist company nhưng có whitelist NV → lọc về cty có NV đó
  if (!(Array.isArray(whitelist) && whitelist.length)) {
    const assigneeIds = await resolveAssigneeIds({ schedule_id: scheduleId, personal_recipient_user_id: personalUid });
    if (Array.isArray(assigneeIds) && assigneeIds.length) {
      const { data: scopedLeads } = await supabase
        .from('crm_leads')
        .select('company_id')
        .in('assigned_to', assigneeIds)
        .not('company_id', 'is', null);
      const scopedCompanyIds = new Set((scopedLeads || []).map((l) => l.company_id));
      if (scopedCompanyIds.size) {
        companies = companies.filter((c) => scopedCompanyIds.has(c.id));
      }
    }
  }

  return companies.map((c, idx) => ({
    index: idx + 1,
    id: c.id,
    name: c.name,
    short_name: c.short_name || c.name,
  }));
}

const LEAD_SELECT = `
  id, code, title, type, company_id, assigned_to, created_at, actual_close_date,
  expected_close_date, estimated_value,
  stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, is_won, is_lost, pipeline_type, canonical_slug)
`;

const EMPLOYEE_LEAD_SELECT = `
  id, code, title, type, company_id, assigned_to, created_at, actual_close_date,
  expected_close_date, estimated_value, stage_id,
  stage:crm_pipeline_stages!crm_leads_stage_id_fkey(
    id, name, is_won, is_lost, pipeline_type, canonical_slug, order_index, pipeline_id, deal_report_bucket
  )
`;

/** Lead tạo TRONG KỲ (cho new_leads). Có filter created_at → an toàn dưới 1000. */
async function fetchLeadsCreatedInRange(companyId, fromIso, toIso, assigneeIds = null) {
  let q = supabase
    .from('crm_leads')
    .select(LEAD_SELECT)
    .eq('company_id', companyId)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (Array.isArray(assigneeIds) && assigneeIds.length) q = q.in('assigned_to', assigneeIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/** Lead CLOSE TRONG KỲ (cho won/lost). actual_close_date là DATE (theo lịch VN). */
async function fetchLeadsClosedInRange(companyId, fromIso, toIso, assigneeIds = null) {
  const fromYmd = vnDateYmd(new Date(fromIso));
  const toYmd = vnDateYmd(new Date(toIso));
  let q = supabase
    .from('crm_leads')
    .select(LEAD_SELECT)
    .eq('company_id', companyId)
    .gte('actual_close_date', fromYmd)
    .lte('actual_close_date', toYmd)
    .limit(2000);
  if (Array.isArray(assigneeIds) && assigneeIds.length) q = q.in('assigned_to', assigneeIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/** Count lead đang mở (actual_close_date IS NULL) — dùng count head=true để không bị limit 1000 */
async function countOpenLeads(companyId, assigneeIds = null) {
  let q = supabase
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('actual_close_date', null);
  if (Array.isArray(assigneeIds) && assigneeIds.length) q = q.in('assigned_to', assigneeIds);
  const { count } = await q;
  return count || 0;
}

/** Lead đang mở mà OVERDUE (expected_close_date < today). Dùng cho getOverdueBreakdown. */
async function fetchOpenOverdueLeads(companyId, todayYmd, assigneeIds = null) {
  let q = supabase
    .from('crm_leads')
    .select(LEAD_SELECT)
    .eq('company_id', companyId)
    .is('actual_close_date', null)
    .not('expected_close_date', 'is', null)
    .lt('expected_close_date', todayYmd)
    .order('expected_close_date', { ascending: true })
    .limit(500);
  if (Array.isArray(assigneeIds) && assigneeIds.length) q = q.in('assigned_to', assigneeIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchStageHistoryForLeads(leadIds, fromIso, toIso) {
  if (!leadIds.length) return [];
  const { data, error } = await supabase
    .from('crm_lead_stage_history')
    .select('id, lead_id, pipeline_type, from_stage_id, to_stage_id, from_canonical_slug, to_canonical_slug, entered_at')
    .in('lead_id', leadIds)
    .gte('entered_at', fromIso)
    .lte('entered_at', toIso)
    .limit(2000);
  if (error) return [];
  return data || [];
}

/** Stage history của TOÀN BỘ lead thuộc company trong kỳ (qua inner join). */
async function fetchStageHistoryForCompanyInRange(companyId, fromIso, toIso, assigneeIds = null) {
  let q = supabase
    .from('crm_lead_stage_history')
    .select(
      'id, lead_id, pipeline_type, from_canonical_slug, to_canonical_slug, entered_at, '
      + 'lead:crm_leads!inner(company_id, assigned_to)'
    )
    .eq('lead.company_id', companyId)
    .gte('entered_at', fromIso)
    .lte('entered_at', toIso)
    .limit(3000);
  if (Array.isArray(assigneeIds) && assigneeIds.length) {
    q = q.in('lead.assigned_to', assigneeIds);
  }
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

function isWonStage(stage) {
  return !!(stage?.is_won || stage?.canonical_slug === 'completed');
}

function isLostStage(stage) {
  return !!(stage?.is_lost || stage?.canonical_slug === 'lost');
}

/** Tóm tắt lead/deal công ty trong kỳ */
async function getCompanyLeadSummary({ company_id: companyId, time_scope: timeScope, schedule_id: scheduleId, days_offset: daysOffset, personal_recipient_user_id: personalUid, user_filter_ids: userFilterIds } = {}) {
  if (!companyId) throw new Error('Thiếu company_id');

  let scope = timeScope;
  let offset = daysOffset ?? 0;
  if (scheduleId && !timeScope) {
    const sched = await loadSchedule(scheduleId);
    scope = sched?.time_scope || 'today';
    offset = sched?.time_scope_days_offset ?? 0;
  }

  const range = resolveTimeRange(scope || 'today', offset);
  const { from_iso: fromIso, to_iso: toIso, label_vn: labelVn } = range;

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .eq('id', companyId)
    .maybeSingle();

  const assigneeIds = await resolveAssigneeIds({ schedule_id: scheduleId, personal_recipient_user_id: personalUid, user_filter_ids: userFilterIds });

  // Tách 3 query để tránh limit 1000 của PostgREST
  const [createdLeads, closedLeads, openCount] = await Promise.all([
    fetchLeadsCreatedInRange(companyId, fromIso, toIso, assigneeIds),
    fetchLeadsClosedInRange(companyId, fromIso, toIso, assigneeIds),
    countOpenLeads(companyId, assigneeIds),
  ]);

  // Stage history theo company trong kỳ (qua inner join, tránh limit 1000 do filter chặt)
  const history = await fetchStageHistoryForCompanyInRange(companyId, fromIso, toIso, assigneeIds);

  let newLeads = 0;
  let won = 0;
  let lost = 0;
  let totalValueWon = 0;

  const convertedLeadIds = new Set();
  for (const h of history) {
    const slug = h.to_canonical_slug || '';
    const isDealEntry =
      h.pipeline_type === 'deal' ||
      ['designing', 'quoted', 'negotiating', 'waiting_deposit', 'contract_signed', 'producing', 'installing', 'completed'].includes(slug);
    if (isDealEntry) convertedLeadIds.add(h.lead_id);
  }

  for (const l of createdLeads) {
    if (l.type === 'lead' || !l.type) newLeads += 1;
  }

  for (const l of closedLeads) {
    if (isWonStage(l.stage)) {
      won += 1;
      totalValueWon += Number(l.estimated_value) || 0;
    } else if (isLostStage(l.stage)) {
      lost += 1;
    }
  }

  const convertedToDeal = convertedLeadIds.size;
  const open = openCount;

  return {
    company_id: companyId,
    company_name: company?.short_name || company?.name || '—',
    period: labelVn,
    time_range: range,
    new_leads: newLeads,
    converted_to_deal: convertedToDeal,
    won,
    lost,
    open,
    total_value_won: totalValueWon,
    total_value_won_text: fmtMoneyShort(totalValueWon),
    total_value_won_full: fmtMoney(totalValueWon),
  };
}

/** Phân rã theo nhân viên */
async function getEmployeeBreakdown({ company_id: companyId, time_scope: timeScope, schedule_id: scheduleId, days_offset: daysOffset, personal_recipient_user_id: personalUid, user_filter_ids: userFilterIds } = {}) {
  if (!companyId) throw new Error('Thiếu company_id');

  let scope = timeScope;
  let offset = daysOffset ?? 0;
  if (scheduleId && !timeScope) {
    const sched = await loadSchedule(scheduleId);
    scope = sched?.time_scope || 'today';
    offset = sched?.time_scope_days_offset ?? 0;
  }

  const range = resolveTimeRange(scope || 'today', offset);
  const { from_iso: fromIso, to_iso: toIso } = range;
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const now = Date.now();
  const todayStr = vnDateYmd();
  const todayStartMs = new Date(`${todayStr}T00:00:00+07:00`).getTime();

  const assigneeIds = await resolveAssigneeIds({ schedule_id: scheduleId, personal_recipient_user_id: personalUid, user_filter_ids: userFilterIds });
  const limitedToWhitelist = Array.isArray(assigneeIds) && assigneeIds.length > 0;

  // Lead tạo/close trong kỳ + lead overdue mở (cho per-employee overdue)
  const [createdLeads, closedLeads, openOverdueLeads, history] = await Promise.all([
    fetchLeadsCreatedInRange(companyId, fromIso, toIso, assigneeIds),
    fetchLeadsClosedInRange(companyId, fromIso, toIso, assigneeIds),
    fetchOpenOverdueLeads(companyId, todayStr, assigneeIds),
    fetchStageHistoryForCompanyInRange(companyId, fromIso, toIso, assigneeIds),
  ]);

  const userIdsFromLeads = [...new Set([
    ...createdLeads.map((l) => l.assigned_to),
    ...closedLeads.map((l) => l.assigned_to),
    ...openOverdueLeads.map((l) => l.assigned_to),
    ...history.map((h) => h.lead?.assigned_to),
  ].filter(Boolean))];
  // Khi có whitelist → luôn bao gồm cả NV đã chọn (kể cả không có lead) để sếp biết NV đó "im ắng"
  const userIds = limitedToWhitelist
    ? [...new Set([...userIdsFromLeads, ...assigneeIds])]
    : userIdsFromLeads;

  const nameMap = new Map();
  if (userIds.length) {
    const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds);
    (users || []).forEach((u) => nameMap.set(u.id, u.full_name));
  }

  const statsMap = new Map();

  const ensure = (uid) => {
    if (!statsMap.has(uid)) {
      statsMap.set(uid, {
        user_id: uid,
        name: nameMap.get(uid) || '—',
        new_leads: 0,
        new_deals: 0,
        new_value: 0,
        processed: 0,
        late_handled: 0,
        overdue_open: 0,
        overdue_open_value: 0,
      });
    }
    return statsMap.get(uid);
  };

  // new_leads / new_deals từ createdLeads (đã filter sẵn trong kỳ + assignee)
  for (const l of createdLeads) {
    if (!l.assigned_to) continue;
    const s = ensure(l.assigned_to);
    if (l.type === 'deal') s.new_deals += 1;
    else s.new_leads += 1;
    s.new_value += Number(l.estimated_value) || 0;
  }
  // processed = mỗi lần chuyển stage trong kỳ
  for (const h of history) {
    const uid = h.lead?.assigned_to;
    if (!uid) continue;
    ensure(uid).processed += 1;
  }

  /* Task trễ hạn / quá hạn — userIds đã bao gồm cả NV trong whitelist */
  if (userIds.length) {
    try {
      const tq = supabase
        .from('crm_tasks')
        .select('id, assignee_id, deadline, completed_at, status, lead:crm_leads(company_id)')
        .in('assignee_id', userIds)
        .not('deadline', 'is', null);
      const { data: tasks } = await tq;

      (tasks || []).forEach((t) => {
        if (t.lead?.company_id !== companyId) return;
        if (!t.assignee_id) return;
        const dlMs = new Date(t.deadline).getTime();
        const s = ensure(t.assignee_id);

        if (t.status === 'done' && t.completed_at) {
          const doneMs = new Date(t.completed_at).getTime();
          if (doneMs > dlMs && doneMs >= fromMs && doneMs <= toMs) s.late_handled += 1;
        } else if (['pending', 'in_progress'].includes(t.status) && dlMs < now) {
          s.overdue_open += 1;
        }
      });
    } catch {
      /* ignore */
    }

    /* Lead quá hạn expected_close_date — đã filter sẵn (open + overdue) */
    for (const l of openOverdueLeads) {
      if (!l.assigned_to) continue;
      if (isWonStage(l.stage) || isLostStage(l.stage)) continue;
      const s = ensure(l.assigned_to);
      s.overdue_open += 1;
      s.overdue_open_value += Number(l.estimated_value) || 0;
    }
  }

  // Khi có whitelist → đảm bảo mọi NV trong scope đều xuất hiện (kể cả 0 hoạt động)
  if (limitedToWhitelist) {
    assigneeIds.forEach((uid) => ensure(uid));
  }

  const rows = [...statsMap.values()]
    .filter((r) => limitedToWhitelist
      || (r.new_leads + r.new_deals + r.processed + r.late_handled + r.overdue_open) > 0)
    .sort((a, b) => (b.new_leads + b.new_deals) - (a.new_leads + a.new_deals));

  return {
    company_id: companyId,
    period: range.label_vn,
    scope_user_count: limitedToWhitelist ? assigneeIds.length : null,
    employees: rows,
  };
}

/**
 * Drill chi tiết: TỪNG NV của công ty có những LEAD nào.
 * Mặc định liệt kê lead MỚI trong kỳ; có thể bật `include_open_holdings=true`
 * để liệt kê cả lead/deal đang giữ (không chỉ mới).
 */
async function getEmployeeLeadsDrill({
  company_id: companyId,
  time_scope: timeScope,
  days_offset: daysOffset,
  schedule_id: scheduleId,
  personal_recipient_user_id: personalUid,
  user_filter_ids: userFilterIds,
  include_open_holdings = false,
  top_per_employee = 5,
  only_with_activity = true,
} = {}) {
  if (!companyId) throw new Error('Thiếu company_id');

  const range = resolveTimeRange(timeScope || 'today', daysOffset ?? 0);
  const assigneeIds = await resolveAssigneeIds({
    schedule_id: scheduleId,
    personal_recipient_user_id: personalUid,
    user_filter_ids: userFilterIds,
  });
  const safeTop = Math.min(Math.max(Number(top_per_employee) || 5, 1), 15);

  // 1) Lead mới trong kỳ
  const newLeads = await fetchLeadsCreatedInRange(companyId, range.from_iso, range.to_iso, assigneeIds);

  // 2) Lead đang giữ (open) — chỉ fetch nếu user yêu cầu
  let openLeads = [];
  if (include_open_holdings) {
    let openQ = supabase
      .from('crm_leads')
      .select(LEAD_SELECT)
      .eq('company_id', companyId)
      .is('actual_close_date', null)
      .order('estimated_value', { ascending: false, nullsFirst: false })
      .limit(2000);
    if (Array.isArray(assigneeIds) && assigneeIds.length) openQ = openQ.in('assigned_to', assigneeIds);
    const { data: rows } = await openQ;
    openLeads = (rows || []).filter((l) => !l.stage?.is_won && !l.stage?.is_lost);
  }

  // Resolve names cho mọi user_id xuất hiện
  const uids = new Set();
  for (const l of newLeads) if (l.assigned_to) uids.add(l.assigned_to);
  for (const l of openLeads) if (l.assigned_to) uids.add(l.assigned_to);
  if (Array.isArray(assigneeIds)) for (const u of assigneeIds) uids.add(u);

  const userMap = new Map();
  if (uids.size) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, department_id, company_id, is_active')
      .in('id', [...uids]);
    const ctxMap = await loadUserOrgContext(users || []);
    for (const u of users || []) {
      const ctx = ctxMap.get(u.id) || {};
      userMap.set(u.id, {
        id: u.id,
        full_name: u.full_name,
        department: ctx.department?.name || null,
        is_active: u.is_active,
      });
    }
  }

  // Group theo assignee
  const byUser = new Map();
  function bucket(uid) {
    if (!byUser.has(uid)) {
      const u = userMap.get(uid);
      byUser.set(uid, {
        user_id: uid,
        name: u?.full_name || '—',
        department: u?.department || null,
        is_active: u?.is_active !== false,
        new_lead_count: 0,
        new_lead_value: 0,
        new_leads: [],
        open_count: 0,
        open_value: 0,
        open_leads: [],
      });
    }
    return byUser.get(uid);
  }

  for (const l of newLeads) {
    const uid = l.assigned_to || '_unassigned_';
    const b = bucket(uid);
    b.new_lead_count += 1;
    b.new_lead_value += Number(l.estimated_value) || 0;
    b.new_leads.push({
      code: l.code,
      title: l.title,
      type: l.type || 'lead',
      stage_name: l.stage?.name || null,
      value: Number(l.estimated_value) || 0,
      created_at: l.created_at,
      link: leadDetailUrl(l.id),
    });
  }

  for (const l of openLeads) {
    const uid = l.assigned_to || '_unassigned_';
    const b = bucket(uid);
    b.open_count += 1;
    b.open_value += Number(l.estimated_value) || 0;
    b.open_leads.push({
      code: l.code,
      title: l.title,
      type: l.type || 'lead',
      stage_name: l.stage?.name || null,
      value: Number(l.estimated_value) || 0,
      link: leadDetailUrl(l.id),
    });
  }

  // Đảm bảo whitelist (nếu có) đều xuất hiện kể cả 0 lead — để sếp thấy ai "im ắng"
  if (Array.isArray(assigneeIds)) {
    for (const uid of assigneeIds) bucket(uid);
  }

  // Sort lead trong mỗi user theo value desc, cắt top
  let employees = [...byUser.values()].map((b) => ({
    ...b,
    new_leads: b.new_leads.sort((a, b2) => b2.value - a.value).slice(0, safeTop),
    open_leads: b.open_leads.sort((a, b2) => b2.value - a.value).slice(0, safeTop),
  }));

  if (only_with_activity) {
    employees = employees.filter((e) => e.new_lead_count > 0 || e.open_count > 0);
  }

  employees.sort((a, b) => (b.new_lead_count - a.new_lead_count) || (b.open_count - a.open_count));

  return {
    company_id: companyId,
    period: range.label_vn,
    include_open_holdings: !!include_open_holdings,
    scope: {
      assignee_count: Array.isArray(assigneeIds) ? assigneeIds.length : null,
      personal: !!personalUid,
    },
    totals: {
      employees_with_new_leads: employees.filter((e) => e.new_lead_count > 0).length,
      total_new_leads: newLeads.length,
      total_open_leads: openLeads.length,
    },
    employees,
    generated_at: new Date().toISOString(),
  };
}

/** Chi tiết quá hạn */
async function getOverdueBreakdown({ company_id: companyId, schedule_id: scheduleId, personal_recipient_user_id: personalUid, user_filter_ids: userFilterIds } = {}) {
  if (!companyId) throw new Error('Thiếu company_id');

  const now = Date.now();
  const todayStr = vnDateYmd();
  const todayStartMs = new Date(`${todayStr}T00:00:00+07:00`).getTime();

  const { data: company } = await supabase
    .from('companies')
    .select('short_name, name')
    .eq('id', companyId)
    .maybeSingle();

  const assigneeIds = await resolveAssigneeIds({ schedule_id: scheduleId, personal_recipient_user_id: personalUid, user_filter_ids: userFilterIds });
  const leads = await fetchOpenOverdueLeads(companyId, todayStr, assigneeIds);
  const userIds = [...new Set(leads.map((l) => l.assigned_to).filter(Boolean))];
  const nameMap = new Map();
  if (userIds.length) {
    const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds);
    (users || []).forEach((u) => nameMap.set(u.id, u.full_name));
  }

  const leadsExpired = [];
  for (const l of leads) {
    if (isWonStage(l.stage) || isLostStage(l.stage)) continue;
    const expMs = new Date(`${l.expected_close_date}T00:00:00+07:00`).getTime();
    leadsExpired.push({
      code: l.code,
      title: l.title,
      type: l.type || 'lead',
      value: Number(l.estimated_value) || 0,
      assignee: nameMap.get(l.assigned_to) || '—',
      days_overdue: Math.max(0, Math.round((now - expMs) / (24 * 3600 * 1000))),
      link: leadDetailUrl(l.id),
    });
  }
  // Sort theo days_overdue desc rồi value desc → các lead "nguy hiểm" lên đầu
  leadsExpired.sort((a, b) => (b.days_overdue - a.days_overdue) || (b.value - a.value));
  const totalLeadValueExpired = leadsExpired.reduce((s, l) => s + l.value, 0);

  let tasksOverdue = [];
  try {
    let q = supabase
      .from('crm_tasks')
      .select('id, title, deadline, assignee_id, lead:crm_leads(id, code, company_id)')
      .in('status', ['pending', 'in_progress'])
      .not('deadline', 'is', null)
      .lt('deadline', new Date().toISOString())
      .limit(80);
    if (Array.isArray(assigneeIds) && assigneeIds.length) {
      q = q.in('assignee_id', assigneeIds);
    }
    const { data: tasks } = await q;

    tasksOverdue = (tasks || [])
      .filter((t) => t.lead?.company_id === companyId)
      .map((t) => ({
        title: t.title,
        assignee: nameMap.get(t.assignee_id) || '—',
        lead_code: t.lead?.code || null,
        hours_overdue: Math.round((now - new Date(t.deadline).getTime()) / 3600000),
      }));
  } catch {
    /* ignore */
  }

  tasksOverdue.sort((a, b) => (b.hours_overdue || 0) - (a.hours_overdue || 0));

  return {
    company_id: companyId,
    company_name: company?.short_name || company?.name || '—',
    leads_expired: leadsExpired.slice(0, 20),
    tasks_overdue: tasksOverdue.slice(0, 20),
    total_leads_expired: leadsExpired.length,
    total_tasks_overdue: tasksOverdue.length,
    total_lead_value_expired: totalLeadValueExpired,
    total_lead_value_expired_text: fmtMoneyShort(totalLeadValueExpired),
  };
}

/** Rút gọn tên NV cho hiển thị trên chat bubble nhỏ */
function shortName(fullName) {
  if (!fullName) return '—';
  const s = String(fullName).trim();
  if (s.length <= 22) return s;
  return s.slice(0, 21) + '…';
}

/** Format số có dấu phẩy ngàn (vi-VN) */
function fmtInt(n) {
  return (Number(n) || 0).toLocaleString('vi-VN');
}

/** Rút gọn tiền VND cho chat bubble: 1.235.000 → "1,2tr"; 850.000.000 → "850tr"; 2.500.000.000 → "2,5tỷ" */
function fmtMoneyShort(n) {
  const v = Math.abs(Number(n) || 0);
  const sign = (Number(n) || 0) < 0 ? '-' : '';
  if (v === 0) return '0';
  if (v >= 1_000_000_000) {
    const x = v / 1_000_000_000;
    return `${sign}${x.toFixed(x >= 10 ? 0 : 1).replace('.', ',').replace(/,0$/, '')}tỷ`;
  }
  if (v >= 1_000_000) {
    const x = v / 1_000_000;
    return `${sign}${x.toFixed(x >= 10 ? 0 : 1).replace('.', ',').replace(/,0$/, '')}tr`;
  }
  if (v >= 1_000) return `${sign}${Math.round(v / 1_000)}k`;
  return `${sign}${v}`;
}

/** Báo cáo tĩnh (fallback / menu direct) — thiết kế cho bong bóng chat hẹp:
 *  - Mỗi metric 1 dòng có emoji.
 *  - NV ngắn gọn: chỉ "L/D/xử lý" — không in metric 0.
 *  - Gom NV không hoạt động thành 1 dòng "+ N NV im ắng". */
async function formatCompanyReportText({ company_id: companyId, schedule_id: scheduleId, time_scope: timeScope, days_offset: daysOffset, include_employees: includeEmployees = true, personal_recipient_user_id: personalUid, department_id: departmentId, department_name: departmentName, user_filter_ids: userFilterIds, scope_label: scopeLabel }) {
  let extraUserIds = Array.isArray(userFilterIds) ? [...userFilterIds] : null;
  let resolvedScopeLabel = scopeLabel || null;

  // Resolve department theo tên nếu chưa có id
  if (!departmentId && departmentName && companyId) {
    const term = String(departmentName).trim();
    const { data: deptCandidates } = await supabase
      .from('departments')
      .select('id, name, company_id')
      .eq('company_id', companyId)
      .ilike('name', `%${term}%`)
      .limit(5);
    if (deptCandidates && deptCandidates.length === 1) {
      departmentId = deptCandidates[0].id;
      resolvedScopeLabel = `🏷 ${deptCandidates[0].name}`;
    } else if (deptCandidates && deptCandidates.length > 1) {
      // Ưu tiên match chính xác name (không phân biệt hoa thường)
      const exact = deptCandidates.find((d) => d.name.toLowerCase() === term.toLowerCase());
      if (exact) {
        departmentId = exact.id;
        resolvedScopeLabel = `🏷 ${exact.name}`;
      } else {
        return `❓ Cần chọn rõ phòng ban — có ${deptCandidates.length} phòng khớp "${term}":\n`
          + deptCandidates.map((d, i) => `${i + 1}. ${d.name} (${d.id})`).join('\n')
          + '\nGọi lại với department_id chính xác.';
      }
    } else {
      return `❓ Không tìm thấy phòng ban nào khớp "${term}" trong công ty đã chọn. Dùng list_departments_in_company để xem các phòng có sẵn.`;
    }
  }

  if (departmentId) {
    const { data: deptUsers } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('department_id', departmentId)
      .neq('is_active', false);
    const ids = (deptUsers || []).map((u) => u.id);
    extraUserIds = extraUserIds ? extraUserIds.filter((u) => ids.includes(u)) : ids;
    if (!resolvedScopeLabel) {
      const { data: dept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', departmentId)
        .maybeSingle();
      if (dept?.name) resolvedScopeLabel = `🏷 ${dept.name}`;
    }
    if (!extraUserIds.length) {
      return `📭 Phòng ban này không có NV active. (department_id=${departmentId})`;
    }
  }
  const summary = await getCompanyLeadSummary({ company_id: companyId, time_scope: timeScope, schedule_id: scheduleId, days_offset: daysOffset, personal_recipient_user_id: personalUid, user_filter_ids: extraUserIds });
  const assigneeIds = extraUserIds || await resolveAssigneeIds({ schedule_id: scheduleId, personal_recipient_user_id: personalUid });

  const lines = [];

  // ── Header ──
  lines.push(`📊 *${summary.company_name}*`);
  lines.push(`🗓 ${summary.period}`);
  if (personalUid) {
    lines.push('👤 Báo cáo cá nhân');
  } else if (resolvedScopeLabel) {
    lines.push(`${resolvedScopeLabel} · ${Array.isArray(assigneeIds) ? assigneeIds.length : 0} NV`);
  } else if (Array.isArray(assigneeIds) && assigneeIds.length) {
    lines.push(`👥 ${assigneeIds.length} NV trong phạm vi`);
  }
  lines.push('━━━━━━━━━━━━━');

  // ── Tổng quan ──
  lines.push(`🆕 Lead mới: *${fmtInt(summary.new_leads)}*`);
  if (summary.converted_to_deal > 0) lines.push(`🔄 Chuyển deal: *${fmtInt(summary.converted_to_deal)}*`);
  if (summary.won > 0 || summary.lost > 0) {
    lines.push(`✅ Thắng: ${fmtInt(summary.won)}   ❌ Thua: ${fmtInt(summary.lost)}`);
  }
  lines.push(`📂 Đang mở: ${fmtInt(summary.open)}`);
  if (summary.total_value_won > 0) lines.push(`💰 Doanh thu: *${fmtMoneyShort(summary.total_value_won)}*`);

  // ── Nhân viên ──
  if (includeEmployees) {
    const emp = await getEmployeeBreakdown({ company_id: companyId, time_scope: timeScope, schedule_id: scheduleId, days_offset: daysOffset, personal_recipient_user_id: personalUid, user_filter_ids: extraUserIds });
    if (emp.employees.length) {
      const active = emp.employees.filter((e) => (e.new_leads + e.new_deals + e.processed + e.late_handled + e.overdue_open) > 0);
      const silent = emp.employees.filter((e) => (e.new_leads + e.new_deals + e.processed + e.late_handled + e.overdue_open) === 0);

      const title = personalUid ? '👤 Hoạt động của bạn' : '👥 Theo nhân viên';
      lines.push('', title);

      if (active.length === 0) {
        lines.push('  (chưa có hoạt động)');
      } else {
        active.slice(0, 10).forEach((e, idx) => {
          const rank = `${idx + 1}.`;
          const parts = [];
          if (e.new_leads) parts.push(`${e.new_leads}L`);
          if (e.new_deals) parts.push(`${e.new_deals}D`);
          if (e.new_value > 0) parts.push(`💰${fmtMoneyShort(e.new_value)}`);
          if (e.processed) parts.push(`xử lý ${e.processed}`);
          if (e.late_handled) parts.push(`⏰${e.late_handled}`);
          if (e.overdue_open) {
            parts.push(e.overdue_open_value > 0
              ? `⚠️${e.overdue_open} (${fmtMoneyShort(e.overdue_open_value)})`
              : `⚠️${e.overdue_open}`);
          }
          lines.push(`${rank} ${shortName(e.name)} · ${parts.join(' · ')}`);
        });
        if (active.length > 10) {
          lines.push(`   …+${active.length - 10} NV khác có hoạt động`);
        }
      }
      if (silent.length > 0) {
        if (silent.length <= 3) {
          lines.push(`💤 Im ắng: ${silent.map((e) => shortName(e.name)).join(', ')}`);
        } else {
          lines.push(`💤 ${silent.length} NV chưa có hoạt động`);
        }
      }
    } else if (Array.isArray(assigneeIds) && assigneeIds.length) {
      lines.push('', '👥 NV đã chọn không có data tại công ty này.');
    }
  }

  // ── Quá hạn (chi tiết) ──
  const overdue = await getOverdueBreakdown({ company_id: companyId, schedule_id: scheduleId, personal_recipient_user_id: personalUid, user_filter_ids: extraUserIds });
  if (overdue.total_leads_expired + overdue.total_tasks_overdue > 0) {
    lines.push('━━━━━━━━━━━━━');
    lines.push('⚠️ *Quá hạn*');

    if (overdue.total_leads_expired) {
      const valueTxt = overdue.total_lead_value_expired > 0
        ? ` · 💰${overdue.total_lead_value_expired_text}`
        : '';
      lines.push(`📍 ${overdue.total_leads_expired} lead/deal${valueTxt}`);
      overdue.leads_expired.slice(0, 5).forEach((l) => {
        const tag = (l.type || 'lead').toLowerCase() === 'deal' ? 'D' : 'L';
        const codeOrTitle = l.code || shortName(l.title) || '—';
        const valTxt = l.value > 0 ? ` · ${fmtMoneyShort(l.value)}` : '';
        lines.push(`  • [${tag}] ${codeOrTitle} · ${shortName(l.assignee)} · trễ ${l.days_overdue}d${valTxt}`);
      });
      if (overdue.total_leads_expired > 5) {
        lines.push(`   …+${overdue.total_leads_expired - 5} lead/deal khác`);
      }
    }

    if (overdue.total_tasks_overdue) {
      lines.push(`📋 ${overdue.total_tasks_overdue} task quá hạn`);
      overdue.tasks_overdue.slice(0, 5).forEach((t) => {
        const hrs = Number(t.hours_overdue) || 0;
        const overdueTxt = hrs >= 48 ? `${Math.round(hrs / 24)}d` : `${hrs}h`;
        const codeTxt = t.lead_code ? `[${t.lead_code}] ` : '';
        lines.push(`  • ${codeTxt}${shortName(t.title)} · ${shortName(t.assignee)} · trễ ${overdueTxt}`);
      });
      if (overdue.total_tasks_overdue > 5) {
        lines.push(`   …+${overdue.total_tasks_overdue - 5} task khác`);
      }
    }
  }

  return lines.join('\n').slice(0, 1900);
}

const TIME_SCOPE_ENUM = ['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'last_month', 'custom'];

/* ─────────────────── PIPELINE DETAIL (theo cty) ─────────────────── */

/**
 * Liệt kê pipelines của 1 công ty (hoặc tất cả nếu không truyền).
 * Kèm số stage, số lead đang mở, và stages headline (3 stage có nhiều lead nhất).
 */
async function listPipelinesForCompany({ company_id, include_stats = true } = {}) {
  let q = supabase
    .from('crm_pipelines')
    .select('id, name, description, is_default, is_active, company_id, company:companies(id, name, short_name)')
    .eq('is_active', true);
  if (company_id) q = q.eq('company_id', company_id);
  const { data: pipes, error } = await q.order('is_default', { ascending: false }).order('name');
  if (error) return { error: error.message, pipelines: [] };

  const pipelines = (pipes || []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    is_default: !!p.is_default,
    company_id: p.company_id,
    company_name: p.company?.name || null,
  }));

  if (!include_stats || !pipelines.length) {
    return { company_id: company_id || null, count: pipelines.length, pipelines };
  }

  // Đếm stages + open leads + xác định pipeline_type chính (theo stage nhiều nhất)
  for (const p of pipelines) {
    const { data: stages } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, pipeline_type, is_won, is_lost')
      .eq('pipeline_id', p.id)
      .eq('is_active', true);
    const stageIds = (stages || []).map((s) => s.id);
    p.stage_count = stages?.length || 0;

    const typeMap = {};
    for (const s of stages || []) {
      if (s.pipeline_type) typeMap[s.pipeline_type] = (typeMap[s.pipeline_type] || 0) + 1;
    }
    p.pipeline_type = Object.entries(typeMap).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    if (!stageIds.length) {
      p.open_leads = 0;
      continue;
    }
    const { count } = await supabase
      .from('crm_leads')
      .select('id', { count: 'exact', head: true })
      .in('stage_id', stageIds)
      .is('actual_close_date', null);
    p.open_leads = count || 0;
  }

  return { company_id: company_id || null, count: pipelines.length, pipelines };
}

/**
 * Chi tiết 1 pipeline: stages + count + tổng giá trị lead còn mở + sample.
 * Có thể filter theo NV (user_filter_ids) và phạm vi thời gian (chỉ áp cho lead created_at).
 */
async function getPipelineBreakdown({
  pipeline_id,
  company_id,
  pipeline_type,
  time_scope,
  days_offset = 0,
  user_filter_ids,
  schedule_id,
  personal_recipient_user_id,
  sample_per_stage = 3,
}) {
  let pid = pipeline_id;
  if (!pid && company_id) {
    const { data: pipes } = await supabase
      .from('crm_pipelines')
      .select('id, is_default')
      .eq('company_id', company_id)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .limit(5);
    pid = (pipes || [])[0]?.id || null;
  }
  if (!pid) return { error: 'Không tìm thấy pipeline (thiếu pipeline_id hoặc company_id).', stages: [] };

  const { data: pipeline } = await supabase
    .from('crm_pipelines')
    .select('id, name, description, company_id, company:companies(id, name, short_name)')
    .eq('id', pid)
    .maybeSingle();
  if (!pipeline) return { error: 'Pipeline không tồn tại', stages: [] };

  let stageQ = supabase
    .from('crm_pipeline_stages')
    .select('id, name, order_index, color, is_won, is_lost, pipeline_type, canonical_slug')
    .eq('pipeline_id', pid)
    .eq('is_active', true)
    .order('order_index', { ascending: true });
  if (pipeline_type) stageQ = stageQ.eq('pipeline_type', pipeline_type);
  const { data: stages } = await stageQ;
  if (!stages?.length) {
    return { ...pipelineHeader(pipeline), error: 'Pipeline chưa có giai đoạn', stages: [] };
  }

  // Resolve scope (whitelist + personal + user_filter)
  let assigneeIds = null;
  if (Array.isArray(user_filter_ids) && user_filter_ids.length) {
    assigneeIds = user_filter_ids.map(String);
  } else if (personal_recipient_user_id) {
    assigneeIds = [String(personal_recipient_user_id)];
  } else if (schedule_id) {
    assigneeIds = await resolveAssigneeIds({ schedule_id });
  }

  const range = time_scope ? resolveTimeRange(time_scope, days_offset || 0) : null;
  const safeSample = Math.min(Math.max(Number(sample_per_stage) || 3, 0), 10);

  const stageDetails = [];
  let totalOpen = 0;
  let totalValueOpen = 0;
  let totalStagnant = 0;
  const STAGNATION_DAYS = 7;
  const stagnationCutoffIso = new Date(Date.now() - STAGNATION_DAYS * 24 * 3600 * 1000).toISOString();
  const nowMs = Date.now();

  for (const st of stages) {
    // Lấy đầy đủ lead trong stage để tính: count + sum value + stagnation + top assignees + age
    let leadsQ = supabase
      .from('crm_leads')
      .select('id, code, title, estimated_value, expected_close_date, assigned_to, created_at, updated_at, assignee:users!crm_leads_assigned_to_fkey(id, full_name)')
      .eq('stage_id', st.id)
      .is('actual_close_date', null);
    if (assigneeIds) leadsQ = leadsQ.in('assigned_to', assigneeIds);
    if (range) {
      leadsQ = leadsQ.gte('created_at', range.from_iso).lte('created_at', range.to_iso);
    }
    const { data: leadsAll } = await leadsQ
      .order('estimated_value', { ascending: false, nullsFirst: false })
      .limit(500);

    const list = leadsAll || [];
    const openCount = list.length;
    const valueAgg = list.reduce((s, r) => s + (Number(r.estimated_value) || 0), 0);

    // Stagnation: lead chưa update sau cutoff
    const stagnantLeads = list.filter((l) => {
      const ts = l.updated_at || l.created_at;
      return ts && ts < stagnationCutoffIso;
    });
    const stagnantCount = stagnantLeads.length;

    // Avg days in stage (dùng updated_at proxy — không có stage_history thì estimate)
    let avgAgeDays = null;
    if (openCount) {
      const sumAge = list.reduce((s, l) => {
        const ts = l.updated_at || l.created_at;
        if (!ts) return s;
        return s + (nowMs - new Date(ts).getTime()) / (24 * 3600 * 1000);
      }, 0);
      avgAgeDays = Math.round((sumAge / openCount) * 10) / 10;
    }

    // Top assignees đang giữ nhiều lead nhất trong stage
    const assigneeMap = new Map();
    for (const l of list) {
      const uid = l.assigned_to;
      if (!uid) continue;
      const name = l.assignee?.full_name || uid;
      const cur = assigneeMap.get(uid) || { id: uid, name, count: 0, value: 0 };
      cur.count += 1;
      cur.value += Number(l.estimated_value) || 0;
      assigneeMap.set(uid, cur);
    }
    const topAssignees = [...assigneeMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    if (!st.is_won && !st.is_lost) {
      totalOpen += openCount;
      totalValueOpen += valueAgg;
      totalStagnant += stagnantCount;
    }

    stageDetails.push({
      stage_id: st.id,
      stage_name: st.name,
      order_index: st.order_index,
      color: st.color,
      is_won: !!st.is_won,
      is_lost: !!st.is_lost,
      pipeline_type: st.pipeline_type,
      canonical_slug: st.canonical_slug,
      open_count: openCount,
      open_value: valueAgg,
      stagnant_count: stagnantCount,
      avg_age_days: avgAgeDays,
      top_assignees: topAssignees,
      sample: list.slice(0, safeSample).map((l) => ({
        id: l.id,
        code: l.code,
        title: l.title,
        value: l.estimated_value,
        assignee: l.assignee?.full_name || null,
        expected_close_date: l.expected_close_date,
        days_since_update: l.updated_at
          ? Math.round((nowMs - new Date(l.updated_at).getTime()) / (24 * 3600 * 1000))
          : null,
        link: leadDetailUrl(l.id),
      })),
    });
  }

  // Conversion (won / (won + lost + open) — chỉ cho stage có is_won)
  const wonStages = stageDetails.filter((s) => s.is_won);
  const lostStages = stageDetails.filter((s) => s.is_lost);
  const openStages = stageDetails.filter((s) => !s.is_won && !s.is_lost);
  const wonTotal = wonStages.reduce((s, x) => s + x.open_count, 0);
  const lostTotal = lostStages.reduce((s, x) => s + x.open_count, 0);
  const grand = wonTotal + lostTotal + openStages.reduce((s, x) => s + x.open_count, 0);
  const winRate = grand ? Math.round((wonTotal / grand) * 1000) / 10 : 0;

  // Stage đọng nhiều nhất (open stage có stagnant_count cao nhất)
  const mostStagnantStage = openStages
    .filter((s) => s.stagnant_count > 0)
    .sort((a, b) => b.stagnant_count - a.stagnant_count)[0] || null;

  // Stage có nhiều lead đang mở nhất
  const busiestStage = openStages
    .sort((a, b) => b.open_count - a.open_count)[0] || null;

  return {
    ...pipelineHeader(pipeline),
    period: range ? range.label_vn : null,
    scope: {
      assignee_count: assigneeIds ? assigneeIds.length : null,
      personal: !!personal_recipient_user_id,
    },
    totals: {
      stages: stages.length,
      open_count: totalOpen,
      open_value: totalValueOpen,
      stagnant_count: totalStagnant,
      stagnation_threshold_days: STAGNATION_DAYS,
      won_count: wonTotal,
      lost_count: lostTotal,
      win_rate_pct: winRate,
    },
    insights: {
      busiest_stage: busiestStage
        ? { stage_name: busiestStage.stage_name, open_count: busiestStage.open_count, open_value: busiestStage.open_value }
        : null,
      most_stagnant_stage: mostStagnantStage
        ? { stage_name: mostStagnantStage.stage_name, stagnant_count: mostStagnantStage.stagnant_count }
        : null,
    },
    stages: stageDetails,
    generated_at: new Date().toISOString(),
  };
}

function pipelineHeader(p) {
  return {
    pipeline_id: p.id,
    pipeline_name: p.name,
    company_id: p.company_id,
    company_name: p.company?.name || null,
  };
}

/* ─────────────────── EMPLOYEE PROFILE / SCOPE ─────────────────── */

async function loadUserKpiMonth(userId) {
  try {
    const today = new Date();
    const periodStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const { data } = await supabase
      .from('crm_kpi_ledger')
      .select('points')
      .eq('user_id', userId)
      .gte('occurred_at', periodStart)
      .limit(1000);
    const net = (data || []).reduce((s, r) => s + (Number(r.points) || 0), 0);
    return { period: periodStart.slice(0, 7), net_points: net, transactions: (data || []).length };
  } catch {
    return { period: null, net_points: 0, transactions: 0 };
  }
}

async function loadUserPresence(userId) {
  if (String(userId || '') === AI_BOT_USER_ID) {
    return { online: true, last_ping_at: new Date().toISOString() };
  }
  try {
    const { data } = await supabase
      .from('user_last_activity')
      .select('last_ping_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data?.last_ping_at) return { online: false, last_ping_at: null };
    const ageMs = Date.now() - new Date(data.last_ping_at).getTime();
    return { online: ageMs < 2 * 60 * 1000, last_ping_at: data.last_ping_at };
  } catch {
    return { online: false, last_ping_at: null };
  }
}

/** Card chi tiết 1 NV: tổ chức + leads/deals/tasks/KPI + presence. */
async function getUserProfileCard({ user_id, name, ctx_user_id }) {
  let uid = user_id || ctx_user_id || null;

  // Cho phép truyền name → tự tìm
  if (!uid && name) {
    const found = await findUsersByName({ name });
    if (found.matches.length === 1) uid = found.matches[0].id;
    else if (found.matches.length > 1) {
      return {
        error: 'multiple_matches',
        message: `Có ${found.matches.length} NV trùng tên — cần chọn rõ user_id`,
        matches: found.matches.slice(0, 5),
      };
    }
  }
  if (!uid) return { error: 'Thiếu user_id hoặc name' };

  const { data: u, error } = await supabase
    .from('users')
    .select('id, full_name, email, phone, role, position, avatar, address, department_id, company_id, is_active, created_at')
    .eq('id', uid)
    .maybeSingle();
  if (error || !u) return { error: 'Không tìm thấy NV' };

  const ctxMap = await loadUserOrgContext([u]);
  const ctx = ctxMap.get(u.id) || {};

  // Lead/Deal đang giữ (open)
  let leadStats = { open_count: 0, open_value: 0, lead_open: 0, deal_open: 0 };
  try {
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, type, estimated_value, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(is_won, is_lost)')
      .eq('assigned_to', u.id)
      .is('actual_close_date', null)
      .limit(1000);
    for (const l of leads || []) {
      if (l.stage?.is_won || l.stage?.is_lost) continue;
      leadStats.open_count += 1;
      leadStats.open_value += Number(l.estimated_value) || 0;
      if (l.type === 'deal') leadStats.deal_open += 1;
      else leadStats.lead_open += 1;
    }
  } catch { /* ignore */ }

  // Task quá hạn
  let taskStats = { pending: 0, overdue: 0 };
  try {
    const nowIso = new Date().toISOString();
    const { data: tasks } = await supabase
      .from('crm_tasks')
      .select('id, deadline, status')
      .eq('assignee_id', u.id)
      .in('status', ['pending', 'in_progress'])
      .limit(500);
    for (const t of tasks || []) {
      taskStats.pending += 1;
      if (t.deadline && t.deadline < nowIso) taskStats.overdue += 1;
    }
  } catch { /* ignore */ }

  const [kpi, presence] = await Promise.all([loadUserKpiMonth(u.id), loadUserPresence(u.id)]);

  return {
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    position: u.position,
    is_active: u.is_active,
    created_at: u.created_at,
    organization: {
      department: ctx.department,
      company: ctx.company,
      effective_company_id: ctx.effective_company_id,
      regions: ctx.regions,
    },
    leads: leadStats,
    tasks: taskStats,
    kpi_month: kpi,
    presence,
  };
}

/**
 * Báo cáo HOẠT ĐỘNG của 1 NV trong kỳ — đa công ty (không bó vào 1 company_id).
 * - Tổ chức: phòng ban, công ty, khu vực, role/position.
 * - Trong kỳ: lead/deal mới tạo (tổng + giá trị), stage chuyển, won/lost đã chốt.
 * - Hiện tại: lead/deal đang giữ, task pending, task quá hạn.
 * - Trả `companies[]` để sếp thấy NV làm cho công ty nào trong kỳ.
 */
async function getEmployeeActivityReport({
  user_id,
  name,
  time_scope: timeScope,
  days_offset: daysOffset,
  date_from: dateFrom,
  date_to: dateTo,
  deal_kh_split: dealKhSplitParam,
  ctx_user_id,
  top_per_list = 5,
} = {}) {
  let uid = user_id || null;
  if (!uid && name) {
    const found = await findUsersByName({ name });
    if (found.matches.length === 1) uid = found.matches[0].id;
    else if (found.matches.length > 1) {
      return {
        error: 'multiple_matches',
        message: `Có ${found.matches.length} NV trùng tên "${name}" — chọn rõ user_id giúp mình.`,
        matches: found.matches.slice(0, 5),
      };
    }
  }
  if (!uid) uid = ctx_user_id || null;
  if (!uid) return { error: 'Thiếu user_id hoặc name' };

  const safeTop = Math.min(Math.max(Number(top_per_list) || 5, 1), 20);
  let range;
  if (dateFrom && dateTo) {
    range = {
      from_iso: new Date(`${dateFrom}T00:00:00+07:00`).toISOString(),
      to_iso: new Date(`${dateTo}T23:59:59.999+07:00`).toISOString(),
      label_vn: `tháng ${parseInt(dateFrom.slice(5, 7), 10)}/${dateFrom.slice(0, 4)} (${dateFrom} → ${dateTo})`,
    };
  } else {
    range = resolveTimeRange(timeScope || 'today', daysOffset ?? 0);
  }
  const { from_iso: fromIso, to_iso: toIso } = range;
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const fromYmd = vnDateYmd(new Date(fromIso));
  const toYmd = vnDateYmd(new Date(toIso));
  const nowIso = new Date().toISOString();

  // 1) Profile + org context
  const { data: u, error } = await supabase
    .from('users')
    .select('id, full_name, email, phone, role, position, is_active, department_id, company_id, created_at')
    .eq('id', uid)
    .maybeSingle();
  if (error || !u) return { error: 'Không tìm thấy NV' };
  const ctxMap = await loadUserOrgContext([u]);
  const ctx = ctxMap.get(u.id) || {};

  // 2) Lead/Deal mới tạo trong kỳ — đa cty
  const { data: createdLeads = [] } = await supabase
    .from('crm_leads')
    .select(EMPLOYEE_LEAD_SELECT)
    .eq('assigned_to', uid)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(500);

  // 3) Lead đã close trong kỳ (won/lost)
  const { data: closedLeads = [] } = await supabase
    .from('crm_leads')
    .select(EMPLOYEE_LEAD_SELECT)
    .eq('assigned_to', uid)
    .gte('actual_close_date', fromYmd)
    .lte('actual_close_date', toYmd)
    .limit(500);

  // 4) Stage history trong kỳ (đa cty)
  const { data: history = [] } = await supabase
    .from('crm_lead_stage_history')
    .select('id, lead_id, pipeline_type, from_canonical_slug, to_canonical_slug, entered_at, '
      + 'lead:crm_leads!inner(company_id, code, title, assigned_to, estimated_value)')
    .eq('lead.assigned_to', uid)
    .gte('entered_at', fromIso)
    .lte('entered_at', toIso)
    .order('entered_at', { ascending: false })
    .limit(500);

  // 5) Task trong kỳ
  const { data: tasksAll = [] } = await supabase
    .from('crm_tasks')
    .select('id, title, deadline, completed_at, status, assignee_id, '
      + 'lead:crm_leads(id, code, company_id)')
    .eq('assignee_id', uid)
    .limit(800);

  // 6) Lead đang giữ (open)
  const { data: openLeads = [] } = await supabase
    .from('crm_leads')
    .select(EMPLOYEE_LEAD_SELECT)
    .eq('assigned_to', uid)
    .is('actual_close_date', null)
    .order('estimated_value', { ascending: false, nullsFirst: false })
    .limit(800);

  // ── Tính toán ──
  let newLeadCount = 0; let newDealCount = 0; let newTotalValue = 0;
  for (const l of createdLeads) {
    if (l.type === 'deal') newDealCount += 1; else newLeadCount += 1;
    newTotalValue += Number(l.estimated_value) || 0;
  }

  let wonCount = 0; let wonValue = 0; let lostCount = 0;
  for (const l of closedLeads) {
    if (isWonStage(l.stage)) { wonCount += 1; wonValue += Number(l.estimated_value) || 0; }
    else if (isLostStage(l.stage)) lostCount += 1;
  }

  // Task completion in range + overdue still open
  let taskDoneInRange = 0; let taskDoneLateInRange = 0;
  let taskPending = 0; let taskOverdue = 0;
  for (const t of tasksAll) {
    if (t.status === 'done' && t.completed_at) {
      const dm = new Date(t.completed_at).getTime();
      if (dm >= fromMs && dm <= toMs) {
        taskDoneInRange += 1;
        if (t.deadline && new Date(t.completed_at).getTime() > new Date(t.deadline).getTime()) {
          taskDoneLateInRange += 1;
        }
      }
    } else if (['pending', 'in_progress'].includes(t.status)) {
      taskPending += 1;
      if (t.deadline && t.deadline < nowIso) taskOverdue += 1;
    }
  }

  // Holding
  const openLeadFiltered = openLeads.filter((l) => !l.stage?.is_won && !l.stage?.is_lost);
  let openHoldCount = 0; let openHoldValue = 0; let leadOpen = 0; let dealOpen = 0;
  for (const l of openLeadFiltered) {
    openHoldCount += 1;
    openHoldValue += Number(l.estimated_value) || 0;
    if (l.type === 'deal') dealOpen += 1; else leadOpen += 1;
  }

  const {
    loadDealKhSplitContext,
    aggregateDealKhSplitMetrics,
    aggregateOpenDealKhSplitMetrics,
  } = require('./crmDealKhSplit');
  const dealKhSplit = dealKhSplitParam !== false;
  const allDealRows = [
    ...createdLeads.filter((l) => l.type === 'deal'),
    ...openLeadFiltered.filter((l) => l.type === 'deal'),
  ];
  const { stageMap, wonStageOrderByPipe, dealKhSplitAvailable } = await loadDealKhSplitContext(allDealRows);
  const useKhSplit = dealKhSplit && dealKhSplitAvailable;
  const khCreated = aggregateDealKhSplitMetrics(
    createdLeads.filter((l) => l.type === 'deal'),
    stageMap,
    wonStageOrderByPipe,
    useKhSplit,
  );
  const khOpen = aggregateOpenDealKhSplitMetrics(
    openLeadFiltered.filter((l) => l.type === 'deal'),
    stageMap,
    wonStageOrderByPipe,
    useKhSplit,
  );

  // Đếm cty mà NV có hoạt động trong kỳ
  const companyAgg = new Map();
  const addCompany = (cid, bucket) => {
    if (!cid) return;
    if (!companyAgg.has(cid)) companyAgg.set(cid, { company_id: cid, new_leads: 0, new_deals: 0, stage_moves: 0, won: 0, lost: 0 });
    companyAgg.get(cid)[bucket] += 1;
  };
  for (const l of createdLeads) addCompany(l.company_id, l.type === 'deal' ? 'new_deals' : 'new_leads');
  for (const h of history) addCompany(h.lead?.company_id, 'stage_moves');
  for (const l of closedLeads) {
    if (isWonStage(l.stage)) addCompany(l.company_id, 'won');
    else if (isLostStage(l.stage)) addCompany(l.company_id, 'lost');
  }
  // Resolve company names
  const companyIds = [...companyAgg.keys()];
  let companyNameMap = new Map();
  if (companyIds.length) {
    const { data: cos } = await supabase
      .from('companies')
      .select('id, name, short_name')
      .in('id', companyIds);
    (cos || []).forEach((c) => companyNameMap.set(c.id, c.short_name || c.name));
  }
  const companies = [...companyAgg.values()]
    .map((row) => ({ ...row, company_name: companyNameMap.get(row.company_id) || '—' }))
    .sort((a, b) => (b.new_leads + b.new_deals + b.stage_moves) - (a.new_leads + a.new_deals + a.stage_moves));

  // Items lists (top)
  const newItems = createdLeads.slice(0, safeTop).map((l) => {
    const item = {
      code: l.code,
      title: l.title,
      type: l.type || 'lead',
      value: Number(l.estimated_value) || 0,
      company_id: l.company_id,
      company_name: companyNameMap.get(l.company_id) || null,
      stage_name: l.stage?.name || null,
      created_at: l.created_at,
      link: leadDetailUrl(l.id),
    };
    if (useKhSplit && l.type === 'deal') {
      const { classifyDealRowForKhSplit } = require('./crmDealKhSplit');
      const c = classifyDealRowForKhSplit(l, stageMap, wonStageOrderByPipe, true);
      item.deal_bucket = c.inCustomerTab ? 'customer_order' : 'deal_pipeline';
    }
    return item;
  });

  const wonItems = closedLeads.filter((l) => isWonStage(l.stage))
    .sort((a, b) => (Number(b.estimated_value) || 0) - (Number(a.estimated_value) || 0))
    .slice(0, safeTop)
    .map((l) => ({
      code: l.code,
      title: l.title,
      value: Number(l.estimated_value) || 0,
      company_id: l.company_id,
      company_name: companyNameMap.get(l.company_id) || null,
      closed_on: l.actual_close_date,
      link: leadDetailUrl(l.id),
    }));

  const stageMovesAgg = new Map();
  const { formatStageTransitionLabel } = require('./crmStageSlugLabels');
  for (const h of history) {
    const key = formatStageTransitionLabel(h.from_canonical_slug, h.to_canonical_slug);
    stageMovesAgg.set(key, (stageMovesAgg.get(key) || 0) + 1);
  }
  const topStageMoves = [...stageMovesAgg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, safeTop)
    .map(([transition, count]) => ({ transition, count }));

  return {
    user: {
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      position: u.position,
      is_active: u.is_active,
    },
    organization: {
      department: ctx.department,
      company: ctx.company,
      effective_company_id: ctx.effective_company_id,
      regions: ctx.regions,
    },
    period: range.label_vn,
    period_range: { from: fromIso, to: toIso },
    summary: {
      new_lead_count: newLeadCount,
      new_deal_count: newDealCount,
      new_total_value: newTotalValue,
      new_total_value_text: fmtMoneyShort(newTotalValue),
      deal_kh_split: useKhSplit,
      new_deal_total: useKhSplit ? khCreated.new_deal_total : newDealCount,
      new_deal_pipeline_count: useKhSplit ? khCreated.new_deal_pipeline_count : newDealCount,
      new_deal_pipeline_value: useKhSplit ? khCreated.new_deal_pipeline_value : 0,
      new_deal_pipeline_value_text: fmtMoneyShort(useKhSplit ? khCreated.new_deal_pipeline_value : 0),
      new_customer_order_count: useKhSplit ? khCreated.new_customer_order_count : 0,
      new_customer_order_value: useKhSplit ? khCreated.new_customer_order_value : 0,
      new_customer_order_value_text: fmtMoneyShort(useKhSplit ? khCreated.new_customer_order_value : 0),
      won_or_later_count: useKhSplit ? khCreated.won_or_later_count : wonCount,
      won_or_later_value: useKhSplit ? khCreated.won_or_later_value : wonValue,
      won_or_later_value_text: fmtMoneyShort(useKhSplit ? khCreated.won_or_later_value : wonValue),
      stage_moves: history.length,
      won_count: wonCount,
      won_value: wonValue,
      won_value_text: fmtMoneyShort(wonValue),
      lost_count: lostCount,
      task_done_in_range: taskDoneInRange,
      task_done_late_in_range: taskDoneLateInRange,
      task_pending: taskPending,
      task_overdue: taskOverdue,
      holding_open_count: openHoldCount,
      holding_open_value: openHoldValue,
      holding_open_value_text: fmtMoneyShort(openHoldValue),
      holding_lead_open: leadOpen,
      holding_deal_open: dealOpen,
      holding_deal_pipeline_count: useKhSplit ? khOpen.holding_deal_pipeline_count : dealOpen,
      holding_customer_order_count: useKhSplit ? khOpen.holding_customer_order_count : 0,
      holding_deal_pipeline_value: useKhSplit ? khOpen.holding_deal_pipeline_value : 0,
      holding_deal_pipeline_value_text: fmtMoneyShort(useKhSplit ? khOpen.holding_deal_pipeline_value : 0),
      holding_customer_order_value: useKhSplit ? khOpen.holding_customer_order_value : 0,
      holding_customer_order_value_text: fmtMoneyShort(useKhSplit ? khOpen.holding_customer_order_value : 0),
    },
    companies,
    new_items: newItems,
    won_items: wonItems,
    top_stage_transitions: topStageMoves,
    generated_at: nowIso,
  };
}

/** Text chat-bubble — báo cáo 1 NV, tách Deal / Đơn hàng như BC tổ chức. */
async function formatEmployeeActivityReportText(params = {}) {
  const data = await getEmployeeActivityReport(params);
  if (data.error === 'multiple_matches') {
    const lines = [`⚠️ ${data.message}`, ''];
    (data.matches || []).slice(0, 5).forEach((m, i) => {
      lines.push(`${i + 1}. ${m.full_name} · ${m.department_name || '—'} · ${m.company_name || '—'}`);
    });
    return { text: lines.join('\n').slice(0, 1900) };
  }
  if (data.error) return { text: `⚠️ ${data.error}` };

  const s = data.summary || {};
  const org = data.organization || {};
  const requestLabel = params.request_label || params.last_request || 'Báo cáo hoạt động';
  const lines = [];

  lines.push(`🎯 *${String(requestLabel).slice(0, 80)}*`);
  lines.push(`👤 *${data.user?.full_name || 'NV'}*`);
  if (org.company?.short_name || org.company?.name) {
    lines.push(`🏢 ${org.company.short_name || org.company.name}`);
  }
  if (org.department?.name) lines.push(`🏷 ${org.department.name}`);
  if (data.user?.position || data.user?.role) lines.push(`👔 ${data.user.position || data.user.role}`);
  if (org.regions?.length) lines.push(`📍 ${org.regions.map((r) => r.name).join(', ')}`);
  lines.push(`🗓 ${data.period}`);
  lines.push('────────────────────');
  lines.push('');
  lines.push('📊 *Tổng quan*');
  lines.push(`🆕 Lead mới · *${fmtInt(s.new_lead_count || 0)}*`);

  if (s.deal_kh_split) {
    lines.push(
      `🤝 Deal · *${fmtInt(s.new_deal_total || s.new_deal_count || 0)}*`
      + ` · Pipeline *${fmtInt(s.new_deal_pipeline_count || 0)}*`
      + ` · ĐH *${fmtInt(s.new_customer_order_count || 0)}*`
      + (s.new_total_value > 0 ? ` · 💰*${s.new_total_value_text}*` : ''),
    );
    if (s.new_deal_pipeline_value > 0 || s.new_customer_order_value > 0) {
      lines.push(`   ↳ Pipeline ${s.new_deal_pipeline_value_text} · ĐH ${s.new_customer_order_value_text}`);
    }
    if (s.won_or_later_count > 0 || s.won_or_later_value > 0) {
      lines.push(`✅ Chốt (≥ Thắng) · *${fmtInt(s.won_or_later_count || 0)}* · 💰*${s.won_or_later_value_text}*`);
    }
  } else {
    lines.push(
      `🤝 Deal mới · *${fmtInt(s.new_deal_count || 0)}*`
      + (s.new_total_value > 0 ? ` · 💰*${s.new_total_value_text}*` : ''),
    );
    if (s.won_count > 0 || s.won_value > 0) {
      lines.push(`✅ Chốt thắng · *${fmtInt(s.won_count || 0)}* · 💰*${s.won_value_text}*`);
    }
  }

  lines.push(`🔄 Stage chuyển · *${fmtInt(s.stage_moves || 0)}*`);
  lines.push(`❌ Thua · *${fmtInt(s.lost_count || 0)}*`);

  if (s.task_done_in_range > 0 || s.task_pending > 0 || s.task_overdue > 0) {
    lines.push(
      `✓ Task xong · *${fmtInt(s.task_done_in_range || 0)}*`
      + (s.task_done_late_in_range > 0 ? ` (trễ ${s.task_done_late_in_range})` : ''),
    );
    if (s.task_pending > 0 || s.task_overdue > 0) {
      lines.push(`⚠️ Task còn · *${fmtInt(s.task_pending || 0)}* chờ · *${fmtInt(s.task_overdue || 0)}* quá hạn`);
    }
  }

  if (s.holding_open_count > 0) {
    if (s.deal_kh_split) {
      lines.push(
        `📂 Đang giữ · *${fmtInt(s.holding_open_count || 0)}*`
        + ` (${fmtInt(s.holding_lead_open || 0)} lead · Pipeline ${fmtInt(s.holding_deal_pipeline_count || 0)} · ĐH ${fmtInt(s.holding_customer_order_count || 0)})`
        + ` · 💰*${s.holding_open_value_text}*`,
      );
    } else {
      lines.push(`📂 Đang giữ · *${fmtInt(s.holding_open_count || 0)}* · 💰*${s.holding_open_value_text}*`);
    }
  }

  if (data.companies?.length) {
    lines.push('', '🏬 *Theo công ty*');
    data.companies.slice(0, 5).forEach((c) => {
      const parts = [];
      if (c.new_leads) parts.push(`${c.new_leads} lead`);
      if (c.new_deals) parts.push(`${c.new_deals} deal`);
      if (c.stage_moves) parts.push(`${c.stage_moves} chuyển stage`);
      if (c.won) parts.push(`✅${c.won}`);
      if (c.lost) parts.push(`❌${c.lost}`);
      lines.push(`• ${c.company_name}: ${parts.join(' · ') || '—'}`);
    });
    if (data.companies.length > 5) lines.push(`… +${data.companies.length - 5} công ty`);
  }

  if (data.won_items?.length) {
    lines.push('', '🏆 *Deal đã thắng*');
    data.won_items.slice(0, 5).forEach((w) => {
      lines.push(`• [${w.code}] ${shortName(w.title)} · ${fmtMoneyShort(w.value)}`);
    });
  }

  if (data.new_items?.length) {
    lines.push('', '🆕 *Mới trong kỳ*');
    data.new_items.slice(0, 5).forEach((n) => {
      const bucket = n.deal_bucket === 'customer_order' ? 'ĐH' : (n.type === 'deal' ? 'Deal' : 'Lead');
      lines.push(`• [${n.code}] ${shortName(n.title)} · ${bucket}${n.value > 0 ? ` · ${fmtMoneyShort(n.value)}` : ''}`);
    });
  }

  if (data.top_stage_transitions?.length) {
    lines.push('', '🔁 *Chuyển stage nhiều nhất*');
    data.top_stage_transitions
      .filter((t) => t.transition !== 'Không rõ → Không rõ')
      .slice(0, 5)
      .forEach((t) => {
        lines.push(`• ${t.transition} · *${t.count}* lần`);
      });
  }

  return { text: lines.join('\n').slice(0, 1900), user_id: data.user?.id, period_label: data.period };
}

/**
 * Liệt kê NV trong scope (company/department/region) — kèm tổ chức + counts cơ bản.
 * Mặc định active=true.
 */
async function listEmployeesInScope({
  company_id,
  department_id,
  region_id,
  search,
  limit = 50,
  active_only = true,
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  let userIdsByRegion = null;
  if (region_id) {
    const { data: links } = await supabase
      .from('user_company_regions')
      .select('user_id')
      .eq('region_id', region_id);
    userIdsByRegion = [...new Set((links || []).map((l) => l.user_id))];
    if (!userIdsByRegion.length) {
      return { count: 0, employees: [], scope: { company_id, department_id, region_id } };
    }
  }

  // Department filter override company nếu cả 2 cùng truyền
  let deptIds = null;
  if (department_id) {
    deptIds = [department_id];
  } else if (company_id) {
    const { data: depts } = await supabase
      .from('departments')
      .select('id')
      .eq('company_id', company_id)
      .eq('is_active', true);
    deptIds = (depts || []).map((d) => d.id);
    // Một số user có company_id trực tiếp — ta sẽ post-filter chứ không OR trong SQL phức tạp
  }

  let q = supabase
    .from('users')
    .select('id, full_name, email, phone, role, position, department_id, company_id, is_active')
    .order('full_name')
    .limit(500);
  if (active_only) q = q.neq('is_active', false);
  if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  if (userIdsByRegion) q = q.in('id', userIdsByRegion);

  const { data: usersAll, error } = await q;
  if (error) return { error: error.message, employees: [] };

  const ctxMap = await loadUserOrgContext(usersAll || []);

  let filtered = usersAll || [];
  if (company_id && !department_id) {
    filtered = filtered.filter((u) => {
      const ctx = ctxMap.get(u.id);
      return ctx?.effective_company_id === company_id;
    });
  } else if (deptIds) {
    filtered = filtered.filter((u) => u.department_id && deptIds.includes(u.department_id));
  }

  const employees = filtered.slice(0, safeLimit).map((u) => {
    const ctx = ctxMap.get(u.id) || {};
    return {
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      role: u.role,
      position: u.position,
      department: ctx.department,
      company: ctx.company,
      regions: ctx.regions,
      effective_company_id: ctx.effective_company_id,
    };
  });

  return {
    count: employees.length,
    total_matched: filtered.length,
    scope: { company_id: company_id || null, department_id: department_id || null, region_id: region_id || null },
    employees,
  };
}

/* ─────────────────── RISK REPORT (SLA + overdue tasks + stagnant) ─────────────────── */

const { effectivePipelineStageSlaDays, crmLeadMissingPhone } = require('./crmPipelineSla');

/**
 * Tổng hợp rủi ro của Lead/Deal trong scope:
 *   1. sla_breached      — đã vượt SLA stage (stage_entered_at + sla_days < now)
 *   2. sla_due_soon      — sắp vượt SLA trong N ngày tới (mặc định 3)
 *   3. stagnant_in_stage — đứng yên trong stage quá X ngày (mặc định 14, không phụ thuộc SLA)
 *   4. overdue_tasks     — crm_tasks deadline < now, status != done, gắn vào lead/deal đang mở
 *
 * Filter: company_id, pipeline_type ('lead' | 'deal'), user_filter_ids.
 */
async function getLeadDealRiskReport({
  company_id,
  pipeline_type,
  user_filter_ids,
  schedule_id,
  personal_recipient_user_id,
  due_soon_days = 3,
  stagnation_days = 14,
  limit_per_section = 15,
} = {}) {
  const safeDueSoon = Math.min(Math.max(Number(due_soon_days) || 3, 1), 14);
  const safeStagnation = Math.min(Math.max(Number(stagnation_days) || 14, 3), 90);
  const safeLimit = Math.min(Math.max(Number(limit_per_section) || 15, 1), 50);

  let assigneeIds = null;
  if (Array.isArray(user_filter_ids) && user_filter_ids.length) {
    assigneeIds = user_filter_ids.map(String);
  } else if (personal_recipient_user_id) {
    assigneeIds = [String(personal_recipient_user_id)];
  } else if (schedule_id) {
    assigneeIds = await resolveAssigneeIds({ schedule_id });
  }

  // 1) Lấy mọi lead/deal đang mở
  let leadQ = supabase
    .from('crm_leads')
    .select(
      'id, code, title, type, phone, company_id, stage_id, stage_entered_at, created_at, '
      + 'estimated_value, assigned_to, '
      + 'assignee:users!crm_leads_assigned_to_fkey(id, full_name), '
      + 'stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, sla_days, pipeline_type, is_won, is_lost)'
    )
    .is('actual_close_date', null)
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (company_id) leadQ = leadQ.eq('company_id', company_id);
  if (assigneeIds) leadQ = leadQ.in('assigned_to', assigneeIds);

  const { data: leads, error: leadErr } = await leadQ;
  if (leadErr) return { error: leadErr.message };

  const filtered = (leads || []).filter((l) => {
    if (l.stage?.is_won || l.stage?.is_lost) return false;
    if (pipeline_type && l.stage?.pipeline_type && l.stage.pipeline_type !== pipeline_type) return false;
    return true;
  });

  const nowMs = Date.now();
  const dueSoonHorizon = nowMs + safeDueSoon * 24 * 3600 * 1000;
  const stagnationCutoff = nowMs - safeStagnation * 24 * 3600 * 1000;

  const slaBreached = [];
  const slaDueSoon = [];
  const stagnantInStage = [];

  for (const l of filtered) {
    const slaDays = effectivePipelineStageSlaDays(l.stage?.sla_days);
    const entered = l.stage_entered_at || l.created_at;
    const enteredMs = entered ? new Date(entered).getTime() : null;

    // SLA breach / due soon — bỏ lead chưa có SĐT
    if (slaDays != null && enteredMs && !crmLeadMissingPhone(l)) {
      const dueMs = enteredMs + slaDays * 24 * 3600 * 1000;
      const baseItem = {
        id: l.id,
        code: l.code,
        title: l.title,
        type: l.type || 'lead',
        stage_name: l.stage?.name,
        sla_days: slaDays,
        stage_entered_at: entered,
        due_at: new Date(dueMs).toISOString(),
        assignee: l.assignee?.full_name || null,
        assignee_id: l.assigned_to,
        estimated_value: l.estimated_value,
        link: leadDetailUrl(l.id),
      };
      if (dueMs < nowMs) {
        slaBreached.push({
          ...baseItem,
          overdue_days: Math.round((nowMs - dueMs) / (24 * 3600 * 1000)),
        });
      } else if (dueMs <= dueSoonHorizon) {
        slaDueSoon.push({
          ...baseItem,
          due_in_hours: Math.round((dueMs - nowMs) / 3600000),
        });
      }
    }

    // Stagnation in stage (độc lập SLA)
    if (enteredMs && enteredMs < stagnationCutoff) {
      stagnantInStage.push({
        id: l.id,
        code: l.code,
        title: l.title,
        type: l.type || 'lead',
        stage_name: l.stage?.name,
        days_in_stage: Math.round((nowMs - enteredMs) / (24 * 3600 * 1000)),
        assignee: l.assignee?.full_name || null,
        estimated_value: l.estimated_value,
        link: leadDetailUrl(l.id),
      });
    }
  }

  slaBreached.sort((a, b) => b.overdue_days - a.overdue_days);
  slaDueSoon.sort((a, b) => a.due_in_hours - b.due_in_hours);
  stagnantInStage.sort((a, b) => b.days_in_stage - a.days_in_stage);

  // 4) Task quá hạn của các lead trong scope (chunk lead_ids tránh URL quá dài)
  const overdueTasks = [];
  const leadIds = filtered.map((l) => l.id);
  if (leadIds.length) {
    const leadMap = new Map(filtered.map((l) => [l.id, l]));
    const CHUNK = 100;
    for (let i = 0; i < leadIds.length; i += CHUNK) {
      const slice = leadIds.slice(i, i + CHUNK);
      let taskQ = supabase
        .from('crm_tasks')
        .select('id, title, deadline, priority, status, assignee_id, lead_id, assignee:users!crm_tasks_assignee_id_fkey(id, full_name)')
        .in('lead_id', slice)
        .in('status', ['pending', 'in_progress'])
        .not('deadline', 'is', null)
        .lt('deadline', new Date(nowMs).toISOString())
        .order('deadline', { ascending: true })
        .limit(500);
      if (assigneeIds) taskQ = taskQ.in('assignee_id', assigneeIds);
      const { data: taskRows } = await taskQ;
      for (const t of taskRows || []) {
        const lead = leadMap.get(t.lead_id);
        const dl = new Date(t.deadline).getTime();
        overdueTasks.push({
          task_id: t.id,
          title: t.title,
          deadline: t.deadline,
          overdue_days: Math.round((nowMs - dl) / (24 * 3600 * 1000)),
          priority: t.priority,
          assignee: t.assignee?.full_name || null,
          lead_id: t.lead_id,
          lead_code: lead?.code || null,
          lead_title: lead?.title || null,
          lead_type: lead?.type || 'lead',
          link: leadDetailUrl(t.lead_id),
        });
      }
    }
    overdueTasks.sort((a, b) => b.overdue_days - a.overdue_days);
  }

  return {
    scope: {
      company_id: company_id || null,
      pipeline_type: pipeline_type || 'all',
      assignee_count: assigneeIds ? assigneeIds.length : null,
      personal: !!personal_recipient_user_id,
    },
    thresholds: {
      due_soon_days: safeDueSoon,
      stagnation_days: safeStagnation,
    },
    totals: {
      open_leads: filtered.length,
      sla_breached: slaBreached.length,
      sla_due_soon: slaDueSoon.length,
      stagnant: stagnantInStage.length,
      overdue_tasks: overdueTasks.length,
    },
    sla_breached: slaBreached.slice(0, safeLimit),
    sla_due_soon: slaDueSoon.slice(0, safeLimit),
    stagnant_in_stage: stagnantInStage.slice(0, safeLimit),
    overdue_tasks: overdueTasks.slice(0, safeLimit),
    sla_breached_total_value: slaBreached.reduce((s, x) => s + (Number(x.estimated_value) || 0), 0),
    stagnant_total_value: stagnantInStage.reduce((s, x) => s + (Number(x.estimated_value) || 0), 0),
    generated_at: new Date().toISOString(),
  };
}

/**
 * Render text gọn cho chat bubble: tổng quan + top 5/section + nhóm top NV gánh rủi ro.
 * Dùng khi sếp hỏi "báo cáo lead/deal quá hạn SLA", "rủi ro pipeline cty X".
 */
async function formatLeadDealRiskText({
  company_id,
  pipeline_type,
  user_filter_ids,
  schedule_id,
  personal_recipient_user_id,
  due_soon_days,
  stagnation_days,
  top_per_section = 5,
  today_only = false,
} = {}) {
  const r = await getLeadDealRiskReport({
    company_id, pipeline_type, user_filter_ids, schedule_id,
    personal_recipient_user_id,
    due_soon_days: today_only ? 1 : due_soon_days,
    stagnation_days,
    limit_per_section: 200,
  });
  if (r.error) return `❌ ${r.error}`;

  // Khi today_only: filter sla_breached + sla_due_soon về NGÀY HÔM NAY (VN)
  if (today_only) {
    const nowMs = Date.now();
    const todayYmd = vnDateYmd();
    const todayStartMs = new Date(`${todayYmd}T00:00:00+07:00`).getTime();
    const todayEndMs = new Date(`${todayYmd}T23:59:59+07:00`).getTime();
    r.sla_breached = (r.sla_breached || []).filter((x) => {
      const dueMs = new Date(x.due_at).getTime();
      return dueMs >= todayStartMs && dueMs <= nowMs;
    });
    r.sla_due_soon = (r.sla_due_soon || []).filter((x) => {
      const dueMs = new Date(x.due_at).getTime();
      return dueMs >= nowMs && dueMs <= todayEndMs;
    });
    r.totals = {
      ...r.totals,
      sla_breached: r.sla_breached.length,
      sla_due_soon: r.sla_due_soon.length,
    };
    r.sla_breached_total_value = r.sla_breached.reduce((s, x) => s + (Number(x.estimated_value) || 0), 0);
  }

  let companyName = '';
  if (company_id) {
    const { data: c } = await supabase
      .from('companies').select('name, short_name').eq('id', company_id).maybeSingle();
    companyName = c?.short_name || c?.name || '';
  }

  const topN = Math.min(Math.max(Number(top_per_section) || 5, 1), 15);
  const t = r.totals;
  const th = r.thresholds;

  const lines = [];
  const titleSuffix = today_only ? ' · HÔM NAY' : '';
  lines.push(`🚨 *Rủi ro Lead/Deal${companyName ? ` · ${companyName}` : ''}${titleSuffix}*`);
  if (r.scope.pipeline_type && r.scope.pipeline_type !== 'all') {
    lines.push(`📂 Pipeline: ${r.scope.pipeline_type}`);
  }
  if (!today_only) lines.push(`🧮 Đang mở trong scope: *${fmtInt(t.open_leads)}*`);
  lines.push('━━━━━━━━━━━━━');
  if (today_only) {
    lines.push(`⚠️ Vừa quá SLA hôm nay: *${t.sla_breached}*` + (r.sla_breached_total_value > 0 ? ` · 💰${fmtMoneyShort(r.sla_breached_total_value)}` : ''));
    lines.push(`⏰ Sắp quá SLA trong ngày: *${t.sla_due_soon}*`);
  } else {
    lines.push(`⚠️ Quá SLA: *${t.sla_breached}*` + (r.sla_breached_total_value > 0 ? ` · 💰${fmtMoneyShort(r.sla_breached_total_value)}` : ''));
    lines.push(`⏰ Sắp quá SLA (<${th.due_soon_days}d): ${t.sla_due_soon}`);
    lines.push(`⏳ Đứng yên >${th.stagnation_days}d: ${t.stagnant}` + (r.stagnant_total_value > 0 ? ` · 💰${fmtMoneyShort(r.stagnant_total_value)}` : ''));
    lines.push(`📋 Task quá hạn: ${t.overdue_tasks}`);
  }

  // Helper: in mã code thành markdown link [CODE](url) nếu có id → FE sẽ tự render thành nút bấm.
  const codeLink = (codeStr, idOrLink) => {
    if (!codeStr) return '—';
    const url = idOrLink && idOrLink.startsWith('http') ? idOrLink : (idOrLink ? leadDetailUrl(idOrLink) : null);
    return url ? `[${codeStr}](${url})` : codeStr;
  };

  if (t.sla_breached > 0) {
    lines.push('', `⚠️ *Top quá SLA*`);
    for (const r2 of r.sla_breached.slice(0, topN)) {
      const tag = r2.type === 'deal' ? 'D' : 'L';
      const val = r2.estimated_value > 0 ? ` · ${fmtMoneyShort(r2.estimated_value)}` : '';
      lines.push(`  • [${tag}] ${codeLink(r2.code, r2.link || r2.id)} · ${shortName(r2.assignee || '—')} · trễ ${r2.overdue_days}d (SLA ${r2.sla_days}d)${val}`);
    }
    if (t.sla_breached > topN) lines.push(`   …+${t.sla_breached - topN} lead/deal khác`);
  }

  if (t.sla_due_soon > 0) {
    lines.push('', `⏰ *Sắp quá SLA*`);
    for (const r2 of r.sla_due_soon.slice(0, topN)) {
      const tag = r2.type === 'deal' ? 'D' : 'L';
      lines.push(`  • [${tag}] ${codeLink(r2.code, r2.link || r2.id)} · ${shortName(r2.assignee || '—')} · còn ${r2.due_in_hours}h`);
    }
    if (t.sla_due_soon > topN) lines.push(`   …+${t.sla_due_soon - topN} khác`);
  }

  if (!today_only && t.stagnant > 0) {
    lines.push('', `⏳ *Đứng yên lâu nhất*`);
    for (const r2 of r.stagnant_in_stage.slice(0, topN)) {
      const tag = r2.type === 'deal' ? 'D' : 'L';
      const val = r2.estimated_value > 0 ? ` · ${fmtMoneyShort(r2.estimated_value)}` : '';
      lines.push(`  • [${tag}] ${codeLink(r2.code, r2.link || r2.id)} · ${shortName(r2.stage_name || '—')} · ${shortName(r2.assignee || '—')} · ${r2.days_in_stage}d${val}`);
    }
    if (t.stagnant > topN) lines.push(`   …+${t.stagnant - topN} khác`);
  }

  if (!today_only && t.overdue_tasks > 0) {
    lines.push('', `📋 *Task quá hạn (top)*`);
    for (const tk of r.overdue_tasks.slice(0, topN)) {
      const lead = tk.lead_code ? `[${codeLink(tk.lead_code, tk.lead_link || tk.lead_id)}] ` : '';
      lines.push(`  • ${lead}${shortName(tk.title)} · ${shortName(tk.assignee || '—')} · trễ ${tk.overdue_days}d`);
    }
    if (t.overdue_tasks > topN) lines.push(`   …+${t.overdue_tasks - topN} khác`);
  }

  if (today_only && t.sla_breached === 0 && t.sla_due_soon === 0) {
    lines.push('', '✅ Không có lead/deal nào cần xử lý SLA trong hôm nay.');
  }

  if (!today_only && (t.sla_breached > 0 || t.stagnant > 0)) {
    const burden = new Map();
    for (const x of r.sla_breached) {
      if (!x.assignee) continue;
      const cur = burden.get(x.assignee) || { sla: 0, stag: 0, value: 0 };
      cur.sla += 1;
      cur.value += Number(x.estimated_value) || 0;
      burden.set(x.assignee, cur);
    }
    for (const x of r.stagnant_in_stage) {
      if (!x.assignee) continue;
      const cur = burden.get(x.assignee) || { sla: 0, stag: 0, value: 0 };
      cur.stag += 1;
      cur.value += Number(x.estimated_value) || 0;
      burden.set(x.assignee, cur);
    }
    const ranked = [...burden.entries()]
      .map(([name, v]) => ({ name, ...v, total: v.sla + v.stag }))
      .sort((a, b) => b.total - a.total)
      .slice(0, topN);
    if (ranked.length) {
      lines.push('', `👥 *Top NV gánh rủi ro*`);
      for (const x of ranked) {
        const parts = [];
        if (x.sla) parts.push(`⚠️${x.sla}`);
        if (x.stag) parts.push(`⏳${x.stag}`);
        if (x.value > 0) parts.push(`💰${fmtMoneyShort(x.value)}`);
        lines.push(`  • ${shortName(x.name)} · ${parts.join(' · ')}`);
      }
    }
  }

  return lines.join('\n').slice(0, 1900);
}

/* ─────────────────── CHANNEL CONTEXT (task/lead/CSKH/KPI) ─────────────────── */

function pickArr(payload, key, limit) {
  const arr = Array.isArray(payload?.[key]) ? payload[key] : [];
  return limit ? arr.slice(0, limit) : arr;
}

/**
 * Trả "payload kênh" giống các playbook daily_brief / overdue / vip / tasks_due_week / tasks_due_month / end_of_day.
 * Hỗ trợ filter scope qua focus = 'overdue' | 'due_soon' | 'tasks_week' | 'tasks_month'
 *   | 'leads_open' | 'leads_expired' | 'leads_expiring_tomorrow' | 'vip_leads' | 'done_today' | 'cskh_needed' | 'all'.
 */
async function getChannelWorkContext({
  channel_type,
  channel_id,
  focus = 'all',
  member_user_ids,
  limit = 20,
  ctx_channel_type,
  ctx_channel_id,
}) {
  const {
    loadChannelMemberIds,
    buildChannelContextPayload,
  } = require('./aiBotSender');

  const cType = channel_type || ctx_channel_type;
  const cId = channel_id || ctx_channel_id;

  let memberIds = [];
  if (Array.isArray(member_user_ids) && member_user_ids.length) {
    const { data } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', member_user_ids)
      .neq('is_active', false);
    memberIds = (data || []).map((u) => ({ id: u.id, full_name: u.full_name }));
  } else if (cType && cId) {
    memberIds = await loadChannelMemberIds(cType, cId);
  } else {
    return { error: 'Thiếu channel_type+channel_id hoặc member_user_ids', items: {} };
  }

  if (!memberIds.length) {
    return { error: 'Kênh không có thành viên', items: {} };
  }

  const payload = await buildChannelContextPayload(memberIds);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 60);
  const lim = (key) => pickArr(payload, key, safeLimit);

  const result = {
    generated_at: payload.generated_at,
    members: payload.members,
    member_count: payload.members.length,
  };

  const wants = new Set(
    focus === 'all'
      ? ['overdue', 'due_soon', 'tasks_week', 'tasks_month', 'leads_open', 'leads_expired', 'leads_expiring_tomorrow', 'vip_leads', 'done_today', 'cskh_needed']
      : [focus],
  );

  if (wants.has('overdue')) {
    result.crm_tasks_overdue = lim('crm_tasks_overdue');
    result.tasks_overdue = lim('tasks_overdue');
    result.total_overdue = (payload.crm_tasks_overdue?.length || 0) + (payload.tasks_overdue?.length || 0);
  }
  if (wants.has('due_soon')) {
    result.crm_tasks_due_soon = lim('crm_tasks_due_soon');
    result.tasks_due_soon = lim('tasks_due_soon');
  }
  if (wants.has('tasks_week')) result.tasks_due_this_week = lim('tasks_due_this_week');
  if (wants.has('tasks_month')) result.tasks_due_this_month = lim('tasks_due_this_month');
  if (wants.has('leads_open')) result.leads_open = lim('leads_open');
  if (wants.has('leads_expired')) {
    result.leads_expired = lim('leads_expired');
    result.total_leads_expired = payload.leads_expired?.length || 0;
  }
  if (wants.has('leads_expiring_tomorrow')) {
    result.leads_expiring_tomorrow = lim('leads_expiring_tomorrow');
    result.total_leads_expiring_tomorrow = payload.leads_expiring_tomorrow?.length || 0;
  }
  if (wants.has('vip_leads')) result.vip_leads = lim('vip_leads');
  if (wants.has('done_today')) result.tasks_done_today = lim('tasks_done_today');
  if (wants.has('cskh_needed')) result.cskh_needed = lim('cskh_needed');

  return result;
}

/** KPI tháng (top, at_risk, avg) — gói gọn cho AI. */
async function getChannelKpiSummary({ channel_type, channel_id, member_user_ids, ctx_channel_type, ctx_channel_id }) {
  const { loadChannelMemberIds, buildKpiPayload } = require('./aiBotSender');

  const cType = channel_type || ctx_channel_type;
  const cId = channel_id || ctx_channel_id;

  let memberIds = [];
  if (Array.isArray(member_user_ids) && member_user_ids.length) {
    const { data } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', member_user_ids)
      .neq('is_active', false);
    memberIds = (data || []).map((u) => ({ id: u.id, full_name: u.full_name }));
  } else if (cType && cId) {
    memberIds = await loadChannelMemberIds(cType, cId);
  } else {
    return { error: 'Thiếu channel_type+channel_id hoặc member_user_ids' };
  }

  const data = await buildKpiPayload(memberIds);
  return {
    period: data.period,
    rows: data.rows,
    top_performer: data.top_performer,
    at_risk: data.at_risk,
    avg_points: data.avg_points,
    members_with_data: data.members_with_data,
  };
}

/** Liệt kê thành viên kênh hiện tại (để AI biết "ai trong nhóm"). */
async function getChannelMembers({ channel_type, channel_id, ctx_channel_type, ctx_channel_id }) {
  const { loadChannelMemberIds } = require('./aiBotSender');
  const cType = channel_type || ctx_channel_type;
  const cId = channel_id || ctx_channel_id;
  if (!cType || !cId) return { error: 'Thiếu channel_type+channel_id', members: [] };
  const list = await loadChannelMemberIds(cType, cId);
  return { count: list.length, members: list };
}

/* ─────────────────── ONLINE / PRESENCE ─────────────────── */

async function getOnlineUsers({ company_id, department_id, limit = 50 } = {}) {
  const { listUsersWithActivity, ONLINE_THRESHOLD_MS } = require('./userPresence');
  try {
    const { users, stats } = await listUsersWithActivity({
      companyId: company_id || undefined,
      departmentId: department_id || undefined,
      onlineOnly: true,
    });
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const slim = (users || []).slice(0, safeLimit).map((u) => ({
      id: u.id,
      full_name: u.full_name,
      role: u.role,
      position: u.position,
      department: u.department?.name || null,
      last_ping_at: u.last_ping_at,
      online_devices: u.online_devices || 0,
    }));
    return {
      online_threshold_seconds: Math.round(ONLINE_THRESHOLD_MS / 1000),
      online_count: stats.online,
      total_count: stats.total,
      users: slim,
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    if (/user_last_activity/i.test(err.message || '')) {
      return {
        error: 'Chưa migrate database/67_user_activity_and_messenger_pins.sql',
        users: [],
      };
    }
    return { error: err.message, users: [] };
  }
}

/* ─────────────────── ACTIVITY LOG (cho AI học) ─────────────────── */

async function getUserActivityHistory({ user_id, days = 7, actions, modules, limit = 50, ctx_user_id }) {
  const uid = user_id || ctx_user_id;
  if (!uid) return { error: 'Thiếu user_id', items: [] };
  const safeDays = Math.min(Math.max(Number(days) || 7, 1), 30);
  const since = new Date(Date.now() - safeDays * 24 * 3600 * 1000).toISOString();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  let q = supabase
    .from('user_activity_log')
    .select('action_type, module, feature, entity_type, entity_id, path, query, label, importance, created_at')
    .eq('user_id', uid)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (Array.isArray(actions) && actions.length) q = q.in('action_type', actions);
  else q = q.gte('importance', 1);

  if (Array.isArray(modules) && modules.length) q = q.in('module', modules);

  const { data, error } = await q;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return { error: 'Bảng user_activity_log chưa migrate', items: [] };
    }
    return { error: error.message, items: [] };
  }
  return {
    user_id: uid,
    since,
    days: safeDays,
    count: (data || []).length,
    items: (data || []).map((r) => ({
      at: r.created_at,
      action: r.action_type,
      module: r.module,
      feature: r.feature,
      label: r.label,
      path: r.path,
      query: r.query,
      entity: r.entity_type ? { type: r.entity_type, id: r.entity_id } : null,
    })),
  };
}

async function summarizeUserActivity({ user_id, days = 7, ctx_user_id }) {
  const uid = user_id || ctx_user_id;
  if (!uid) return { error: 'Thiếu user_id' };
  const safeDays = Math.min(Math.max(Number(days) || 7, 1), 30);
  const since = new Date(Date.now() - safeDays * 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from('user_activity_log')
    .select('action_type, module, feature, label, query, created_at, importance')
    .eq('user_id', uid)
    .gte('created_at', since)
    .gte('importance', 1)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return { error: 'Bảng user_activity_log chưa migrate' };
    }
    return { error: error.message };
  }

  const rows = data || [];
  const byModule = {};
  const byAction = {};
  const filterPhrases = {};
  for (const r of rows) {
    byModule[r.module || '_none_'] = (byModule[r.module || '_none_'] || 0) + 1;
    byAction[r.action_type] = (byAction[r.action_type] || 0) + 1;
    if (r.action_type === 'filter' && r.label) {
      filterPhrases[r.label] = (filterPhrases[r.label] || 0) + 1;
    }
  }
  const topModules = Object.entries(byModule).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topActions = Object.entries(byAction).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topFilters = Object.entries(filterPhrases).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const last = rows[0];

  return {
    user_id: uid,
    since,
    days: safeDays,
    total_actions: rows.length,
    top_modules: topModules.map(([m, c]) => ({ module: m, count: c })),
    top_actions: topActions.map(([a, c]) => ({ action: a, count: c })),
    top_filters: topFilters.map(([label, c]) => ({ label, count: c })),
    last_action: last
      ? { at: last.created_at, action: last.action_type, module: last.module, label: last.label }
      : null,
  };
}

/** Format ISO timestamptz → chuỗi VN có giây (vd "26/05/2026, 08:01:35"). */
function formatAtVnSeconds(iso) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: VN_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

function formatDurationMs(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}p ${s}s`;
  if (m > 0) return `${m}p ${s}s`;
  return `${s}s`;
}

async function getAuthEventsHistory({ user_id, days = 7, events, limit = 50, ctx_user_id }) {
  const uid = user_id || ctx_user_id;
  if (!uid) return { error: 'Thiếu user_id', items: [] };
  const safeDays = Math.min(Math.max(Number(days) || 7, 1), 30);
  const since = new Date(Date.now() - safeDays * 24 * 3600 * 1000).toISOString();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  let q = supabase
    .from('auth_event_log')
    .select('event, reason, ip, platform, device_name, session_id, metadata, occurred_at')
    .eq('user_id', uid)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(safeLimit);

  if (Array.isArray(events) && events.length) q = q.in('event', events);

  const { data, error } = await q;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return { error: 'Bảng auth_event_log chưa migrate — chạy database/241_auth_event_log.sql', items: [] };
    }
    return { error: error.message, items: [] };
  }

  return {
    user_id: uid,
    since,
    days: safeDays,
    count: (data || []).length,
    items: (data || []).map((r) => ({
      at: r.occurred_at,
      at_vn: formatAtVnSeconds(r.occurred_at),
      event: r.event,
      reason: r.reason,
      device: r.device_name || r.platform,
      ip: r.ip,
      session_id: r.session_id,
      session_duration: r.metadata?.ms_session_duration
        ? formatDurationMs(Number(r.metadata.ms_session_duration))
        : null,
    })),
  };
}

async function summarizeAuthSessions({ user_id, days = 7, ctx_user_id }) {
  const uid = user_id || ctx_user_id;
  if (!uid) return { error: 'Thiếu user_id' };
  const safeDays = Math.min(Math.max(Number(days) || 7, 1), 30);
  const since = new Date(Date.now() - safeDays * 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from('auth_event_log')
    .select('event, reason, device_name, platform, session_id, metadata, occurred_at')
    .eq('user_id', uid)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(500);

  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return { error: 'Bảng auth_event_log chưa migrate — chạy database/241_auth_event_log.sql' };
    }
    return { error: error.message };
  }

  const rows = data || [];
  const byEvent = {};
  const sessions = [];
  const loginBySession = new Map();

  for (const r of rows) {
    byEvent[r.event] = (byEvent[r.event] || 0) + 1;
    if (r.event === 'login_success' && r.session_id) {
      loginBySession.set(r.session_id, r);
    }
  }

  for (const r of rows) {
    const isLogout = ['logout', 'auto_logout_midnight', 'session_expired'].includes(r.event);
    if (!isLogout || !r.session_id) continue;
    const login = loginBySession.get(r.session_id);
    if (!login) continue;
    const msDur = r.metadata?.ms_session_duration
      ? Number(r.metadata.ms_session_duration)
      : new Date(r.occurred_at).getTime() - new Date(login.occurred_at).getTime();
    sessions.push({
      session_id: r.session_id,
      login_at_vn: formatAtVnSeconds(login.occurred_at),
      logout_at_vn: formatAtVnSeconds(r.occurred_at),
      logout_event: r.event,
      logout_reason: r.reason,
      device: login.device_name || login.platform,
      duration: formatDurationMs(msDur),
    });
    loginBySession.delete(r.session_id);
  }

  const lastLogin = rows.find((r) => r.event === 'login_success');
  const lastLogout = rows.find((r) => ['logout', 'auto_logout_midnight', 'session_expired'].includes(r.event));
  const openSessions = [...loginBySession.values()].map((login) => ({
    session_id: login.session_id,
    login_at_vn: formatAtVnSeconds(login.occurred_at),
    device: login.device_name || login.platform,
    still_open: true,
  }));

  return {
    user_id: uid,
    since,
    days: safeDays,
    total_events: rows.length,
    by_event: byEvent,
    completed_sessions: sessions.slice(0, 20),
    open_sessions: openSessions.slice(0, 5),
    last_login: lastLogin
      ? {
          at_vn: formatAtVnSeconds(lastLogin.occurred_at),
          device: lastLogin.device_name || lastLogin.platform,
        }
      : null,
    last_logout: lastLogout
      ? {
          at_vn: formatAtVnSeconds(lastLogout.occurred_at),
          event: lastLogout.event,
          reason: lastLogout.reason,
        }
      : null,
    failed_logins: byEvent.login_failed || 0,
  };
}

/** OpenAI tools JSON schema */
const OPENAI_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_companies_in_scope',
      description: 'Liệt kê công ty trong phạm vi báo cáo của schedule',
      parameters: {
        type: 'object',
        properties: {
          schedule_id: { type: 'string', description: 'UUID schedule (optional nếu đã có trong context)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_users_by_name',
      description: 'Tra cứu nhân viên theo tên / email (ILIKE). Dùng khi user hỏi "lead của NV X", "doanh số của Y" để lấy user_id chính xác trước khi gọi các tool khác.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Tên hoặc 1 phần tên / email NV cần tìm' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_company_lead_summary',
      description: 'Tóm tắt lead/deal công ty trong kỳ: lead mới, chuyển deal, thắng, thua. Có thể giới hạn theo NV cụ thể qua user_filter_ids.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string' },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer', description: 'Dùng với time_scope=custom (số ngày lùi từ hôm nay)' },
          schedule_id: { type: 'string' },
          user_filter_ids: { type: 'array', items: { type: 'string' }, description: 'Mảng user_id để chỉ tính cho các NV này (override whitelist của schedule). Dùng khi user hỏi về NV cụ thể.' },
        },
        required: ['company_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_departments_in_company',
      description:
        'Liệt kê các phòng ban thuộc 1 công ty (id, name, số NV active). '
        + 'Dùng để resolve "Phòng Kinh doanh / phòng kho / phòng kế toán..." → department_id '
        + 'trước khi gọi format_company_report_text với department_id.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string' },
          search: { type: 'string', description: 'Lọc theo tên phòng (ILIKE).' },
        },
        required: ['company_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'format_company_report_text',
      description:
        'TRẢ VỀ TEXT đã format sẵn (chat-bubble friendly) cho báo cáo 1 công ty / 1 phòng ban / 1 nhóm NV: '
        + 'tổng quan (lead/deal mới, won/lost, doanh thu) + Theo nhân viên (có giá trị tiền per-NV) + Quá hạn chi tiết. '
        + 'DÙNG TOOL NÀY khi sếp xin: "báo cáo cty X [kỳ]", "phòng X tháng này / tuần này", "khối kinh doanh tháng 5", '
        + '"các NV [list] báo cáo hôm nay". '
        + 'Truyền department_id để giới hạn ở 1 phòng (kèm company_id để giới hạn theo công ty của phòng đó). '
        + 'Hoặc truyền user_filter_ids[] để giới hạn theo danh sách NV cụ thể. '
        + 'Tool đã chốt format đúng + đầy đủ NV + tiền rút gọn. '
        + 'AI CHỈ cần in nguyên trường text trả về, KHÔNG được tự viết lại — tránh bị bịa số.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string', description: 'BẮT BUỘC. UUID công ty (resolve từ last_company_id hoặc list_companies_in_scope).' },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer' },
          include_employees: { type: 'boolean', description: 'Mặc định true' },
          department_id: { type: 'string', description: 'Tùy chọn — UUID phòng ban để chỉ tính NV thuộc phòng.' },
          department_name: { type: 'string', description: 'Tùy chọn — tên/keyword phòng ban (ILIKE) để tool tự resolve, vd "Kinh doanh", "kho", "kế toán". Ưu tiên department_id nếu có.' },
          user_filter_ids: { type: 'array', items: { type: 'string' }, description: 'Tùy chọn — list UUID NV cụ thể.' },
          scope_label: { type: 'string', description: 'Tùy chọn — label header (mặc định tự resolve từ department).' },
        },
        required: ['company_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'format_org_overview_report_text',
      description:
        'TRẢ VỀ TEXT đã format (chat-bubble) cho BÁO CÁO THEO TỔ CHỨC — cùng logic trang «Báo cáo theo tổ chức» (GET /crm/reports/org-overview). '
        + 'Cơ sở created_at. Metrics: lead/deal/đơn hàng, pipeline value, đã chốt, huỷ/thua, tỉ lệ chốt, SLA quá hạn, tiếp nhận trễ, KPI sổ cái, top NV, so kỳ trước. '
        + 'DÙNG KHI user hỏi: "báo cáo tổ chức", "BC theo tổ chức", "tổng quan công ty tháng này", "tỉ lệ chốt", "pipeline value", "KPI sổ cái", "so với kỳ trước", "theo khu vực". '
        + 'KHÔNG dùng cho "lead mới hôm nay / chuyển deal hôm nay" (dùng format_company_report_text). '
        + 'KHÔNG dùng khi cần cột tab Nhân viên (Deal, tiếp nhận, Ký HĐ, BG, KPI…) — dùng format_org_employee_tab_report_text. '
        + 'AI CHỈ in nguyên result.text.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string', description: 'UUID công ty (optional — mặc định theo quyền user / last_company_id)' },
          region_id: { type: 'string', description: 'Lọc theo khu vực' },
          department_id: { type: 'string', description: 'Lọc theo phòng ban' },
          assigned_to: { type: 'string', description: 'Lọc theo 1 NV (user_id)' },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer' },
          date_from: { type: 'string', description: 'YYYY-MM-DD (override time_scope)' },
          date_to: { type: 'string', description: 'YYYY-MM-DD (override time_scope)' },
          type: { type: 'string', enum: ['all', 'lead', 'deal'], description: 'Tab Lead / Deal / Tất cả' },
          compare: { type: 'boolean', description: 'So sánh kỳ trước (mặc định true)' },
          deal_kh_split: { type: 'boolean', description: 'Tách Deal / Đơn hàng (mặc định theo công ty)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'format_org_employee_tab_report_text',
      description:
        'TRẢ VỀ TEXT tab NHÂN VIÊN trang «Báo cáo theo tổ chức» — cùng cột bảng NV: Deal, Số Deal tiếp nhận, Ký HĐ thành công, '
        + 'Đúng hạn (A), Trễ hạn, Tỷ lệ chốt/tổng deal, Chốt/tổng deal (GT), Tỷ lệ hủy, Tổng BG, GT báo giá, Chốt SL, GT chốt, '
        + 'Tỷ lệ chốt/BG, Tăng trưởng, Dự kiến, Kỳ vọng, Điểm KPI. Cơ sở created_at. '
        + 'DÙNG KHI: "báo cáo phòng kinh doanh tháng 6", "BC tổ chức tab nhân viên", "báo cáo công ty X phòng KD", '
        + '"số liệu NV theo BC tổ chức", "Deal tiếp nhận / Ký HĐ / BG / KPI từng NV". '
        + 'KHÔNG dùng cho báo cáo nhanh lead MỚI / chuyển deal hôm nay (format_company_report_text). '
        + 'Truyền company_name hoặc company_id + department_name (vd "kinh doanh") + time_scope hoặc date_from/date_to. '
        + 'AI CHỈ in nguyên result.text.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string' },
          company_name: { type: 'string', description: 'Tên công ty — tool tự ILIKE resolve company_id' },
          region_id: { type: 'string' },
          department_id: { type: 'string' },
          department_name: { type: 'string', description: 'vd "kinh doanh", "KD"' },
          assigned_to: { type: 'string' },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer' },
          date_from: { type: 'string', description: 'YYYY-MM-DD (vd tháng 6: 2026-06-01)' },
          date_to: { type: 'string', description: 'YYYY-MM-DD (vd tháng 6: 2026-06-30)' },
          type: { type: 'string', enum: ['all', 'lead', 'deal'] },
          deal_kh_split: { type: 'boolean' },
          top_n: { type: 'integer', description: 'Số NV tối đa (mặc định 15, max 25)' },
          only_with_activity: { type: 'boolean', description: 'Chỉ NV có số liệu trong kỳ (mặc định true)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_org_overview_report',
      description:
        'JSON báo cáo tổ chức (org-overview) — cùng API trang BC tổ chức. Dùng khi cần raw data: summary, compare, by_employee, by_region. '
        + 'Cơ sở created_at. Tham số giống format_org_overview_report_text.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string' },
          region_id: { type: 'string' },
          department_id: { type: 'string' },
          assigned_to: { type: 'string' },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer' },
          date_from: { type: 'string' },
          date_to: { type: 'string' },
          type: { type: 'string', enum: ['all', 'lead', 'deal'] },
          compare: { type: 'boolean' },
          deal_kh_split: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_employee_leads_drill',
      description:
        'Drill chi tiết: TỪNG NV của công ty có những LEAD/DEAL nào trong kỳ. '
        + 'Mặc định liệt kê lead MỚI tạo trong kỳ (code, title, value, stage, link). '
        + 'Bật include_open_holdings=true để liệt kê CẢ lead/deal đang giữ mở (không chỉ mới). '
        + 'Dùng khi sếp hỏi "NV nào có lead nào", "ai có lead gì hôm nay", "Quang đang giữ deal gì".',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string' },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer' },
          user_filter_ids: { type: 'array', items: { type: 'string' } },
          include_open_holdings: { type: 'boolean', description: 'true = thêm lead/deal đang giữ' },
          top_per_employee: { type: 'integer', description: 'Số lead/NV (mặc định 5, max 15)' },
          only_with_activity: { type: 'boolean', description: 'true (mặc định) = bỏ NV không có lead' },
        },
        required: ['company_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_employee_breakdown',
      description: 'Phân rã theo nhân viên: lead/deal mới, xử lý, trễ hẹn, quá hạn',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string' },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer' },
          schedule_id: { type: 'string' },
          user_filter_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['company_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overdue_breakdown',
      description: 'Chi tiết lead/task quá hạn của công ty',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string' },
          user_filter_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['company_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_time_range',
      description: 'Chuyển time_scope thành khoảng thời gian ISO',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer' },
        },
        required: ['scope'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_assignee_scope',
      description: 'Trả về danh sách user_id mà schedule giới hạn (từ department/user whitelist). null = không giới hạn.',
      parameters: {
        type: 'object',
        properties: {
          schedule_id: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_activity_history',
      description:
        'Đọc nhật ký hành vi UI của 1 user trong N ngày qua (page view, filter, search, click, CRUD). '
        + 'Dùng để hiểu user đang quan tâm gì, đã lọc gì, xem trang nào. '
        + 'Nếu user_id không truyền sẽ dùng người đang chat với bot.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'UUID user. Bỏ trống = người đang chat với bot.' },
          days: { type: 'integer', description: 'Số ngày lùi (mặc định 7, max 30).' },
          actions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lọc loại hành vi (filter, search, view, navigate, click, create, update, delete, export). Bỏ trống = tất cả importance>=1.',
          },
          modules: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lọc theo module (crm, tasks, projects, kpi, reports, messenger, admin).',
          },
          limit: { type: 'integer', description: 'Số entry trả về (mặc định 50, max 200).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_user_activity',
      description:
        'Rút trích insight ngắn gọn từ activity log: module hay dùng nhất, filter phổ biến (vd hay lọc Cty X, NV Y), '
        + 'thời điểm hoạt động nhiều, action gần nhất. Phù hợp khi sếp hỏi "X dạo này làm gì" hoặc khi cần personalize trả lời.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          days: { type: 'integer', description: 'Mặc định 7, max 30.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_auth_events_history',
      description:
        'Đọc nhật ký đăng nhập/đăng xuất chi tiết đến giây (IP, thiết bị, lý do). '
        + 'Dùng khi hỏi "hôm nay đăng nhập lúc mấy giờ", "ai đăng nhập từ máy nào", "có bao nhiêu lần đăng nhập sai". '
        + 'Nếu user_id không truyền sẽ dùng người đang chat với bot.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'UUID user. Bỏ trống = người đang chat.' },
          days: { type: 'integer', description: 'Số ngày lùi (mặc định 7, max 30).' },
          events: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Lọc loại event: login_success, login_failed, logout, auto_logout_midnight, session_expired, token_invalid, password_changed.',
          },
          limit: { type: 'integer', description: 'Số entry (mặc định 50, max 200).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_auth_sessions',
      description:
        'Tóm tắt phiên đăng nhập: lần login/logout gần nhất (giờ:phút:giây), thời lượng phiên, thiết bị, '
        + 'số lần đăng nhập sai, phiên còn mở. Dùng khi hỏi "hôm nay làm việc bao lâu", "đăng xuất lúc mấy giờ".',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          days: { type: 'integer', description: 'Mặc định 7, max 30.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pipelines_for_company',
      description:
        'Liệt kê các pipeline (ống bán hàng) đang active của 1 công ty. Mỗi công ty thường có 1-2 pipeline (Lead/Deal). '
        + 'Bỏ trống company_id để liệt kê toàn bộ.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string', description: 'UUID công ty (optional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pipeline_breakdown',
      description:
        'Chi tiết 1 PIPELINE của công ty: từng giai đoạn (stages) — số lead còn mở, tổng giá trị, top 3 lead có giá trị cao nhất mỗi giai đoạn, '
        + 'tỉ lệ chốt (win_rate_pct). Có thể truyền pipeline_id trực tiếp HOẶC truyền company_id (lấy pipeline mặc định). '
        + 'Hỗ trợ filter pipeline_type="lead"|"deal", lọc theo NV qua user_filter_ids, lọc khoảng thời gian created_at qua time_scope. '
        + 'Dùng khi sếp hỏi "pipeline Cty X đang ra sao", "stage nào đang đọng nhiều lead", "tỉ lệ chốt cty Y".',
      parameters: {
        type: 'object',
        properties: {
          pipeline_id: { type: 'string' },
          company_id: { type: 'string' },
          pipeline_type: { type: 'string', enum: ['lead', 'deal'] },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer' },
          user_filter_ids: { type: 'array', items: { type: 'string' } },
          sample_per_stage: { type: 'integer', description: 'Số lead mẫu mỗi stage (mặc định 3, max 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_profile_card',
      description:
        'Profile chi tiết 1 NV: thuộc công ty/phòng ban/khu vực nào, role, position, '
        + 'số lead/deal đang giữ + tổng giá trị, task quá hạn, KPI tháng (net_points), online/last_ping. '
        + 'Dùng khi sếp hỏi "ai là [tên]", "[tên] thuộc phòng nào", "[tên] đang giữ bao nhiêu lead", "tình hình NV X".',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'UUID NV (ưu tiên).' },
          name: { type: 'string', description: 'Hoặc gõ tên — sẽ tự findUsers; nếu match nhiều sẽ trả matches[].' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_employee_activity_report',
      description:
        'Báo cáo CHI TIẾT 1 nhân viên ĐÃ LÀM GÌ trong kỳ — ĐA CÔNG TY (không bó vào 1 cty). '
        + 'Trả: thông tin tổ chức (phòng ban, công ty, khu vực, role/position), tổng kết hoạt động '
        + '(lead/deal mới, stage chuyển, won/lost, task xong/quá hạn), danh sách công ty đã chạm, '
        + 'top item mới, top deal đã thắng, top stage transitions. '
        + 'Dùng khi sếp hỏi: "Quang làm gì hôm nay", "Bình tuần này có gì", "[tên] tháng này làm những gì", '
        + '"NV X đã chốt deal nào tuần qua", "báo cáo cá nhân của [tên]".',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'UUID NV (ưu tiên).' },
          name: { type: 'string', description: 'Hoặc tên — match nhiều sẽ trả matches[].' },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer' },
          date_from: { type: 'string', description: 'YYYY-MM-DD — override time_scope (vd tháng 6 → 2026-06-01)' },
          date_to: { type: 'string', description: 'YYYY-MM-DD — override time_scope (vd tháng 6 → 2026-06-30)' },
          deal_kh_split: { type: 'boolean', description: 'Tách Deal pipeline / Đơn hàng (mặc định true — khớp BC tổ chức)' },
          top_per_list: { type: 'integer', description: 'Top item mỗi list (mặc định 5, max 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'format_employee_activity_report_text',
      description:
        'TRẢ VỀ TEXT báo cáo 1 NV — tách Deal / Đơn hàng giống trang BC tổ chức. '
        + 'Hiển thị: Deal tổng · Pipeline (trước cột Thắng) · ĐH (từ cột Thắng) · Chốt · đang giữ. '
        + 'DÙNG KHI hỏi báo cáo cá nhân / NV X tháng N. AI CHỈ in nguyên result.text.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          name: { type: 'string' },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          days_offset: { type: 'integer' },
          date_from: { type: 'string' },
          date_to: { type: 'string' },
          deal_kh_split: { type: 'boolean' },
          top_per_list: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'format_all_employees_report_text',
      description:
        'TRẢ VỀ TEXT danh sách TẤT CẢ nhân viên trong công ty/phòng — đánh số, tách Deal/PL/ĐH, KPI. '
        + 'DÙNG KHI: "báo cáo tất cả NV", "danh sách nhân viên tháng N", "xếp hạng NV", "ai làm tốt". '
        + 'AI CHỈ in nguyên result.text — KHÔNG tự liệt kê từ get_employee_breakdown.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string' },
          department_id: { type: 'string' },
          region_id: { type: 'string' },
          time_scope: { type: 'string', enum: TIME_SCOPE_ENUM },
          date_from: { type: 'string' },
          date_to: { type: 'string' },
          deal_kh_split: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_employees_in_scope',
      description:
        'Liệt kê NV theo công ty / phòng ban / khu vực. Có thể truyền 1 hoặc nhiều scope. '
        + 'Mỗi NV kèm department, company, regions[]. '
        + 'Dùng khi sếp hỏi "phòng X có những ai", "Cty Y có bao nhiêu NV", "khu vực Hà Nội ai phụ trách".',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string' },
          department_id: { type: 'string' },
          region_id: { type: 'string', description: 'UUID company_regions' },
          search: { type: 'string', description: 'Lọc theo tên/email (ilike)' },
          limit: { type: 'integer', description: 'Mặc định 50, max 200' },
          active_only: { type: 'boolean', description: 'Mặc định true' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'format_lead_deal_risk_text',
      description:
        'TRẢ VỀ TEXT đã format sẵn cho báo cáo RỦI RO Lead/Deal (chat-bubble friendly): '
        + 'tổng quan (đang mở, quá SLA, sắp SLA, đứng yên, task quá hạn) + Top 5 mỗi nhóm + Top NV gánh rủi ro. '
        + 'DÙNG TOOL NÀY khi sếp xin: "báo cáo lead/deal quá hạn SLA", "rủi ro pipeline cty X", '
        + '"lead nào sắp quá hạn", "deal đứng yên lâu nhất", "NV nào ôm nhiều lead trễ". '
        + 'Tool đã chốt format đúng + đầy đủ số liệu. AI CHỈ in nguyên text trả về, KHÔNG tự viết lại.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string' },
          pipeline_type: { type: 'string', enum: ['all', 'lead', 'deal'], description: 'Mặc định all' },
          user_filter_ids: { type: 'array', items: { type: 'string' } },
          due_soon_days: { type: 'integer', description: 'Ngưỡng "sắp quá SLA" (mặc định 3, tối đa 14)' },
          stagnation_days: { type: 'integer', description: 'Ngưỡng "đứng yên" (mặc định 14, tối đa 90)' },
          top_per_section: { type: 'integer', description: 'Số dòng/section (mặc định 5, max 15)' },
          today_only: { type: 'boolean', description: 'true = CHỈ lấy lead/deal SLA RƠI VÀO HÔM NAY (vừa quá SLA hôm nay + sắp quá SLA trong ngày), bỏ section stagnant/task. Dùng khi sếp hỏi "SLA hôm nay", "deal nào hôm nay phải xử lý SLA".' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lead_deal_risk_report',
      description:
        'Báo cáo RỦI RO Lead/Deal: (1) sla_breached — vượt SLA cột pipeline; (2) sla_due_soon — sắp vượt trong N ngày; '
        + '(3) stagnant_in_stage — đứng yên trong cột quá lâu không chuyển stage; (4) overdue_tasks — task gắn vào lead có deadline quá hạn. '
        + 'Dùng khi sếp hỏi "deal nào quá SLA", "lead nào đứng yên lâu", "task quá hạn của deal X", "deal nào sắp hết hạn cột".',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string', description: 'Lọc theo công ty (optional).' },
          pipeline_type: { type: 'string', enum: ['lead', 'deal'], description: 'Chỉ "lead" hoặc "deal". Bỏ trống = cả 2.' },
          user_filter_ids: { type: 'array', items: { type: 'string' } },
          due_soon_days: { type: 'integer', description: 'Cửa sổ "sắp hết SLA" — mặc định 3, max 14.' },
          stagnation_days: { type: 'integer', description: 'Ngưỡng "đứng yên trong cột" — mặc định 14, max 90.' },
          limit_per_section: { type: 'integer', description: 'Số item / nhánh trả về (mặc định 15, max 50).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_channel_work_context',
      description:
        'Lấy dữ liệu công việc của THÀNH VIÊN KÊNH HIỆN TẠI (giống các playbook daily_brief/overdue/vip_lead/end_of_day/tasks_due_week/month): '
        + 'task quá hạn, sắp hạn, lead đang mở, lead VIP, lead hết hạn, lead sắp hết hạn ngày mai, CSKH cần chăm, task đã hoàn thành hôm nay. '
        + 'Dùng cho mọi câu hỏi loại "hôm nay phải làm gì", "ai quá hạn", "VIP còn treo", "lead sắp hết hạn ngày mai", "tuần này có gì", "khoá sổ cuối ngày".',
      parameters: {
        type: 'object',
        properties: {
          focus: {
            type: 'string',
            enum: ['all', 'overdue', 'due_soon', 'tasks_week', 'tasks_month',
              'leads_open', 'leads_expired', 'leads_expiring_tomorrow', 'vip_leads', 'done_today', 'cskh_needed'],
            description: 'Lọc loại dữ liệu (mặc định all). Chọn đúng focus để response gọn nhẹ.',
          },
          member_user_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Chỉ lấy theo các user_id này (override member kênh). Optional.',
          },
          limit: { type: 'integer', description: 'Số entry mỗi nhánh (mặc định 20, max 60).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_channel_kpi_summary',
      description:
        'KPI tháng (tổng net_points từ crm_kpi_ledger) cho thành viên kênh: top_performer, at_risk (âm điểm), avg_points. '
        + 'Dùng cho câu hỏi về KPI / xếp hạng tháng / ai đang âm điểm / lời chào sáng (pep talk).',
      parameters: {
        type: 'object',
        properties: {
          member_user_ids: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_channel_members',
      description: 'Liệt kê các thành viên của kênh đang chat (id, full_name). Dùng khi cần xác định "ai trong nhóm".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_online_users',
      description:
        'Liệt kê nhân viên đang ONLINE (ping HTTP/socket trong 2 phút gần nhất). '
        + 'Có thể lọc theo company_id hoặc department_id. Trả về tổng số online/tổng số NV.',
      parameters: {
        type: 'object',
        properties: {
          company_id: { type: 'string', description: 'UUID công ty (optional)' },
          department_id: { type: 'string', description: 'UUID phòng ban (optional)' },
          limit: { type: 'integer', description: 'Số NV trả về, mặc định 50, max 200.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_learned_facts',
      description:
        'Đọc trí nhớ dài hạn đã học về user (thói quen, filter hay dùng, ngữ cảnh). '
        + 'Ưu tiên dùng block SỞ THÍCH trong system prompt; tool này khi cần làm mới hoặc user hỏi "bạn nhớ gì về tôi".',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'Bỏ trống = người đang chat.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_ai_bot_schedule',
      description:
        'CRUD lịch gửi tin AI tự động (ai_chat_bot_schedules). '
        + 'action: list|get|preview|create|update|delete|toggle|run_now|runs|send_report. '
        + 'Resolve lịch theo schedule_id, mã 8 ký tự, hoặc giờ (16:01) trong kênh hiện tại. '
        + 'Dùng khi user: "tạo/sửa/xóa/bật/tắt lịch bot", "gửi thử", "xem lịch sử chạy", "danh sách lịch". '
        + 'BÁO CÁO: action=send_report — gửi qua lịch bot + playbook ĐÃ CẤU HÌNH trong kênh (KHÔNG format ad-hoc). '
        + 'TẠO LỊCH: ưu tiên preview_skill/apply_skill (bot JSON đã có) hoặc preview — hệ thống khớp playbook/skill/lịch mẫu; KHÔNG tạo pipeline ad-hoc. '
        + 'LUÔN action=preview trước — KHÔNG action=create trực tiếp (create chỉ sau user OK). '
        + 'Nhắc việc/thông báo: report_type=reminder + reminder_text — KHÔNG dùng org_overview. '
        + 'Preview hiển thị đúng tin nhắn sẽ gửi — user OK mới tạo. Trả lời in nguyên result.text.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'get', 'preview', 'create', 'update', 'delete', 'toggle', 'run_now', 'runs', 'apply_skill', 'preview_skill', 'send_report'],
            description: 'get=chi tiết; run_now=gửi thử lịch chỉ định; send_report=gửi BC qua bot đã setup trong kênh; runs=lịch sử.',
          },
          skill_code: { type: 'string', description: 'Mã skill trong backend/data/ai-bot-skills/*.json' },
          schedule_id: { type: 'string', description: 'UUID lịch (update/delete/toggle/get/run_now).' },
          schedule_id_prefix: { type: 'string', description: '8+ ký tự đầu UUID — thay schedule_id khi user gõ mã ngắn.' },
          title: { type: 'string' },
          report_type: {
            type: 'string',
            enum: ['org_overview', 'company_daily', 'company_report', 'reminder', 'daily_brief', 'overdue', 'kpi', 'lead_deadline', 'vip_leads', 'end_of_day', 'tasks_week', 'tasks_month'],
            description: 'org_overview=BC tổ chức; company_daily=báo cáo nhanh; reminder=nhắc việc/thông báo.',
          },
          reminder_text: { type: 'string', description: 'Nội dung nhắc — vd "mua đồ abc"' },
          message: { type: 'string', description: 'Alias reminder_text' },
          run_date: { type: 'string', description: 'Ngày một lần YYYY-MM-DD hoặc 10/6/2026' },
          recurrence: {
            type: 'string',
            enum: ['once', 'daily', 'monthly', 'yearly'],
            description: 'once=một lần; daily=mỗi ngày; monthly=mỗi tháng (recurrence_day); yearly=hàng năm (day+month)',
          },
          recurrence_day: { type: 'integer', description: 'Ngày trong tháng 1-31 (monthly/yearly)' },
          recurrence_month: { type: 'integer', description: 'Tháng 1-12 (yearly)' },
          company_id: { type: 'string' },
          company_name: { type: 'string', description: 'Tên cty (ABC, Phúc Đạt…) — resolve từ list_companies_in_scope.' },
          department_id: { type: 'string' },
          department_name: { type: 'string', description: 'vd "kinh doanh", "KD".' },
          notify_system_admins: { type: 'boolean', description: 'Gửi thêm bản copy qua DM bot tới admin hệ thống.' },
          notify_team: { type: 'string', description: 'Gửi thêm DM cho team, vd "khoa it".' },
          broadcast_user_ids: { type: 'array', items: { type: 'string' }, description: 'UUID user nhận thêm bản copy (tuỳ chọn).' },
          recipient_user_ids: { type: 'array', items: { type: 'string' }, description: 'Alias broadcast_user_ids khi personal_scope_only=false.' },
          run_times: {
            type: 'array',
            items: { type: 'string' },
            description: 'Giờ VN: ["08:00","12:00","18:00"] hoặc ["8h","12h trưa","6h chiều"].',
          },
          time_scope: {
            type: 'string',
            enum: ['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'last_month', 'custom', 'day_cycle'],
            description: 'day_cycle = 8h sáng hôm qua · 20h tối hôm nay (tab NV / BC ngày).',
          },
          channel_type: { type: 'string', enum: ['department', 'group'] },
          channel_id: { type: 'string', description: 'Mặc định = kênh chat hiện tại.' },
          weekdays: { type: 'array', items: { type: 'integer' }, description: '1=T2…7=CN. Bỏ trống = mọi ngày.' },
          enabled: { type: 'boolean' },
          note: { type: 'string' },
          instruction: { type: 'string', description: 'Câu user dạy — lưu vào bộ nhớ.' },
          mine_only: { type: 'boolean', description: 'list/get/...: chỉ lịch do user tạo (mặc định true).' },
          limit: { type: 'integer', description: 'runs: số dòng lịch sử (mặc định 8).' },
          dry_run: { type: 'boolean', description: 'create: true = preview (action preview cũng được).' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_bot_skills',
      description:
        'Quản lý kỹ năng DB (ai_bot_user_skills) + thư viện JSON (backend/data/ai-bot-skills/). '
        + 'list_library/reload_library cho file JSON; save/delete cho DB.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'list_library', 'reload_library', 'save', 'delete'] },
          enabled_only: { type: 'boolean', description: 'list_library: chỉ skill enabled' },
          skill_id: { type: 'string' },
          title: { type: 'string' },
          instruction: { type: 'string' },
          summary: { type: 'string' },
          report_type: { type: 'string' },
          company_name: { type: 'string' },
          department_name: { type: 'string' },
          run_times: { type: 'array', items: { type: 'string' } },
          schedule_id: { type: 'string' },
          skill_type: { type: 'string', enum: ['scheduled_report', 'preference', 'instruction'] },
          limit: { type: 'integer' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_skill_proposals',
      description:
        'Skill Workshop — đề xuất/duyệt/từ chối kỹ năng & lịch bot. '
        + 'User thường: action=propose. Admin: approve/reject/list.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'propose', 'approve', 'reject'],
          },
          proposal_id: { type: 'string', description: 'UUID đề xuất (approve/reject).' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          mine_only: { type: 'boolean' },
          note: { type: 'string', description: 'Ghi chú khi duyệt/từ chối.' },
          report_type: { type: 'string' },
          company_name: { type: 'string' },
          department_name: { type: 'string' },
          run_times: { type: 'array', items: { type: 'string' } },
          time_scope: { type: 'string' },
          title: { type: 'string' },
          instruction: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['action'],
      },
    },
  },
];

async function executeTool(name, args, ctx = {}) {
  const { applySessionToToolArgs } = require('./aiChatSessionContext');
  const sessionArgs = applySessionToToolArgs(args, ctx.session_context);
  const merged = {
    ...sessionArgs,
    schedule_id: sessionArgs.schedule_id || ctx.schedule_id,
    personal_recipient_user_id: sessionArgs.personal_recipient_user_id || ctx.personal_recipient_user_id || null,
  };
  if (ctx.session_context?.last_request && !merged.request_label) {
    merged.request_label = ctx.session_context.last_request;
  }
  switch (name) {
    case 'list_companies_in_scope':
      return listCompaniesInScope(merged);
    case 'find_users_by_name':
      return findUsersByName(merged);
    case 'resolve_assignee_scope':
      return resolveAssigneeIds(merged).then((ids) => ({
        assignee_ids: ids,
        is_limited: !!ids,
        total: ids?.length || 0,
      }));
    case 'get_company_lead_summary':
      return getCompanyLeadSummary(merged);
    case 'get_employee_breakdown':
      return getEmployeeBreakdown(merged);
    case 'get_employee_leads_drill':
      return getEmployeeLeadsDrill(merged);
    case 'format_company_report_text': {
      const text = await formatCompanyReportText(merged);
      return { text, company_id: merged.company_id };
    }
    case 'format_org_overview_report_text': {
      const { formatOrgOverviewReportText } = require('./orgOverviewReportAi');
      return formatOrgOverviewReportText({
        ...merged,
        company_id: merged.company_id || ctx.last_company_id || undefined,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    }
    case 'format_org_employee_tab_report_text': {
      const { formatOrgEmployeeTabReportText } = require('./orgOverviewReportAi');
      return formatOrgEmployeeTabReportText({
        ...merged,
        company_id: merged.company_id || ctx.last_company_id || undefined,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    }
    case 'get_org_overview_report': {
      const { getOrgOverviewReport } = require('./orgOverviewReportAi');
      return getOrgOverviewReport({
        ...merged,
        company_id: merged.company_id || ctx.last_company_id || undefined,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    }
    case 'list_departments_in_company':
      return listDepartmentsInCompany(args);
    case 'get_overdue_breakdown':
      return getOverdueBreakdown(merged);
    case 'resolve_time_range':
      return resolveTimeRange(args.scope || 'today', args.days_offset ?? ctx.days_offset ?? 0);
    case 'get_user_activity_history':
      return getUserActivityHistory({
        ...args,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    case 'summarize_user_activity':
      return summarizeUserActivity({
        ...args,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    case 'get_auth_events_history':
      return getAuthEventsHistory({
        ...args,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    case 'summarize_auth_sessions':
      return summarizeAuthSessions({
        ...args,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    case 'get_user_learned_facts': {
      const { getUserLearnedFacts } = require('./aiUserMemory');
      return getUserLearnedFacts(args.user_id || ctx.sender_user_id || ctx.personal_recipient_user_id);
    }
    case 'get_online_users':
      return getOnlineUsers(args);
    case 'get_channel_work_context':
      return getChannelWorkContext({
        ...args,
        ctx_channel_type: ctx.channel_kind,
        ctx_channel_id: ctx.channel_id,
      });
    case 'get_channel_kpi_summary':
      return getChannelKpiSummary({
        ...args,
        ctx_channel_type: ctx.channel_kind,
        ctx_channel_id: ctx.channel_id,
      });
    case 'get_channel_members':
      return getChannelMembers({
        ...args,
        ctx_channel_type: ctx.channel_kind,
        ctx_channel_id: ctx.channel_id,
      });
    case 'list_pipelines_for_company':
      return listPipelinesForCompany(merged);
    case 'get_pipeline_breakdown':
      return getPipelineBreakdown(merged);
    case 'get_lead_deal_risk_report':
      return getLeadDealRiskReport(merged);
    case 'format_lead_deal_risk_text': {
      const text = await formatLeadDealRiskText(merged);
      return { text, company_id: merged.company_id || null };
    }
    case 'get_user_profile_card':
      return getUserProfileCard({
        ...args,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    case 'get_employee_activity_report':
      return getEmployeeActivityReport({
        ...merged,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    case 'format_employee_activity_report_text':
      return formatEmployeeActivityReportText({
        ...merged,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    case 'format_all_employees_report_text': {
      const { formatAllEmployeesReportText } = require('./orgOverviewReportAi');
      return formatAllEmployeesReportText({
        ...merged,
        company_id: merged.company_id || ctx.last_company_id || undefined,
        ctx_user_id: ctx.sender_user_id || ctx.personal_recipient_user_id || null,
      });
    }
    case 'list_employees_in_scope':
      return listEmployeesInScope(args);
    case 'manage_ai_bot_schedule': {
      const { manageAiBotSchedule } = require('./aiBotSkills');
      return manageAiBotSchedule({ ...args, channel_id: args.channel_id || ctx.channel_id }, { ...ctx, io: ctx.io });
    }
    case 'manage_bot_skills': {
      const { manageBotSkills } = require('./aiBotSkills');
      return manageBotSkills(args, ctx);
    }
    case 'manage_skill_proposals': {
      const { manageSkillProposals } = require('./aiBotSkillWorkshop');
      return manageSkillProposals(args, ctx);
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function isDirectWithBot(groupId) {
  const { data: group } = await supabase
    .from('messenger_groups')
    .select('id, is_direct')
    .eq('id', groupId)
    .maybeSingle();
  if (!group?.is_direct) return false;

  const { data: members } = await supabase
    .from('messenger_group_members')
    .select('user_id')
    .eq('group_id', groupId);
  const ids = (members || []).map((m) => String(m.user_id));
  return ids.includes(AI_BOT_USER_ID);
}

module.exports = {
  VN_TZ,
  AI_BOT_USER_ID,
  vnDateYmd,
  fmtInt,
  fmtMoneyShort,
  shortName,
  resolveTimeRange,
  resolveAssigneeIds,
  getDmRecipientUserId,
  findUsersByName,
  listCompaniesInScope,
  getCompanyLeadSummary,
  listDepartmentsInCompany,
  getEmployeeBreakdown,
  getEmployeeLeadsDrill,
  getOverdueBreakdown,
  getOnlineUsers,
  listPipelinesForCompany,
  getPipelineBreakdown,
  getLeadDealRiskReport,
  formatLeadDealRiskText,
  getUserProfileCard,
  getEmployeeActivityReport,
  formatEmployeeActivityReportText,
  listEmployeesInScope,
  loadUserOrgContext,
  getChannelWorkContext,
  getChannelKpiSummary,
  getChannelMembers,
  getUserActivityHistory,
  summarizeUserActivity,
  formatCompanyReportText,
  OPENAI_TOOL_DEFINITIONS,
  executeTool,
  leadDetailUrl,
  isDirectWithBot,
};
