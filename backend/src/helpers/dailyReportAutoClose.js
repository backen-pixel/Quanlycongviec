/**
 * Tự động tính kết quả báo cáo ngày từ dữ liệu CRM (chốt buổi chiều).
 * Sale Admin: 6 mục Lead | Sale-Deal (sale_deal): luồng Deal
 */
const { supabase } = require('../config/supabase');
const {
  crmReportCreatedAtFromIso,
  crmReportCreatedAtToIso,
} = require('./crmReportDateBounds');

const LEAD_FUNNEL_SLUGS = [
  'lead_new', 'not_contacted', 'cold', 'warm', 'hot', 'survey_scheduled', 'survey_done',
];

const DEAL_FUNNEL_SLUGS = [
  'survey_done', 'designing', 'quoted', 'negotiating', 'waiting_deposit',
  'contract_signed', 'producing', 'installing', 'completed',
];

function emptyFunnel(slugs) {
  return Object.fromEntries(slugs.map((s) => [s, 0]));
}

/** Map tên cột VN → slug khi stage chưa gán canonical_slug. */
function slugFromStageName(name) {
  const s = String(name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!s) return null;
  if (/tiep\s*nhan|lead\s*moi|moi\s*tiep/.test(s)) return 'lead_new';
  if (/khong\s*(tra\s*loi|phan\s*hoi)|not\s*contact/.test(s)) return 'not_contacted';
  if (/\bcold\b|lanh/.test(s)) return 'cold';
  if (/\bwarm\b|am/.test(s) && !/hot/.test(s)) return 'warm';
  if (/\bhot\b|nong/.test(s)) return 'hot';
  if (/hen\s*khao|cho\s*khao|dang\s*hen.*khao|survey_scheduled/.test(s)) return 'survey_scheduled';
  if (/da\s*khao|survey_done/.test(s)) return 'survey_done';
  if (/bao\s*gia|quoted|thiet\s*ke/.test(s)) return /thiet\s*ke|design/.test(s) ? 'designing' : 'quoted';
  if (/hop\s*dong|coc|contract/.test(s)) return 'contract_signed';
  if (/san\s*xuat|produc/.test(s)) return 'producing';
  if (/lap\s*dat|van\s*chuyen|install/.test(s)) return 'installing';
  if (/hoan\s*thanh|completed|won/.test(s)) return 'completed';
  return null;
}

async function ownedLeadIds(userId, type = null) {
  let q = supabase
    .from('crm_leads')
    .select('id')
    .or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`);
  if (type) q = q.eq('type', type);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((l) => l.id);
}

/** Lead/deal tạo mới trong ngày (owner/assignee). */
async function listLeadsCreatedToday(userId, reportDate, type = 'lead') {
  const startISO = crmReportCreatedAtFromIso(reportDate);
  const endISO = crmReportCreatedAtToIso(reportDate);
  let q = supabase
    .from('crm_leads')
    .select('id')
    .or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`)
    .gte('created_at', startISO)
    .lte('created_at', endISO);
  if (type) q = q.eq('type', type);
  const { data, error } = await q;
  if (error) throw error;
  const ids = (data || []).map((l) => String(l.id));
  return { count: ids.length, ids };
}

/**
 * Đếm chuyển cột trong ngày:
 * - Lead bạn phụ trách (owner/assigned) HOẶC bạn là người chuyển (changed_by)
 * - Ưu tiên to_canonical_slug; fallback slug stage / tên cột
 */
