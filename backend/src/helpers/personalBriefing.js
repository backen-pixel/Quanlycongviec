/**
 * Personal briefing — đọc dữ liệu cá nhân của 1 user (req.user.userId) để Trợ lý AI phân tích & nhắc việc.
 * Gồm 3 phần: nhiệm vụ CRM sắp/quá hạn, KPI sổ cái tháng, Lead CSKH cần chăm.
 *
 * Không gọi OpenAI ở đây — chỉ trả payload thuần. Việc gom prompt + fallback nằm ở route /assistant/me/briefing.
 */
const { supabase } = require('../config/supabase');

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

const FOLLOWUP_TIME_BUCKETS = [
  { key: 'w1', label: '7–13 ngày trước', daysFrom: 13, daysTo: 7 },
  { key: 'w2', label: '14–20 ngày trước', daysFrom: 20, daysTo: 14 },
  { key: 'w3', label: '21–27 ngày trước', daysFrom: 27, daysTo: 21 },
  { key: 'w4', label: '28–34 ngày trước', daysFrom: 34, daysTo: 28 },
];

/** YYYY-MM-01 theo lịch VN — kỳ KPI tháng hiện tại của server. */
function vnMonthStartYmd(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  return `${y}-${m}-01`;
}

/**
 * Nhiệm vụ CRM mở của tôi: deadline trong 72h tới hoặc đã quá hạn (≤14 ngày), assignee_id = me.
 */
async function fetchMyDueCrmTasks(userId) {
  if (!userId) return [];
  const now = Date.now();
  const horizon = new Date(now + 72 * HOUR_MS).toISOString();
  const floor = new Date(now - 14 * DAY_MS).toISOString();
  const rows = [];
  const page = 200;
  for (let from = 0; from < 2000; from += page) {
    const { data, error } = await supabase
      .from('crm_tasks')
      .select(
        'id, title, deadline, priority, status, stage_slug, lead_id, lead:crm_leads(id, title, code, type, assigned_to, lead_owner_id)',
      )
      .eq('assignee_id', userId)
      .in('status', ['pending', 'in_progress'])
      .not('deadline', 'is', null)
      .lte('deadline', horizon)
      .gte('deadline', floor)
      .order('deadline', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < page) break;
  }
  return rows.map((t) => {
    const dlMs = new Date(t.deadline).getTime();
    return {
      id: t.id,
      title: t.title,
      deadline_iso: t.deadline,
      priority: t.priority || null,
      status: t.status,
      stage_slug: t.stage_slug || null,
      overdue: dlMs < now,
      hours_to_deadline: Math.round((dlMs - now) / HOUR_MS),
      lead_id: t.lead_id || t.lead?.id || null,
      lead_code: t.lead?.code || null,
      lead_title: t.lead?.title || null,
      lead_type: t.lead?.type || null,
    };
  });
}

/**
 * Tổng điểm sổ cái KPI tháng hiện tại cho lead/deal có `assigned_to = me` hoặc `lead_owner_id = me`.
 * Trả gồm: net_sum, period_start, top_leads (sắp xếp |net|), counts âm/dương.
 */
async function fetchMyKpiLedgerMonth(userId) {
  if (!userId) return null;
  const periodStart = vnMonthStartYmd();

  const myLeadIds = new Set();
  const page = 1000;
  for (let from = 0; from < 20000; from += page) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select('id')
      .or(`assigned_to.eq.${userId},lead_owner_id.eq.${userId}`)
      .range(from, from + page - 1);
    if (error) throw error;
    const chunk = data || [];
    for (const r of chunk) {
      if (r.id) myLeadIds.add(String(r.id));
    }
    if (chunk.length < page) break;
  }
  if (!myLeadIds.size) {
    return {
      period_start: periodStart,
      net_sum: 0,
      lead_count_with_points: 0,
      top_leads: [],
    };
  }

  const ids = [...myLeadIds];
  const sumByLead = new Map();
  const CHUNK = 150;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from('crm_kpi_ledger')
        .select('lead_id, points')
        .in('lead_id', part)
        .eq('period_type', 'monthly')
        .eq('period_start', periodStart)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      for (const r of rows) {
        if (!r.lead_id) continue;
        const k = String(r.lead_id);
        sumByLead.set(k, (sumByLead.get(k) || 0) + Number(r.points || 0));
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }

  let netSum = 0;
  for (const v of sumByLead.values()) netSum += v;
  netSum = Math.round(netSum * 100) / 100;

  const leadsWithPoints = [...sumByLead.entries()].filter(([, v]) => Math.abs(v) > 0.0001);

  let topLeadInfo = [];
  if (leadsWithPoints.length) {
    const topIds = leadsWithPoints
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 12)
      .map(([id]) => id);
    const { data: leadInfo } = await supabase
      .from('crm_leads')
      .select('id, code, title, type')
      .in('id', topIds);
    const infoMap = new Map((leadInfo || []).map((l) => [String(l.id), l]));
    topLeadInfo = topIds.map((id) => {
      const l = infoMap.get(id) || {};
      return {
        lead_id: id,
        code: l.code || null,
        title: l.title || null,
        type: l.type || null,
        net: Math.round((sumByLead.get(id) || 0) * 100) / 100,
      };
    });
  }

  return {
    period_start: periodStart,
    net_sum: netSum,
    lead_count_with_points: leadsWithPoints.length,
    top_leads: topLeadInfo,
  };
}

