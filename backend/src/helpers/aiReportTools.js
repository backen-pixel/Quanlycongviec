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

/** Tra cứu user theo tên gần đúng (full_name ILIKE). Trả mảng các ứng viên. */
async function findUsersByName({ name } = {}) {
  if (!name || !String(name).trim()) return { matches: [] };
  const term = String(name).trim().replace(/[,]/g, ' ');
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, department_id, company_id, is_active')
    .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
    .eq('is_active', true)
    .limit(20);
  if (error) return { matches: [], error: error.message };

  // Join department riêng (tránh ambiguous FK)
  const deptIds = [...new Set((data || []).map((u) => u.department_id).filter(Boolean))];
  const deptMap = new Map();
  if (deptIds.length) {
    const { data: depts } = await supabase
      .from('departments')
      .select('id, name, company_id')
      .in('id', deptIds);
    (depts || []).forEach((d) => deptMap.set(d.id, d));
  }

  return {
    matches: (data || []).map((u) => {
      const dept = u.department_id ? deptMap.get(u.department_id) : null;
      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        department_name: dept?.name || null,
        effective_company_id: u.company_id || dept?.company_id || null,
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

/** Lead CLOSE TRONG KỲ (cho won/lost). actual_close_date là DATE. */
async function fetchLeadsClosedInRange(companyId, fromIso, toIso, assigneeIds = null) {
  const fromYmd = fromIso.slice(0, 10);
  const toYmd = toIso.slice(0, 10);
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
    total_value_won_text: fmtMoney(totalValueWon),
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
        processed: 0,
        late_handled: 0,
        overdue_open: 0,
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
      ensure(l.assigned_to).overdue_open += 1;
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
      assignee: nameMap.get(l.assigned_to) || '—',
      days_overdue: Math.max(0, Math.round((now - expMs) / (24 * 3600 * 1000))),
      link: leadDetailUrl(l.id),
    });
  }

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

  return {
    company_id: companyId,
    company_name: company?.short_name || company?.name || '—',
    leads_expired: leadsExpired.slice(0, 20),
    tasks_overdue: tasksOverdue.slice(0, 20),
    total_leads_expired: leadsExpired.length,
    total_tasks_overdue: tasksOverdue.length,
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

/** Báo cáo tĩnh (fallback / menu direct) — thiết kế cho bong bóng chat hẹp:
 *  - Mỗi metric 1 dòng có emoji.
 *  - NV ngắn gọn: chỉ "L/D/xử lý" — không in metric 0.
 *  - Gom NV không hoạt động thành 1 dòng "+ N NV im ắng". */
async function formatCompanyReportText({ company_id: companyId, schedule_id: scheduleId, time_scope: timeScope, days_offset: daysOffset, include_employees: includeEmployees = true, personal_recipient_user_id: personalUid }) {
  const summary = await getCompanyLeadSummary({ company_id: companyId, time_scope: timeScope, schedule_id: scheduleId, days_offset: daysOffset, personal_recipient_user_id: personalUid });
  const assigneeIds = await resolveAssigneeIds({ schedule_id: scheduleId, personal_recipient_user_id: personalUid });

  const lines = [];

  // ── Header ──
  lines.push(`📊 *${summary.company_name}*`);
  lines.push(`🗓 ${summary.period}`);
  if (personalUid) {
    lines.push('👤 Báo cáo cá nhân');
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
  if (summary.total_value_won > 0) lines.push(`💰 Doanh thu: *${summary.total_value_won_text}đ*`);

  // ── Nhân viên ──
  if (includeEmployees) {
    const emp = await getEmployeeBreakdown({ company_id: companyId, time_scope: timeScope, schedule_id: scheduleId, days_offset: daysOffset, personal_recipient_user_id: personalUid });
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
          if (e.processed) parts.push(`xử lý ${e.processed}`);
          if (e.late_handled) parts.push(`⏰${e.late_handled}`);
          if (e.overdue_open) parts.push(`⚠️${e.overdue_open}`);
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

  // ── Quá hạn ──
  const overdue = await getOverdueBreakdown({ company_id: companyId, schedule_id: scheduleId, personal_recipient_user_id: personalUid });
  if (overdue.total_leads_expired + overdue.total_tasks_overdue > 0) {
    lines.push('━━━━━━━━━━━━━');
    lines.push('⚠️ *Quá hạn*');
    if (overdue.total_leads_expired) lines.push(`   📍 ${overdue.total_leads_expired} lead`);
    if (overdue.total_tasks_overdue) lines.push(`   📋 ${overdue.total_tasks_overdue} task`);
  }

  return lines.join('\n').slice(0, 1900);
}

const TIME_SCOPE_ENUM = ['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'last_month', 'custom'];

/* ─────────────────── CHANNEL CONTEXT (task/lead/CSKH/KPI) ─────────────────── */

function pickArr(payload, key, limit) {
  const arr = Array.isArray(payload?.[key]) ? payload[key] : [];
  return limit ? arr.slice(0, limit) : arr;
}

/**
 * Trả "payload kênh" giống các playbook daily_brief / overdue / vip / tasks_due_week / tasks_due_month / end_of_day.
 * Hỗ trợ filter scope qua focus = 'overdue' | 'due_soon' | 'tasks_week' | 'tasks_month'
 *   | 'leads_open' | 'leads_expired' | 'vip_leads' | 'done_today' | 'cskh_needed' | 'all'.
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
      ? ['overdue', 'due_soon', 'tasks_week', 'tasks_month', 'leads_open', 'leads_expired', 'vip_leads', 'done_today', 'cskh_needed']
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
  if (wants.has('leads_expired')) result.leads_expired = lim('leads_expired');
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
      name: 'get_channel_work_context',
      description:
        'Lấy dữ liệu công việc của THÀNH VIÊN KÊNH HIỆN TẠI (giống các playbook daily_brief/overdue/vip_lead/end_of_day/tasks_due_week/month): '
        + 'task quá hạn, sắp hạn, lead đang mở, lead VIP, lead hết hạn, CSKH cần chăm, task đã hoàn thành hôm nay. '
        + 'Dùng cho mọi câu hỏi loại "hôm nay phải làm gì", "ai quá hạn", "VIP còn treo", "tuần này có gì", "khoá sổ cuối ngày".',
      parameters: {
        type: 'object',
        properties: {
          focus: {
            type: 'string',
            enum: ['all', 'overdue', 'due_soon', 'tasks_week', 'tasks_month',
              'leads_open', 'leads_expired', 'vip_leads', 'done_today', 'cskh_needed'],
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
];

async function executeTool(name, args, ctx = {}) {
  const merged = {
    ...args,
    schedule_id: args.schedule_id || ctx.schedule_id,
    personal_recipient_user_id: args.personal_recipient_user_id || ctx.personal_recipient_user_id || null,
  };
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
  resolveTimeRange,
  resolveAssigneeIds,
  getDmRecipientUserId,
  findUsersByName,
  listCompaniesInScope,
  getCompanyLeadSummary,
  getEmployeeBreakdown,
  getOverdueBreakdown,
  getOnlineUsers,
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