async function countStageFunnelBySlugs(userId, reportDate, slugs, type = null) {
  const startISO = crmReportCreatedAtFromIso(reportDate);
  const endISO = crmReportCreatedAtToIso(reportDate);
  const funnel = emptyFunnel(slugs);
  const distinct = Object.fromEntries(slugs.map((s) => [s, new Set()]));
  const slugSet = new Set(slugs);
  const uid = String(userId);

  const { data, error } = await supabase
    .from('crm_lead_stage_history')
    .select(`
      lead_id, to_canonical_slug, changed_by, to_stage_id,
      lead:crm_leads!lead_id(id, type, lead_owner_id, assigned_to),
      stage:crm_pipeline_stages!to_stage_id(id, name, canonical_slug)
    `)
    .gte('entered_at', startISO)
    .lte('entered_at', endISO)
    .limit(5000);
  if (error) throw error;

  for (const h of data || []) {
    const lead = h.lead;
    if (type && lead?.type && lead.type !== type) continue;
    const isActor = String(h.changed_by || '') === uid;
    const isOwner = lead
      && (String(lead.lead_owner_id || '') === uid || String(lead.assigned_to || '') === uid);
    if (!isActor && !isOwner) continue;

    const slug = h.to_canonical_slug
      || h.stage?.canonical_slug
      || slugFromStageName(h.stage?.name);
    if (!slug || !slugSet.has(slug)) continue;
    funnel[slug] += 1;
    if (h.lead_id) distinct[slug].add(String(h.lead_id));
  }

  const distinctCounts = Object.fromEntries(slugs.map((s) => [s, distinct[s].size]));
  const distinctIds = Object.fromEntries(slugs.map((s) => [s, [...distinct[s]]]));
  return { funnel, distinctCounts, distinctIds };
}

async function listCareActivities(userId, reportDate) {
  const startISO = crmReportCreatedAtFromIso(reportDate);
  const endISO = crmReportCreatedAtToIso(reportDate);
  const empty = {
    care_cold: 0, care_warm: 0, care_hot: 0,
    ids: { care_cold: [], care_warm: [], care_hot: [] },
  };

  const { data: acts, error } = await supabase
    .from('crm_activities')
    .select('id, lead_id, created_at, activity_date')
    .eq('created_by', userId)
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .limit(2000);
  if (error) throw error;
  if (!acts?.length) return empty;

  const leadIds = [...new Set(acts.map((a) => a.lead_id).filter(Boolean))];
  if (!leadIds.length) return empty;

  const leadSlug = new Map();
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200);
    const { data: leads, error: lErr } = await supabase
      .from('crm_leads')
      .select('id, stage:crm_pipeline_stages!stage_id(canonical_slug)')
      .in('id', chunk);
    if (lErr) throw lErr;
    for (const l of leads || []) {
      leadSlug.set(String(l.id), l.stage?.canonical_slug || null);
    }
  }

  const seen = { care_cold: new Set(), care_warm: new Set(), care_hot: new Set() };
  for (const a of acts) {
    const slug = leadSlug.get(String(a.lead_id));
    let key = null;
    if (slug === 'cold') key = 'care_cold';
    else if (slug === 'warm') key = 'care_warm';
    else if (slug === 'hot') key = 'care_hot';
    if (!key || !a.lead_id) continue;
    seen[key].add(String(a.lead_id));
  }
  return {
    care_cold: seen.care_cold.size,
    care_warm: seen.care_warm.size,
    care_hot: seen.care_hot.size,
    ids: {
      care_cold: [...seen.care_cold],
      care_warm: [...seen.care_warm],
      care_hot: [...seen.care_hot],
    },
  };
}

async function countSurveyEvents(userId, reportDate) {
  const startISO = crmReportCreatedAtFromIso(reportDate);
  const endISO = crmReportCreatedAtToIso(reportDate);
  const { data, error } = await supabase
    .from('crm_events')
    .select('id')
    .in('event_type', ['site_visit', 'measurement'])
    .or(`assignee_id.eq.${userId},created_by.eq.${userId}`)
    .gte('start_time', startISO)
    .lte('start_time', endISO)
    .limit(500);
  if (error) {
    const { data: d2, error: e2 } = await supabase
      .from('crm_events')
      .select('id')
      .in('event_type', ['site_visit', 'measurement'])
      .or(`assignee_id.eq.${userId},created_by.eq.${userId}`)
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .limit(500);
    if (e2) throw e2;
    return (d2 || []).length;
  }
  return (data || []).length;
}

