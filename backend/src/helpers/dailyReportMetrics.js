/**
 * Catalog metric báo cáo ngày — mỗi hạng mục một payload { value, ids, note, source }.
 * Kết quả (Phần II) nhận untilIso để cắt mốc 16:45.
 */
const { supabase } = require('../config/supabase');
const {
  crmReportCreatedAtFromIso,
  crmReportCreatedAtToIso,
  endOfCalendarDayAfterEntered,
} = require('./crmReportDateBounds');
const { attachLeadUserFlagsForList } = require('./crmLeadUserFlags');
const { crmLeadHasPhone, effectivePipelineStageSlaDays } = require('./crmPipelineSla');

/** Khoảng CRM trong ngày phiếu; untilIso cắt Phần II lúc 16:45. */
function dateRange(reportDate, untilIso) {
  return {
    startISO: crmReportCreatedAtFromIso(reportDate),
    endISO: untilIso || crmReportCreatedAtToIso(reportDate),
  };
}

/** Stage hiện tại → hạng mục kế hoạch (Deadline Quá hạn + Hôm nay). */
const PLAN_STAGE_TO_METRIC = {
  sale_admin: {
    lead_new: 'lead_new',
    not_contacted: 'not_contacted',
    cold: 'care_cold',
    warm: 'care_warm',
    hot: 'care_hot',
    survey_scheduled: 'survey_scheduled',
    survey_done: 'survey_scheduled',
  },
  sale_deal: {
    survey_scheduled: 'deal_new',
    survey_done: 'deal_interact',
    designing: 'deal_to_quote',
    quoted: 'deal_to_quote',
    negotiating: 'deal_to_quote',
    waiting_deposit: 'deal_to_contract',
    contract_signed: 'deal_to_contract',
    producing: 'deal_producing',
    installing: 'deal_installing',
    completed: 'deal_completed',
  },
};

const PLAN_METRIC_KEYS = {
  sale_admin: ['lead_new', 'not_contacted', 'care_cold', 'care_warm', 'care_hot', 'survey_scheduled'],
  sale_deal: [
    'deal_new', 'deal_interact', 'deal_survey', 'deal_to_quote', 'deal_to_contract',
    'deal_producing', 'deal_installing', 'deal_completed', 'deal_overdue',
  ],
};

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
  if (/\bmat\b|lost|thua|\bhuy\b/.test(s)) return 'lost';
  if (/^moi(\.|$|\s)|tiep\s*nhan|lead\s*moi|moi\s*tiep/.test(s)) return 'lead_new';
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

