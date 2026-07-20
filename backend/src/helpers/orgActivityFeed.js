const { supabase } = require('../config/supabase');
const {
  applyCrmLeadRegionFilterToQuery,
  getCrmLeadRegionConstraint,
} = require('./crmRegionScope');
const {
  crmReportCreatedAtFromIso,
  crmReportCreatedAtToIso,
} = require('./crmReportDateBounds');

function truncText(s, max = 72) {
  if (!s) return '';
  const t = String(s).trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

function formatVndShort(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')} tỷ`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} tr`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} k`;
  return String(Math.round(n));
}

function leadLabel(lead) {
  const code = lead?.code ? String(lead.code).trim() : '';
  const title = lead?.title ? String(lead.title).trim() : '';
  if (code && title) return `${code} · ${truncText(title, 40)}`;
  return code || title || 'Hồ sơ CRM';
}

function leadMatchesAssignee(lead, userId, pipelineType) {
  if (!userId || !lead) return true;
  const uid = String(userId);
  if (pipelineType === 'lead') {
    return uid === String(lead.assigned_to || '') || uid === String(lead.lead_owner_id || '');
  }
  return uid === String(lead.assigned_to || '') || uid === String(lead.lead_owner_id || '');
}

function applyLeadRegionFiltersOnHistoryQuery(q, req, explicitRegionId) {
  const constraint = getCrmLeadRegionConstraint(req);
  if (explicitRegionId) {
    q = q.eq('lead.region_id', explicitRegionId);
  } else if (constraint.mode === 'in' && constraint.ids?.length) {
    q = q.in('lead.region_id', constraint.ids);
  }
  return q;
}

function applyCreatedLeadsQueryScope(q, req, { effectiveCompanyId, explicitRegionId }) {
  if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId);
  if (explicitRegionId) q = q.eq('region_id', explicitRegionId);
  q = applyCrmLeadRegionFilterToQuery(q, req);
  return q;
}

function mapStageEvent(row) {
  const lead = row.lead || {};
  const toStage = row.to_stage || {};
  const fromStage = row.from_stage || {};
  const actor = row.changer?.full_name || 'Hệ thống';
  const val = Number(lead.estimated_value) || 0;
  const isWon = !!toStage.is_won;
  const isLost = !!toStage.is_lost;
  let eventType = 'stage_changed';
  if (isWon) eventType = 'deal_won';
  else if (isLost) eventType = 'deal_lost';

  const fromName = fromStage.name || '—';
  const toName = toStage.name || '—';
  const typeLabel = lead.type === 'deal' ? 'Deal' : 'Lead';

  return {
    id: `stage:${row.id}`,
    event_type: eventType,
    occurred_at: row.entered_at,
    lead_id: row.lead_id,
    lead_type: lead.type || row.pipeline_type || null,
    lead_title: lead.title || null,
    lead_code: lead.code || null,
    actor_name: actor,
    from_stage_name: fromName,
    to_stage_name: toName,
    estimated_value: val,
    title: isWon
      ? `Deal chốt — ${leadLabel(lead)}`
      : isLost
        ? `Deal thua — ${leadLabel(lead)}`
        : `${typeLabel} chuyển cột — ${leadLabel(lead)}`,
    subtitle: isWon || isLost
      ? `${actor} · ${toName}`
      : `${actor} · ${fromName} → ${toName}`,
    value: val > 0 ? formatVndShort(val) : '',
    badge: isWon ? 'Chốt' : isLost ? 'Thua' : 'Chuyển cột',
    badge_tone: isWon ? 'green' : isLost ? 'red' : 'teal',
  };
}

function mapCreatedEvent(row) {
  const creator = row.creator?.full_name || row.owner?.full_name || 'Hệ thống';
  const val = Number(row.estimated_value) || 0;
  const isDeal = row.type === 'deal';
  return {
    id: `created:${row.id}`,
    event_type: isDeal ? 'deal_created' : 'lead_created',
    occurred_at: row.created_at,
    lead_id: row.id,
    lead_type: row.type || null,
    lead_title: row.title || null,
    lead_code: row.code || null,
    actor_name: creator,
    estimated_value: val,
    title: isDeal ? `Deal mới — ${leadLabel(row)}` : `Lead mới — ${leadLabel(row)}`,
    subtitle: `${creator} · Theo ngày tạo`,
    value: val > 0 ? formatVndShort(val) : (isDeal ? 'Deal' : '+1'),
    badge: isDeal ? 'Deal mới' : 'Lead mới',
    badge_tone: isDeal ? 'green' : 'purple',
  };
}