/** Sự kiện KS có liên kết lead/deal (tạo trong ngày). */
async function listLinkedSurveyEvents(userId, reportDate) {
  const startISO = crmReportCreatedAtFromIso(reportDate);
  const endISO = crmReportCreatedAtToIso(reportDate);
  const uid = String(userId);
  const eventIds = new Set();
  const leadIds = new Set();

  const pick = (rows) => {
    for (const r of rows || []) {
      if (!r?.lead_id) continue;
      eventIds.add(String(r.id));
      leadIds.add(String(r.lead_id));
    }
  };

  const { data, error } = await supabase
    .from('crm_events')
    .select('id, lead_id, created_by, assignee_id, start_time, created_at')
    .in('event_type', ['site_visit', 'measurement'])
    .not('lead_id', 'is', null)
    .or(`created_by.eq.${uid},assignee_id.eq.${uid}`)
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .limit(1000);
  if (!error) pick(data);
  else {
    const { data: d2 } = await supabase
      .from('crm_events')
      .select('id, lead_id')
      .in('event_type', ['site_visit', 'measurement'])
      .not('lead_id', 'is', null)
      .or(`created_by.eq.${uid},assignee_id.eq.${uid}`)
      .gte('start_time', startISO)
      .lte('start_time', endISO)
      .limit(1000);
    pick(d2);
  }
  return { count: eventIds.size, ids: [...leadIds] };
}

/** Deal quá hạn trong ngày (kanban_deadline_at / expected_close_date rơi vào ngày báo cáo, chưa won/lost). */
async function listDealsOverdueOnDay(userId, reportDate) {
  const startISO = crmReportCreatedAtFromIso(reportDate);
  const endISO = crmReportCreatedAtToIso(reportDate);
  const uid = String(userId);
  const seen = new Set();

  const { data: byKanban } = await supabase
    .from('crm_leads')
    .select(`
      id, kanban_deadline_at, expected_close_date, deadline_disabled_at,
      stage:crm_pipeline_stages!stage_id(is_won, is_lost)
    `)
    .eq('type', 'deal')
    .or(`lead_owner_id.eq.${uid},assigned_to.eq.${uid}`)
    .is('deadline_disabled_at', null)
    .not('kanban_deadline_at', 'is', null)
    .gte('kanban_deadline_at', startISO)
    .lte('kanban_deadline_at', endISO)
    .limit(2000);

  for (const row of byKanban || []) {
    if (row.stage?.is_won || row.stage?.is_lost) continue;
    seen.add(String(row.id));
  }

  const { data: byClose } = await supabase
    .from('crm_leads')
    .select(`
      id, expected_close_date,
      stage:crm_pipeline_stages!stage_id(is_won, is_lost)
    `)
    .eq('type', 'deal')
    .or(`lead_owner_id.eq.${uid},assigned_to.eq.${uid}`)
    .eq('expected_close_date', reportDate)
    .limit(2000);

  for (const row of byClose || []) {
    if (row.stage?.is_won || row.stage?.is_lost) continue;
    seen.add(String(row.id));
  }

  const ids = [...seen];
  return { count: ids.length, ids };
}

async function countInstallFollow(userId, reportDate) {
  const startISO = crmReportCreatedAtFromIso(reportDate);
  const endISO = crmReportCreatedAtToIso(reportDate);
  const ids = await ownedLeadIds(userId);
  let n = 0;
  if (ids.length) {
    const seen = new Set();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data } = await supabase
        .from('crm_lead_stage_history')
        .select('lead_id, to_canonical_slug')
        .in('lead_id', chunk)
        .eq('to_canonical_slug', 'installing')
        .gte('entered_at', startISO)
        .lte('entered_at', endISO);
      for (const h of data || []) {
        if (h.lead_id) seen.add(String(h.lead_id));
      }
    }
    n = seen.size;
  }
  const { data: tasks } = await supabase
    .from('crm_tasks')
    .select('id, title, status, completed_at, updated_at')
    .eq('assignee_id', userId)
    .ilike('title', '%lắp đặt%')
    .gte('updated_at', startISO)
    .lte('updated_at', endISO)
    .limit(200);
  const taskDone = (tasks || []).filter((t) => {
    const st = String(t.status || '').toLowerCase();
    return st === 'done' || st === 'completed' || !!t.completed_at;
  }).length;
  return Math.max(n, taskDone);
}