/** Cột đích cuối ngày → hạng mục phiếu (1 thẻ = 1 ô Kết quả). */
const RESULT_STAGE_TO_METRIC = {
  sale_admin: {
    lead_new: 'lead_new',
    not_contacted: 'not_contacted',
    cold: 'care_cold',
    warm: 'care_warm',
    hot: 'care_hot',
    survey_scheduled: 'survey_scheduled',
    survey_done: 'survey_scheduled',
  },
  sale_deal: {
    lead_new: 'deal_new',
    survey_scheduled: 'deal_new',
    survey_done: 'deal_interact',
    designing: 'deal_to_quote',
    quoted: 'deal_to_quote',
    negotiating: 'deal_to_quote',
    waiting_deposit: 'deal_to_contract',
    contract_signed: 'deal_to_contract',
    producing: 'deal_producing',
    installing: 'deal_installing',
    completed: 'deal_completed',
  },
};

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
async function listLeadsCreatedToday(userId, reportDate, type = 'lead', untilIso = null) {
  const { startISO, endISO } = dateRange(reportDate, untilIso);
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

function resolveHistorySlug(row) {
  const stage = row.stage || {};
  const slug = row.to_canonical_slug
    || stage.canonical_slug
    || slugFromStageName(stage.name);
  if (stage.is_lost || slug === 'lost') return 'lost';
  return slug || null;
}

function isOwnedLead(lead, userId) {
  const uid = String(userId);
  if (!lead) return false;
  return String(lead.lead_owner_id || '') === uid || String(lead.assigned_to || '') === uid;
}

/**
 * Điểm đến cuối trong ngày của từng thẻ NV phụ trách (không cộng hành trình).
 * @returns {Map<string, { slug: string, entered_at: string, id: string }>}
 */
async function listLastDestinations(userId, reportDate, type = null, untilIso = null) {
  const { startISO, endISO } = dateRange(reportDate, untilIso);
  const byLead = new Map();
  const page = 1000;
  let from = 0;

  for (;;) {
    let q = supabase
      .from('crm_lead_stage_history')
      .select(`
        id, lead_id, to_canonical_slug, to_stage_id, entered_at,
        lead:crm_leads!lead_id(id, type, lead_owner_id, assigned_to),
        stage:crm_pipeline_stages!to_stage_id(id, name, canonical_slug, is_lost)
      `)
      .gte('entered_at', startISO)
      .lte('entered_at', endISO)
      .order('entered_at', { ascending: true })
      .range(from, from + page - 1);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = data || [];
    for (const h of chunk) {
      const lead = h.lead;
      if (!h.lead_id || !isOwnedLead(lead, userId)) continue;
      if (type && lead?.type && lead.type !== type) continue;
      const slug = resolveHistorySlug(h);
      if (!slug) continue;
      const prev = byLead.get(String(h.lead_id));
      const ts = new Date(h.entered_at).getTime();
      const prevTs = prev ? new Date(prev.entered_at).getTime() : -1;
      if (!prev || ts > prevTs || (ts === prevTs && String(h.id) > String(prev.id))) {
        byLead.set(String(h.lead_id), {
          slug,
          entered_at: h.entered_at,
          id: h.id,
        });
      }
    }
    if (chunk.length < page) break;
    from += page;
    if (from >= 8000) break;
  }
  return byLead;
}

function groupLastDestByMetric(lastMap, roleKey) {
  const rk = roleKey === 'deal_admin' ? 'sale_deal' : roleKey;
  const stageMap = RESULT_STAGE_TO_METRIC[rk] || {};
  const byMetric = {};
  const skippedLost = [];
  const unmapped = [];
  for (const [leadId, row] of lastMap.entries()) {
    if (row.slug === 'lost') {
      skippedLost.push(leadId);
      continue;
    }
    const metricKey = stageMap[row.slug];
    if (!metricKey) {
      unmapped.push(leadId);
      continue;
    }
    if (!byMetric[metricKey]) byMetric[metricKey] = [];
    byMetric[metricKey].push(leadId);
  }
  return { byMetric, skippedLost, unmapped };
}

function lastDestPayload(byMetric, key, extraNote = '') {
  const ids = byMetric[key] || [];
  const n = ids.length;
  const note = `Tự động: ${n} thẻ điểm đến cuối${extraNote ? ` · ${extraNote}` : ''} (không đếm hành trình)`;
  return metricPayload(n, note, 'crm_lead_stage_history:last_destination', ids);
}

/**
 * Đếm chuyển cột trong ngày:
 * - Lead bạn phụ trách (owner/assigned) HOẶC bạn là người chuyển (changed_by)
 * - Ưu tiên to_canonical_slug; fallback slug stage / tên cột
 */
async function countStageFunnelBySlugs(userId, reportDate, slugs, type = null, untilIso = null) {
  const { startISO, endISO } = dateRange(reportDate, untilIso);
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

async function listCareActivities(userId, reportDate, untilIso = null) {
  const { startISO, endISO } = dateRange(reportDate, untilIso);
  const empty = {
    care_cold: 0, care_warm: 0, care_hot: 0, not_contacted: 0, survey: 0,
    ids: { care_cold: [], care_warm: [], care_hot: [], not_contacted: [], survey: [] },
  };

  const [{ data: acts, error }, { data: comments, error: cErr }] = await Promise.all([
    supabase
      .from('crm_activities')
      .select('id, lead_id, created_at, activity_date')
      .eq('created_by', userId)
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .limit(2000),
    supabase
      .from('crm_lead_comments')
      .select('id, lead_id, created_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .limit(4000),
  ]);
  if (error) throw error;
  if (cErr) throw cErr;

  const rows = [
    ...(acts || []),
    ...(comments || []),
  ];
  if (!rows.length) return empty;

  const leadIds = [...new Set(rows.map((a) => a.lead_id).filter(Boolean))];
  if (!leadIds.length) return empty;

  const leadSlug = new Map();
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200);
    const { data: leads, error: lErr } = await supabase
      .from('crm_leads')
      .select('id, type, stage:crm_pipeline_stages!stage_id(canonical_slug)')
      .in('id', chunk);
    if (lErr) throw lErr;
    for (const l of leads || []) {
      leadSlug.set(String(l.id), {
        slug: l.stage?.canonical_slug || null,
        type: l.type || null,
      });
    }
  }

  const seen = {
    care_cold: new Set(),
    care_warm: new Set(),
    care_hot: new Set(),
    not_contacted: new Set(),
    survey: new Set(),
  };
  for (const a of rows) {
    if (!a.lead_id) continue;
    const meta = leadSlug.get(String(a.lead_id)) || {};
    const slug = meta.slug;
    const isDeal = meta.type === 'deal';
    let key = null;
    if (slug === 'cold') key = 'care_cold';
    else if (slug === 'warm') key = 'care_warm';
    else if (slug === 'hot') key = 'care_hot';
    else if (slug === 'not_contacted') key = 'not_contacted';
    else if (slug === 'survey_scheduled' || slug === 'survey_done' || isDeal) key = 'survey';
    if (!key) continue;
    seen[key].add(String(a.lead_id));
  }
  return {
    care_cold: seen.care_cold.size,
    care_warm: seen.care_warm.size,
    care_hot: seen.care_hot.size,
    not_contacted: seen.not_contacted.size,
    survey: seen.survey.size,
    ids: {
      care_cold: [...seen.care_cold],
      care_warm: [...seen.care_warm],
      care_hot: [...seen.care_hot],
      not_contacted: [...seen.not_contacted],
      survey: [...seen.survey],
    },
  };
}

async function countSurveyEvents(userId, reportDate, untilIso = null) {
  const { startISO, endISO } = dateRange(reportDate, untilIso);
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
async function listLinkedSurveyEvents(userId, reportDate, untilIso = null) {
  const { startISO, endISO } = dateRange(reportDate, untilIso);
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
async function listDealsOverdueOnDay(userId, reportDate, untilIso = null) {
  const { startISO, endISO } = dateRange(reportDate, untilIso);
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

async function countInstallFollow(userId, reportDate, untilIso = null) {
  const { startISO, endISO } = dateRange(reportDate, untilIso);
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
async function listLeadToDealConversions(userId, reportDate, untilIso = null) {
  const { startISO, endISO } = dateRange(reportDate, untilIso);
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

async function computeAutoDailyResults(userId, reportDate, roleKey = 'sale_admin', untilIso = null) {
  const results = {};
  const rk = roleKey === 'deal_admin' ? 'sale_deal' : roleKey;
  let lastMap = new Map();
  let grouped = { byMetric: {}, skippedLost: [], unmapped: [] };

  if (rk === 'sale_admin') {
    lastMap = await listLastDestinations(userId, reportDate, 'lead', untilIso);
    grouped = groupLastDestByMetric(lastMap, 'sale_admin');
    const movedIds = new Set(lastMap.keys());
    const created = await listLeadsCreatedToday(userId, reportDate, 'lead', untilIso);
    const createdOnly = created.ids.filter((id) => !movedIds.has(id));
    const leadNewIds = unionIds(grouped.byMetric.lead_new, createdOnly);

    results.lead_new = metricPayload(
      leadNewIds.length,
      `Tự động: ${leadNewIds.length} lead điểm đến cuối = Tiếp nhận`
        + (createdOnly.length ? ` (gồm ${createdOnly.length} tạo mới chưa chuyển cột)` : '')
        + ` · bỏ ${grouped.skippedLost.length} kết thúc Mất`,
      'crm_lead_stage_history:last_destination|crm_leads.created_at',
      leadNewIds,
    );

    const care = await listCareActivities(userId, reportDate, untilIso);
    const mergeCare = (metricKey, careKey, destIds) => {
      const extra = (care.ids?.[careKey] || []).filter((id) => !movedIds.has(id));
      const ids = unionIds(destIds, extra);
      return metricPayload(
        ids.length,
        `Tự động: ${destIds.length} điểm đến cuối`
          + (extra.length ? ` + ${extra.length} chăm (không chuyển cột)` : '')
          + ' (không đếm hành trình)',
        extra.length
          ? 'crm_lead_stage_history:last_destination|crm_activities'
          : 'crm_lead_stage_history:last_destination',
        ids,
      );
    };
    results.not_contacted = mergeCare('not_contacted', 'not_contacted', grouped.byMetric.not_contacted || []);
    results.care_cold = mergeCare('care_cold', 'care_cold', grouped.byMetric.care_cold || []);
    results.care_warm = mergeCare('care_warm', 'care_warm', grouped.byMetric.care_warm || []);
    results.care_hot = mergeCare('care_hot', 'care_hot', grouped.byMetric.care_hot || []);

    const leadToDeal = await listLeadToDealConversions(userId, reportDate, untilIso);
    const destSurvey = grouped.byMetric.survey_scheduled || [];
    const convertExtra = leadToDeal.ids.filter((id) => !movedIds.has(id) && !destSurvey.includes(id));
    const surveyIds = unionIds(destSurvey, convertExtra);
    results.survey_scheduled = metricPayload(
      surveyIds.length,
      `Tự động: ${destSurvey.length} điểm đến cuối Hẹn KS/Deal`
        + (convertExtra.length ? ` + ${convertExtra.length} chốt Deal chưa nằm last-dest lead` : ''),
      'crm_lead_stage_history:last_destination|crm_kpi_ledger:lead_converted',
      surveyIds,
    );
  }

  if (rk === 'sale_deal') {
    lastMap = await listLastDestinations(userId, reportDate, 'deal', untilIso);
    grouped = groupLastDestByMetric(lastMap, 'sale_deal');
    const movedIds = new Set(lastMap.keys());
    const dealCreated = await listLeadsCreatedToday(userId, reportDate, 'deal', untilIso);
    const createdOnly = dealCreated.ids.filter((id) => !movedIds.has(id));
    const destNew = grouped.byMetric.deal_new || [];
    const dealNewIds = unionIds(destNew, createdOnly);
    results.deal_new = metricPayload(
      dealNewIds.length,
      `Tự động: ${destNew.length} điểm đến cuối = Deal mới`
        + (createdOnly.length ? ` + ${createdOnly.length} tạo mới chưa chuyển cột` : ''),
      'crm_lead_stage_history:last_destination|crm_leads.created_at',
      dealNewIds,
    );

    const linkedSurvey = await listLinkedSurveyEvents(userId, reportDate, untilIso);
    const destInteract = grouped.byMetric.deal_interact || [];
    const surveyExtra = (linkedSurvey.ids || []).filter((id) => !movedIds.has(id));
    const interactIds = unionIds(destInteract, surveyExtra);
    results.deal_interact = metricPayload(
      interactIds.length,
      `Tự động: ${destInteract.length} điểm đến cuối = Đã khảo sát`
        + (surveyExtra.length ? ` + ${surveyExtra.length} sự kiện KS (không chuyển cột)` : ''),
      surveyExtra.length
        ? 'crm_lead_stage_history:last_destination|crm_events'
        : 'crm_lead_stage_history:last_destination',
      interactIds,
    );
    results.deal_survey = results.deal_interact;

    results.deal_to_quote = lastDestPayload(grouped.byMetric, 'deal_to_quote');
    results.deal_to_contract = lastDestPayload(grouped.byMetric, 'deal_to_contract');
    results.deal_producing = lastDestPayload(grouped.byMetric, 'deal_producing');
    results.deal_installing = lastDestPayload(grouped.byMetric, 'deal_installing');
    results.deal_completed = lastDestPayload(grouped.byMetric, 'deal_completed');

    const overdue = await listDealsOverdueOnDay(userId, reportDate, untilIso);
    results.deal_overdue = metricPayload(
      overdue.count,
      `Tự động: ${overdue.count} deal quá hạn trong ngày (deadline / ngày đóng kỳ vọng)`,
      'crm_leads.kanban_deadline_at|expected_close_date',
      overdue.ids,
    );
  }

  if (rk === 'design_survey') {
    const surveyN = await countSurveyEvents(userId, reportDate, untilIso);
    results.survey_event = metricPayload(
      surveyN,
      `Tự động: ${surveyN} sự kiện khảo sát / đo đạc trong ngày`,
      'crm_events:site_visit|measurement',
      [],
    );
    const lastDeal = await listLastDestinations(userId, reportDate, 'deal', untilIso);
    const installIds = [];
    for (const [id, row] of lastDeal.entries()) {
      if (row.slug === 'installing') installIds.push(id);
    }
    results.install_follow = metricPayload(
      installIds.length,
      `Tự động: ${installIds.length} deal điểm đến cuối = lắp đặt`,
      'crm_lead_stage_history:last_destination',
      installIds,
    );
  }

  return {
    metrics: results,
    raw: {
      last_destination: grouped.byMetric,
      skipped_lost: grouped.skippedLost,
      unmapped: grouped.unmapped,
    },
    computed_at: new Date().toISOString(),
  };
}

function deadlineStageExcluded(stage) {
  return !!(
    stage?.is_won
    || stage?.is_lost
    || stage?.counts_as_completed_revenue
    || stage?.canonical_slug === 'won'
    || stage?.canonical_slug === 'lost'
    || stage?.deal_report_bucket === 'won'
    || stage?.deal_report_bucket === 'lost'
  );
}

/** Cùng thứ tự ưu tiên với màn Deadline (crmDeadlineTsForRow). */
function deadlineTsForLead(row) {
  if (row?.deadline_disabled_at) return null;
  if (!crmLeadHasPhone(row)) return null;
  if (deadlineStageExcluded(row.stage)) return null;

  for (const field of ['crm_next_open_task_deadline', 'kanban_deadline_at']) {
    const raw = row?.[field];
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }

  const slaDays = effectivePipelineStageSlaDays(row?.stage?.sla_days);
  if (slaDays != null && row?.stage_entered_at) {
    const due = endOfCalendarDayAfterEntered(row.stage_entered_at, slaDays, row?.company_id);
    const ts = due?.getTime?.();
    if (Number.isFinite(ts)) return ts;
  }

  const raw = row?.expected_close_date;
  if (raw) {
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return null;
}

/** Hạn NV CRM đang mở của cột hiện tại (giống attachCrmNextOpenTaskDeadline). */
async function attachNextOpenTaskDeadline(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return list;
  const stageByLead = new Map(list.map((r) => [String(r.id), r.stage_id == null ? null : String(r.stage_id)]));
  const byLead = new Map();
  const ids = list.map((r) => String(r.id));
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from('crm_tasks')
      .select('lead_id, pipeline_stage_id, deadline, order_index')
      .in('lead_id', chunk)
      .in('status', ['pending', 'in_progress'])
      .not('deadline', 'is', null);
    if (error) {
      console.warn('[daily-reports] next open task deadline:', error.message || error);
      continue;
    }
    for (const t of data || []) {
      const lid = String(t.lead_id);
      if (t.pipeline_stage_id != null && String(t.pipeline_stage_id) !== String(stageByLead.get(lid) || '')) continue;
      const ts = new Date(t.deadline).getTime();
      if (!Number.isFinite(ts)) continue;
      const orderIndex = Number(t.order_index) || 0;
      const prev = byLead.get(lid);
      if (!prev || ts < prev.ts || (ts === prev.ts && orderIndex < prev.orderIndex)) {
        byLead.set(lid, { ts, orderIndex });
      }
    }
  }
  return list.map((row) => {
    const hit = byLead.get(String(row.id));
    return {
      ...row,
      crm_next_open_task_deadline: hit ? new Date(hit.ts).toISOString() : null,
    };
  });
}

function deadlineBucketOnDate(deadlineTs, reportDate) {
  if (deadlineTs == null || !Number.isFinite(deadlineTs)) return null;
  const startMs = new Date(crmReportCreatedAtFromIso(reportDate)).getTime();
  const endMs = new Date(crmReportCreatedAtToIso(reportDate)).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (deadlineTs < startMs) return 'overdue';
  if (deadlineTs <= endMs) return 'today';
  return null;
}

async function listOwnedOpenCards(userId, type, companyId = null) {
  const rows = [];
  const page = 1000;
  let offset = 0;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select(`
        id, type, phone, stage_id, stage_entered_at, pipeline_id,
        kanban_deadline_at, expected_close_date, deadline_disabled_at,
        customer:customers(id, phone),
        stage:crm_pipeline_stages!crm_leads_stage_id_fkey(
          id, name, canonical_slug, is_won, is_lost, sla_days, is_active, pipeline_id,
          counts_as_completed_revenue, deal_report_bucket
        )
      `)
      .or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`)
      .eq('type', type)
      .is('deadline_disabled_at', null)
      .range(offset, offset + page - 1);
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < page) break;
    offset += page;
    if (offset >= 8000) break;
  }
  return rows;
}

/**
 * Kế hoạch ngày = thẻ Deadline Lead/Deal đang ở cột Quá hạn + Hôm nay,
 * gom theo cột Kanban hiện tại → hạng mục mẫu.
 */
async function computeAutoDailyPlans(userId, reportDate, roleKey = 'sale_admin', companyId = null) {
  const rk = roleKey === 'deal_admin' ? 'sale_deal' : roleKey;
  const empty = {
    metrics: {},
    raw: { overdue: 0, today: 0, type: null },
    computed_at: new Date().toISOString(),
  };
  if (rk !== 'sale_admin' && rk !== 'sale_deal') return empty;

  const type = rk === 'sale_deal' ? 'deal' : 'lead';
  const stageMap = PLAN_STAGE_TO_METRIC[rk];
  const seedKeys = PLAN_METRIC_KEYS[rk] || [];
  const results = Object.fromEntries(seedKeys.map((k) => [
    k,
    metricPayload(0, 'Tự động Deadline: 0 quá hạn + 0 hôm nay', 'deadline overdue+today', []),
  ]));

  let cards = await listOwnedOpenCards(userId, type, companyId);
  // Bám bảng Deadline: chỉ cột đang hoạt động của đúng pipeline thẻ, có SĐT, chưa thắng/thua.
  cards = cards.filter((row) => {
    if (row.deadline_disabled_at) return false;
    if (!row.stage || row.stage.is_active === false) return false;
    if (row.pipeline_id && row.stage.pipeline_id && String(row.pipeline_id) !== String(row.stage.pipeline_id)) return false;
    if (deadlineStageExcluded(row.stage)) return false;
    return crmLeadHasPhone(row);
  });
  cards = await attachNextOpenTaskDeadline(cards);
  cards = await attachLeadUserFlagsForList(cards, userId);
  const byMetric = new Map();
  const overdueIds = [];
  const todayIds = [];

  for (const row of cards) {
    if (row.is_interacted) continue;
    const ts = deadlineTsForLead(row);
    const bucket = deadlineBucketOnDate(ts, reportDate);
    if (bucket !== 'overdue' && bucket !== 'today') continue;
    const slug = row.stage?.canonical_slug || slugFromStageName(row.stage?.name);
    const metricKey = slug ? stageMap[slug] : null;
    if (bucket === 'overdue') overdueIds.push(String(row.id));
    else todayIds.push(String(row.id));
    if (!metricKey) continue;
    if (!byMetric.has(metricKey)) byMetric.set(metricKey, { overdue: [], today: [] });
    byMetric.get(metricKey)[bucket].push(String(row.id));
  }

  for (const [key, parts] of byMetric.entries()) {
    const ids = unionIds(parts.overdue, parts.today);
    results[key] = metricPayload(
      ids.length,
      `Tự động Deadline: ${parts.overdue.length} quá hạn + ${parts.today.length} hôm nay`,
      'crm_leads.kanban_deadline_at|expected_close_date|sla overdue+today',
      ids,
    );
  }
  if (rk === 'sale_deal') {
    results.deal_overdue = metricPayload(
      overdueIds.length,
      `Tự động Deadline: ${overdueIds.length} deal cột Quá hạn`,
      'crm_leads deadline bucket overdue',
      overdueIds,
    );
    results.deal_survey = results.deal_interact
      || metricPayload(0, 'Tự động Deadline: 0 quá hạn + 0 hôm nay', 'deadline overdue+today', []);
  }

  return {
    metrics: results,
    raw: {
      overdue: overdueIds.length,
      today: todayIds.length,
      overdue_ids: overdueIds,
      today_ids: todayIds,
      type,
    },
    computed_at: new Date().toISOString(),
  };
}

/** Resolve lead/deal cards for one metric (matrix drill-down). */
async function loadMetricEntityLinks(userId, reportDate, roleKey, metricKey, section = 'result', companyId = null, untilIso = null) {
  const key = String(metricKey || '').trim();
  if (!key) return { metric_key: key, ids: [], items: [] };
  const computed = await computeForUser(userId, reportDate, roleKey || 'sale_admin', section === 'plan' ? 'plan' : 'result', {
    companyId,
    untilIso,
  });
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
      .select('id, code, title, type, phone, company_id, stage:crm_pipeline_stages!stage_id(id, name)')
      .in('id', chunk);
    if (error) throw error;
    for (const row of data || []) {
      items.push({
        id: row.id,
        code: row.code || null,
        name: row.title || null,
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

/** @param {'plan'|'result'} phase */
async function computeForUser(userId, reportDate, roleKey, phase, opts = {}) {
  const rk = roleKey === 'deal_admin' ? 'sale_deal' : (roleKey || 'sale_admin');
  if (phase === 'plan') {
    return computeAutoDailyPlans(userId, reportDate, rk, opts.companyId || null);
  }
  return computeAutoDailyResults(userId, reportDate, rk, opts.untilIso || null);
}

async function computeMetric(userId, reportDate, roleKey, metricKey, phase, opts = {}) {
  const pack = await computeForUser(userId, reportDate, roleKey, phase, opts);
  return pack.metrics?.[metricKey] || metricPayload(0, 'Không có hạng mục', 'none', []);
}

const RESULT_METRIC_KEYS = {
  sale_admin: ['lead_new', 'not_contacted', 'care_cold', 'care_warm', 'care_hot', 'survey_scheduled'],
  sale_deal: [
    'deal_new', 'deal_interact', 'deal_survey', 'deal_to_quote', 'deal_to_contract',
    'deal_producing', 'deal_installing', 'deal_completed', 'deal_overdue',
  ],
  design_survey: ['survey_event', 'install_follow'],
};

const SNAPSHOT_METRIC_KEYS = [
  ...new Set([
    ...(PLAN_METRIC_KEYS.sale_admin || []),
    ...(PLAN_METRIC_KEYS.sale_deal || []),
    ...(RESULT_METRIC_KEYS.sale_admin || []),
    ...(RESULT_METRIC_KEYS.sale_deal || []),
    ...(RESULT_METRIC_KEYS.design_survey || []),
  ]),
];

function isSnapshotWorkMetric(metricKey) {
  const k = String(metricKey || '').trim();
  if (!k || k.startsWith('user_extra:')) return false;
  return SNAPSHOT_METRIC_KEYS.includes(k);
}

/** Catalog: mỗi metric_key một hàm compute (dùng chung computeForUser, không live lúc xem). */
const METRIC_CATALOG = Object.fromEntries(
  SNAPSHOT_METRIC_KEYS.map((key) => [
    key,
    {
      key,
      phases: PLAN_METRIC_KEYS.sale_admin.includes(key) || PLAN_METRIC_KEYS.sale_deal.includes(key)
        ? ['plan', 'result']
        : ['result'],
      compute: (userId, reportDate, roleKey, phase, opts = {}) => (
        computeMetric(userId, reportDate, roleKey, key, phase, opts)
      ),
    },
  ]),
);

module.exports = {
  computeAutoDailyResults,
  computeAutoDailyPlans,
  computeForUser,
  computeMetric,
  loadMetricEntityLinks,
  metricKeyFromLabel,
  PLAN_METRIC_KEYS,
  RESULT_METRIC_KEYS,
  SNAPSHOT_METRIC_KEYS,
  isSnapshotWorkMetric,
  METRIC_CATALOG,
  dateRange,
};