function mapCrmActivityEvent(row) {
  const lead = row.lead || {};
  const actor = row.creator?.full_name || 'NV';
  const typeLabel = {
    call: 'Gọi điện',
    meeting: 'Hẹn gặp',
    email: 'Email',
    zalo: 'Zalo',
    note: 'Ghi chú',
    quote_sent: 'Gửi báo giá',
  }[row.type] || row.type || 'Hoạt động';
  return {
    id: `activity:${row.id}`,
    event_type: 'crm_activity',
    occurred_at: row.activity_date || row.created_at,
    lead_id: row.lead_id,
    lead_type: lead.type || null,
    lead_title: lead.title || null,
    lead_code: lead.code || null,
    actor_name: actor,
    title: `${typeLabel} — ${leadLabel(lead)}`,
    subtitle: `${actor} · ${truncText(row.title || row.description, 48)}`,
    value: '',
    badge: typeLabel,
    badge_tone: 'teal',
  };
}

function mapCommentEvent(row) {
  const lead = row.lead || {};
  const actor = row.user?.full_name || 'NV';
  return {
    id: `comment:${row.id}`,
    event_type: 'comment',
    occurred_at: row.created_at,
    lead_id: row.lead_id,
    lead_type: lead.type || null,
    lead_title: lead.title || null,
    lead_code: lead.code || null,
    actor_name: actor,
    content_preview: truncText(row.body, 80),
    title: `Bình luận — ${leadLabel(lead)}`,
    subtitle: `${actor} · ${truncText(row.body, 56)}`,
    value: '',
    badge: 'Trao đổi',
    badge_tone: 'muted',
  };
}

/**
 * Feed hoạt động CRM thực — stage history, tạo mới, bình luận.
 * @param {import('express').Request} req
 */