/** Số lead chuyển sang Deal trong ngày (KPI lead_converted + vào pipeline deal). */
async function listLeadToDealConversions(userId, reportDate) {
  const startISO = crmReportCreatedAtFromIso(reportDate);
  const endISO = crmReportCreatedAtToIso(reportDate);
  const uid = String(userId);
  const seen = new Set();

  const { data: ledger, error: ledgerErr } = await supabase
    .from('crm_kpi_ledger')
    .select('lead_id, user_id, created_by, occurred_at, created_at')
    .eq('event_type', 'lead_converted')
    .or(`user_id.eq.${uid},created_by.eq.${uid}`)
    .gte('occurred_at', startISO)
    .lte('occurred_at', endISO)
    .limit(2000);
  if (!ledgerErr) {
    for (const row of ledger || []) {
      if (row.lead_id) seen.add(String(row.lead_id));
    }
  } else {
    const { data: ledger2 } = await supabase
      .from('crm_kpi_ledger')
      .select('lead_id, user_id, created_by, created_at')
      .eq('event_type', 'lead_converted')
      .or(`user_id.eq.${uid},created_by.eq.${uid}`)
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .limit(2000);
    for (const row of ledger2 || []) {
      if (row.lead_id) seen.add(String(row.lead_id));
    }
  }

  const { data: moves } = await supabase
    .from('crm_lead_stage_history')
    .select(`
      lead_id, pipeline_type, to_canonical_slug, changed_by,
      lead:crm_leads!lead_id(id, lead_owner_id, assigned_to)
    `)
    .gte('entered_at', startISO)
    .lte('entered_at', endISO)
    .limit(5000);
  for (const h of moves || []) {
    const lead = h.lead;
    const isActor = String(h.changed_by || '') === uid;
    const isOwner = lead
      && (String(lead.lead_owner_id || '') === uid || String(lead.assigned_to || '') === uid);
    if (!isActor && !isOwner) continue;
    const isConvert = h.pipeline_type === 'deal' || h.to_canonical_slug === 'survey_scheduled';
    if (!isConvert || !h.lead_id) continue;
    seen.add(String(h.lead_id));
  }

  const ids = [...seen];
  return { count: ids.length, ids };
}

function metricPayload(value, note, source, ids = []) {
  return {
    value,
    note,
    source,
    ids: [...new Set((ids || []).map(String).filter(Boolean))],
  };
}

function unionIds(...lists) {
  const s = new Set();
  for (const list of lists) {
    for (const id of list || []) s.add(String(id));
  }
  return [...s];
}