/**
 * Lead CSKH cần chăm lại — gom theo bucket (7/14/21/28 ngày), chỉ lead có
 * `assigned_to = me` hoặc `lead_owner_id = me`. Loại các lead user đã đánh dấu chăm sóc.
 */
async function fetchMyCskhBuckets(userId) {
  if (!userId) return [];

  const { data: pipelines } = await supabase
    .from('crm_pipelines')
    .select('id, name, company_id')
    .eq('is_active', true);
  const allPipelineIds = (pipelines || []).map((p) => p.id);
  if (!allPipelineIds.length) return [];
  const pipelineMap = Object.fromEntries((pipelines || []).map((p) => [p.id, p]));

  const { data: stages } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name, color, icon, pipeline_id, pipeline_type, is_won, is_lost')
    .in('pipeline_id', allPipelineIds)
    .eq('is_active', true);
  const stageMap = {};
  const openStageIds = [];
  const pipelineTypeMap = {};
  for (const s of stages || []) {
    stageMap[s.id] = s;
    if (!s.is_won && !s.is_lost) openStageIds.push(s.id);
    if (s.pipeline_type && s.pipeline_id) pipelineTypeMap[s.pipeline_id] = s.pipeline_type;
  }
  if (!openStageIds.length) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDaysBack = Math.max(...FOLLOWUP_TIME_BUCKETS.map((b) => b.daysFrom));
  const globalDateFrom = new Date(today);
  globalDateFrom.setDate(globalDateFrom.getDate() - maxDaysBack);

  let allLeads = [];
  let offset = 0;
  const batchSize = 500;
  let hasMore = true;
  while (hasMore && allLeads.length < 5000) {
    const { data: batch } = await supabase
      .from('crm_leads')
      .select('id, stage_id, pipeline_id, created_at, type')
      .is('parent_lead_id', null)
      .in('pipeline_id', allPipelineIds)
      .in('stage_id', openStageIds)
      .or(`assigned_to.eq.${userId},lead_owner_id.eq.${userId}`)
      .gte('created_at', globalDateFrom.toISOString().split('T')[0])
      .lte('created_at', `${today.toISOString().split('T')[0]}T23:59:59.999Z`)
      .range(offset, offset + batchSize - 1);
    const rows = batch || [];
    allLeads = allLeads.concat(rows);
    hasMore = rows.length === batchSize;
    offset += batchSize;
  }

  let caredLeadIds = new Set();
  try {
    const { data: marks } = await supabase
      .from('crm_lead_care_marks')
      .select('lead_id')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString());
    caredLeadIds = new Set((marks || []).map((m) => m.lead_id));
  } catch {
    /* bảng có thể chưa migrate */
  }

  let dismissedSet = new Set();
  try {
    const { data: dismissals } = await supabase
      .from('crm_followup_care_dismissals')
      .select('pipeline_id, stage_id, company_id, time_bucket')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString());
    dismissedSet = new Set(
      (dismissals || []).map(
        (d) => `${d.pipeline_id || ''}|${d.stage_id || ''}|${d.company_id || ''}|${d.time_bucket}`,
      ),
    );
  } catch {
    /* ignore */
  }

  const counts = {};
  const groupTypeMap = {};
  for (const lead of allLeads) {
    if (caredLeadIds.has(lead.id)) continue;
    const createdMs = new Date(lead.created_at).getTime();
    for (const bucket of FOLLOWUP_TIME_BUCKETS) {
      const from = new Date(today);
      from.setDate(from.getDate() - bucket.daysFrom);
      const to = new Date(today);
      to.setDate(to.getDate() - bucket.daysTo);
      to.setHours(23, 59, 59, 999);
      if (createdMs >= from.getTime() && createdMs <= to.getTime()) {
        const key = `${lead.pipeline_id}|${lead.stage_id}|${bucket.key}`;
        counts[key] = (counts[key] || 0) + 1;
        if (lead.type === 'lead' || lead.type === 'deal') {
          groupTypeMap[`${lead.pipeline_id}|${lead.stage_id}`] = lead.type;
        }
        break;
      }
    }
  }

  const out = [];
  for (const [key, count] of Object.entries(counts)) {
    const [pipelineId, stageId, timeBucket] = key.split('|');
    const pipeline = pipelineMap[pipelineId];
    const stage = stageMap[stageId];
    if (!pipeline || !stage) continue;

    const dismissKey = `${pipelineId}|${stageId}|${pipeline.company_id || ''}|${timeBucket}`;
    if (dismissedSet.has(dismissKey)) continue;

    const bucketMeta = FOLLOWUP_TIME_BUCKETS.find((b) => b.key === timeBucket);
    const resolvedType =
      groupTypeMap[`${pipelineId}|${stageId}`] || stage.pipeline_type || pipelineTypeMap[pipelineId] || 'lead';
    out.push({
      pipeline_id: pipelineId,
      pipeline_name: pipeline.name,
      stage_id: stageId,
      stage_name: stage.name,
      stage_icon: stage.icon || null,
      time_bucket: timeBucket,
      time_label: bucketMeta?.label || timeBucket,
      lead_count: count,
      pipeline_type: resolvedType,
      company_id: pipeline.company_id || null,
      nav_url: `/crm/follow-up-care?pipeline_id=${pipelineId}&stage_id=${stageId}&company_id=${pipeline.company_id || ''}&time=${timeBucket}&type=${resolvedType}`,
    });
  }
  out.sort((a, b) => b.lead_count - a.lead_count);
  return out.slice(0, 12);
}