async function fetchOrgActivityFeed(req, {
  effectiveCompanyId,
  explicitRegionId,
  df,
  dt,
  typeView = 'all',
  leadAssigneeOnly = null,
  dealAssigneeOnly = null,
  limit = 30,
  since = null,
}) {
  const endIso = crmReportCreatedAtToIso(dt) || `${dt}T23:59:59.999+07:00`;
  const fetchLimit = Math.min(Math.max(limit * 3, 60), 150);
  const sinceIso = since ? new Date(since).toISOString() : null;
  const fromIso = sinceIso || crmReportCreatedAtFromIso(df) || `${df}T00:00:00+07:00`;

  const skipLeads = typeView === 'deal';
  const skipDeals = typeView === 'lead';

  const events = [];

  if (!skipLeads || !skipDeals) {
    let hq = supabase
      .from('crm_lead_stage_history')
      .select(`
        id, lead_id, pipeline_type, entered_at, changed_by, from_stage_id,
        lead:crm_leads!inner(id, title, code, type, company_id, region_id, assigned_to, lead_owner_id, estimated_value),
        from_stage:crm_pipeline_stages!crm_lead_stage_history_from_stage_id_fkey(name, is_won, is_lost),
        to_stage:crm_pipeline_stages!crm_lead_stage_history_to_stage_id_fkey(name, is_won, is_lost, color),
        changer:users!crm_lead_stage_history_changed_by_fkey(full_name)
      `)
      .not('from_stage_id', 'is', null)
      .gte('entered_at', fromIso)
      .lte('entered_at', endIso)
      .order('entered_at', { ascending: false })
      .limit(fetchLimit);

    if (effectiveCompanyId) hq = hq.eq('lead.company_id', effectiveCompanyId);
    hq = applyLeadRegionFiltersOnHistoryQuery(hq, req, explicitRegionId);

    const { data: histRows, error: histErr } = await hq;
    if (histErr) throw histErr;

    for (const row of histRows || []) {
      const lead = row.lead || {};
      const pType = lead.type || row.pipeline_type;
      if (skipLeads && pType === 'lead') continue;
      if (skipDeals && pType === 'deal') continue;
      const assigneeOnly = pType === 'deal' ? dealAssigneeOnly : leadAssigneeOnly;
      if (!leadMatchesAssignee(lead, assigneeOnly, pType)) continue;
      events.push(mapStageEvent(row));
    }
  }

  const createdTypes = [];
  if (!skipLeads) createdTypes.push('lead');
  if (!skipDeals) createdTypes.push('deal');

  for (const t of createdTypes) {
    let lq = supabase
      .from('crm_leads')
      .select(`
        id, title, code, type, created_at, estimated_value, assigned_to, lead_owner_id, company_id, region_id,
        creator:users!crm_leads_created_by_fkey(full_name),
        owner:users!crm_leads_assigned_to_fkey(full_name)
      `)
      .eq('type', t)
      .is('parent_lead_id', null)
      .gte('created_at', fromIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    lq = applyCreatedLeadsQueryScope(lq, req, { effectiveCompanyId, explicitRegionId });
    const assigneeOnly = t === 'deal' ? dealAssigneeOnly : leadAssigneeOnly;
    if (assigneeOnly) {
      if (t === 'lead') {
        lq = lq.or(`assigned_to.eq.${assigneeOnly},lead_owner_id.eq.${assigneeOnly}`);
      } else {
        lq = lq.eq('assigned_to', assigneeOnly);
      }
    }

    const { data: createdRows, error: createErr } = await lq;
    if (createErr) throw createErr;
    for (const row of createdRows || []) {
      events.push(mapCreatedEvent(row));
    }
  }

  try {
    let cq = supabase
      .from('crm_lead_comments')
      .select(`
        id, lead_id, body, created_at,
        user:users!crm_lead_comments_user_id_fkey(full_name),
        lead:crm_leads!inner(id, title, code, type, company_id, region_id, assigned_to, lead_owner_id)
      `)
      .is('deleted_at', null)
      .is('parent_id', null)
      .gte('created_at', fromIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(Math.min(fetchLimit, 40));

    if (effectiveCompanyId) cq = cq.eq('lead.company_id', effectiveCompanyId);
    if (explicitRegionId) cq = cq.eq('lead.region_id', explicitRegionId);
    const constraint = getCrmLeadRegionConstraint(req);
    if (!explicitRegionId && constraint.mode === 'in' && constraint.ids?.length) {
      cq = cq.in('lead.region_id', constraint.ids);
    }

    const { data: commentRows, error: commentErr } = await cq;
    if (!commentErr) {
      for (const row of commentRows || []) {
        const lead = row.lead || {};
        if (skipLeads && lead.type === 'lead') continue;
        if (skipDeals && lead.type === 'deal') continue;
        const assigneeOnly = lead.type === 'deal' ? dealAssigneeOnly : leadAssigneeOnly;
        if (!leadMatchesAssignee(lead, assigneeOnly, lead.type)) continue;
        events.push(mapCommentEvent(row));
      }
    }
  } catch {
    /* bảng comment có thể chưa có deleted_at — bỏ qua */
  }

  try {
    let aq = supabase
      .from('crm_activities')
      .select(`
        id, lead_id, type, title, description, activity_date, created_at,
        creator:users!crm_activities_created_by_fkey(full_name),
        lead:crm_leads!inner(id, title, code, type, company_id, region_id, assigned_to, lead_owner_id)
      `)
      .gte('activity_date', fromIso)
      .lte('activity_date', endIso)
      .order('activity_date', { ascending: false })
      .limit(Math.min(fetchLimit, 40));

    if (effectiveCompanyId) aq = aq.eq('lead.company_id', effectiveCompanyId);
    if (explicitRegionId) aq = aq.eq('lead.region_id', explicitRegionId);
    const actConstraint = getCrmLeadRegionConstraint(req);
    if (!explicitRegionId && actConstraint.mode === 'in' && actConstraint.ids?.length) {
      aq = aq.in('lead.region_id', actConstraint.ids);
    }

    const { data: actRows, error: actErr } = await aq;
    if (!actErr) {
      for (const row of actRows || []) {
        const lead = row.lead || {};
        if (skipLeads && lead.type === 'lead') continue;
        if (skipDeals && lead.type === 'deal') continue;
        const assigneeOnly = lead.type === 'deal' ? dealAssigneeOnly : leadAssigneeOnly;
        if (!leadMatchesAssignee(lead, assigneeOnly, lead.type)) continue;
        events.push(mapCrmActivityEvent(row));
      }
    }
  } catch {
    /* crm_activities optional */
  }

  events.sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));

  const seen = new Set();
  const deduped = [];
  for (const ev of events) {
    const key = `${ev.event_type}:${ev.lead_id}:${ev.occurred_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ev);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

module.exports = { fetchOrgActivityFeed };