async function computeAutoDailyResults(userId, reportDate, roleKey = 'sale_admin') {
  const results = {};
  let funnel = {};
  let distinctCounts = {};
  let distinctIds = {};

  if (roleKey === 'sale_admin') {
    ({ funnel, distinctCounts, distinctIds } = await countStageFunnelBySlugs(
      userId, reportDate, LEAD_FUNNEL_SLUGS, null,
    ));
    const created = await listLeadsCreatedToday(userId, reportDate, 'lead');
    const leadNewIds = unionIds(distinctIds.lead_new, created.ids);
    const leadNew = Math.max(distinctCounts.lead_new || 0, created.count);
    results.lead_new = metricPayload(
      leadNew,
      `Tự động: ${distinctCounts.lead_new || 0} vào cột Tiếp nhận + ${created.count} lead tạo mới → lấy ${leadNew}`,
      'crm_lead_stage_history:lead_new|crm_leads.created_at',
      leadNewIds,
    );
    results.not_contacted = metricPayload(
      distinctCounts.not_contacted,
      `Tự động: ${distinctCounts.not_contacted} lead vào cột Không phản hồi`,
      'crm_lead_stage_history:not_contacted',
      distinctIds.not_contacted,
    );
    const leadToDeal = await listLeadToDealConversions(userId, reportDate);
    results.survey_scheduled = metricPayload(
      leadToDeal.count,
      `Tự động: ${leadToDeal.count} lead chuyển sang Deal trong ngày`,
      'crm_kpi_ledger:lead_converted|crm_lead_stage_history:deal',
      leadToDeal.ids,
    );

    const care = await listCareActivities(userId, reportDate);
    const careCold = care.care_cold > 0 ? care.care_cold : distinctCounts.cold;
    const careWarm = care.care_warm > 0 ? care.care_warm : distinctCounts.warm;
    const careHot = care.care_hot > 0 ? care.care_hot : distinctCounts.hot;
    results.care_cold = metricPayload(
      careCold,
      care.care_cold > 0
        ? `Tự động: chăm ${careCold} lead Cold (activity)`
        : `Tự động: ${careCold} lead vào cột Cold`,
      care.care_cold > 0 ? 'crm_activities+stage:cold' : 'crm_lead_stage_history:cold',
      care.care_cold > 0 ? care.ids.care_cold : distinctIds.cold,
    );
    results.care_warm = metricPayload(
      careWarm,
      care.care_warm > 0
        ? `Tự động: chăm ${careWarm} lead Warm (activity)`
        : `Tự động: ${careWarm} lead vào cột Warm`,
      care.care_warm > 0 ? 'crm_activities+stage:warm' : 'crm_lead_stage_history:warm',
      care.care_warm > 0 ? care.ids.care_warm : distinctIds.warm,
    );
    results.care_hot = metricPayload(
      careHot,
      care.care_hot > 0
        ? `Tự động: chăm ${careHot} lead Hot (activity)`
        : `Tự động: ${careHot} lead vào cột Hot`,
      care.care_hot > 0 ? 'crm_activities+stage:hot' : 'crm_lead_stage_history:hot',
      care.care_hot > 0 ? care.ids.care_hot : distinctIds.hot,
    );
  }

  if (roleKey === 'sale_deal' || roleKey === 'deal_admin') {
    const linkedSurvey = await listLinkedSurveyEvents(userId, reportDate);
    const dealCreated = await listLeadsCreatedToday(userId, reportDate, 'deal');
    const leadToDeal = await listLeadToDealConversions(userId, reportDate);
    const deal = await countStageFunnelBySlugs(userId, reportDate, DEAL_FUNNEL_SLUGS, 'deal');
    funnel = deal.funnel;
    distinctCounts = deal.distinctCounts;
    distinctIds = deal.distinctIds || {};
    const d = deal.distinctCounts;

    const dealNewIds = unionIds(dealCreated.ids, leadToDeal.ids);
    const dealNew = Math.max(dealCreated.count, leadToDeal.count);
    results.deal_new = metricPayload(
      dealNew,
      `Tự động: ${dealCreated.count} deal tạo mới + ${leadToDeal.count} lead→deal → lấy ${dealNew}`,
      'crm_leads.created_at|crm_kpi_ledger:lead_converted',
      dealNewIds,
    );
    results.deal_interact = metricPayload(
      linkedSurvey.count,
      `Tự động: ${linkedSurvey.count} sự kiện KS có liên kết deal/lead`,
      'crm_events:site_visit|measurement+lead_id',
      linkedSurvey.ids,
    );
    results.deal_survey = results.deal_interact;

    const toQuoteIds = unionIds(distinctIds.quoted, distinctIds.designing);
    const toQuote = (d.quoted || 0) + (d.designing || 0);
    results.deal_to_quote = metricPayload(
      toQuote,
      `Tự động: ${d.quoted || 0} báo giá + ${d.designing || 0} đang thiết kế/BG`,
      'crm_lead_stage_history:quoted|designing',
      toQuoteIds,
    );
    const toContractIds = unionIds(distinctIds.contract_signed, distinctIds.waiting_deposit);
    results.deal_to_contract = metricPayload(
      (d.contract_signed || 0) + (d.waiting_deposit || 0),
      `Tự động: ${(d.contract_signed || 0)} HĐ + ${(d.waiting_deposit || 0)} chờ cọc`,
      'crm_lead_stage_history:contract_signed|waiting_deposit',
      toContractIds,
    );
    results.deal_producing = metricPayload(
      d.producing || 0,
      `Tự động: ${d.producing || 0} deal vào sản xuất`,
      'crm_lead_stage_history:producing',
      distinctIds.producing,
    );
    results.deal_installing = metricPayload(
      d.installing || 0,
      `Tự động: ${d.installing || 0} deal VC / lắp đặt`,
      'crm_lead_stage_history:installing',
      distinctIds.installing,
    );
    results.deal_completed = metricPayload(
      d.completed || 0,
      `Tự động: ${d.completed || 0} deal hoàn thành`,
      'crm_lead_stage_history:completed',
      distinctIds.completed,
    );
    const overdue = await listDealsOverdueOnDay(userId, reportDate);
    results.deal_overdue = metricPayload(
      overdue.count,
      `Tự động: ${overdue.count} deal quá hạn trong ngày (deadline / ngày đóng kỳ vọng)`,
      'crm_leads.kanban_deadline_at|expected_close_date',
      overdue.ids,
    );
  }

  if (roleKey === 'design_survey') {
    const surveyN = await countSurveyEvents(userId, reportDate);
    results.survey_event = metricPayload(
      surveyN,
      `Tự động: ${surveyN} sự kiện khảo sát / đo đạc trong ngày`,
      'crm_events:site_visit|measurement',
      [],
    );
    const installN = await countInstallFollow(userId, reportDate);
    results.install_follow = metricPayload(
      installN,
      `Tự động: ${installN} theo dõi lắp đặt (stage/task)`,
      'crm_lead_stage_history:installing|crm_tasks',
      [],
    );
  }

  return {
    metrics: results,
    raw: { funnel, distinctCounts, distinctIds },
    computed_at: new Date().toISOString(),
  };
}