/**
 * Tóm tắt 3 nguồn cho 1 user. Hàm an toàn — bắt lỗi từng nhánh để tránh nhánh hỏng làm mất tất cả.
 */
async function buildPersonalBriefingPayload(userId, userMeta = {}) {
  const [tasks, kpi, cskh] = await Promise.all([
    fetchMyDueCrmTasks(userId).catch((e) => {
      console.warn('[briefing] tasks error:', e.message);
      return [];
    }),
    fetchMyKpiLedgerMonth(userId).catch((e) => {
      console.warn('[briefing] kpi error:', e.message);
      return null;
    }),
    fetchMyCskhBuckets(userId).catch((e) => {
      console.warn('[briefing] cskh error:', e.message);
      return [];
    }),
  ]);

  const overdueTasks = tasks.filter((t) => t.overdue);
  const dueSoonTasks = tasks.filter((t) => !t.overdue);
  const cskhTotal = cskh.reduce((s, b) => s + (b.lead_count || 0), 0);

  return {
    generated_at: new Date().toISOString(),
    user: {
      id: userId,
      full_name: userMeta.full_name || null,
      email: userMeta.email || null,
      role: userMeta.role || null,
    },
    summary_counts: {
      overdue_tasks: overdueTasks.length,
      due_soon_tasks: dueSoonTasks.length,
      cskh_total: cskhTotal,
      kpi_net_sum: kpi?.net_sum ?? null,
    },
    crm_tasks: {
      overdue: overdueTasks.slice(0, 12),
      due_soon: dueSoonTasks.slice(0, 12),
    },
    kpi_ledger_month: kpi,
    cskh_buckets: cskh,
  };
}

module.exports = {
  buildPersonalBriefingPayload,
  fetchMyDueCrmTasks,
  fetchMyKpiLedgerMonth,
  fetchMyCskhBuckets,
};