/** Resolve lead/deal cards for one metric (matrix drill-down). */
async function loadMetricEntityLinks(userId, reportDate, roleKey, metricKey) {
  const key = String(metricKey || '').trim();
  if (!key) return { metric_key: key, ids: [], items: [] };
  const computed = await computeAutoDailyResults(userId, reportDate, roleKey || 'sale_admin');
  const m = computed.metrics?.[key];
  const ids = m?.ids || [];
  if (!ids.length) {
    return {
      metric_key: key,
      value: m?.value ?? null,
      note: m?.note || null,
      source: m?.source || null,
      ids: [],
      items: [],
      computed_at: computed.computed_at,
    };
  }

  const items = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from('crm_leads')
      .select('id, code, name, type, phone, company_id, stage:crm_pipeline_stages!stage_id(id, name)')
      .in('id', chunk);
    if (error) throw error;
    for (const row of data || []) {
      items.push({
        id: row.id,
        code: row.code || null,
        name: row.name || null,
        type: row.type || 'lead',
        phone: row.phone || null,
        stage_name: row.stage?.name || null,
        path: `/crm/leads/${row.id}`,
      });
    }
  }

  const order = new Map(ids.map((id, idx) => [String(id), idx]));
  items.sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));

  return {
    metric_key: key,
    value: m?.value ?? items.length,
    note: m?.note || null,
    source: m?.source || null,
    ids,
    items,
    computed_at: computed.computed_at,
  };
}

function metricKeyFromLabel(label) {
  const s = String(label || '').toLowerCase().trim();
  if (/chốt.*khảo|hẹn.*khảo|survey_scheduled/.test(s)) return 'survey_scheduled';
  if (/lead mới|tiếp nhận/.test(s) && !/deal/.test(s)) return 'lead_new';
  if (/không trả lời|không phản hồi|not_contacted/.test(s)) return 'not_contacted';
  if (/cold/.test(s)) return 'care_cold';
  if (/warm/.test(s)) return 'care_warm';
  if (/hot/.test(s)) return 'care_hot';
  if (/deal mới|deal.*tiếp nhận|deal_new/.test(s)) return 'deal_new';
  if (/tương tác|deal_interact|sự kiện.*liên kết/.test(s)) return 'deal_interact';
  if (/khảo sát.*sự kiện|sự kiện.*khảo|deal_survey/.test(s)) return 'deal_interact';
  if (/khảo sát.*báo giá|→\s*báo giá|^báo giá$|deal_to_quote/.test(s)) return 'deal_to_quote';
  if (/báo giá.*hợp đồng|→\s*hợp đồng|^hợp đồng$|deal_to_contract/.test(s)) return 'deal_to_contract';
  if (/^sản xuất$|deal_producing/.test(s)) return 'deal_producing';
  if (/vc\s*\/|lắp đặt|deal_installing/.test(s)) return 'deal_installing';
  if (/^hoàn thành$|deal_completed/.test(s)) return 'deal_completed';
  if (/quá hạn|deal_overdue/.test(s)) return 'deal_overdue';
  if (s === 'khảo sát' || /^khảo sát$/.test(s)) return 'survey_event';
  if (/lắp đặt/.test(s)) return 'install_follow';
  return null;
}

module.exports = {
  computeAutoDailyResults,
  loadMetricEntityLinks,
  metricKeyFromLabel,
};
