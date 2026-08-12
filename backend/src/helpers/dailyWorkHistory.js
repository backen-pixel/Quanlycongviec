/**
 * Lịch sử công việc trong ngày trên hệ thống (tóm tắt + chi tiết).
 * Actor = user thực hiện (created_by / changed_by / assignee / participant).
 */
const { supabase } = require('../config/supabase');
const {
  crmReportCreatedAtFromIso,
  crmReportCreatedAtToIso,
} = require('./crmReportDateBounds');

function trunc(s, max = 80) {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function leadLabel(lead) {
  if (!lead) return 'Hồ sơ CRM';
  const code = lead.code ? String(lead.code).trim() : '';
  const title = lead.title ? String(lead.title).trim() : '';
  if (code && title) return `${code} · ${trunc(title, 36)}`;
  return code || title || 'Hồ sơ CRM';
}

/**
 * @returns {{ summary, items }}
 */
async function buildDailyWorkHistory(userId, reportDate) {
  const startISO = crmReportCreatedAtFromIso(reportDate);
  const endISO = crmReportCreatedAtToIso(reportDate);
  const items = [];

  const summary = {
    events: 0,
    activities: 0,
    comments: 0,
    stage_moves: 0,
    leads_created: 0,
    deals_created: 0,
    tasks_done: 0,
    interactions: 0,
    deal_interactions: 0,
    deal_stage_moves: 0,
    lead_interactions: 0,
  };

  // ── Sự kiện (assignee / creator / participant) ─────────────────────────────
  const eventIds = new Set();
  const eventRows = [];

  const { data: evMain } = await supabase
    .from('crm_events')
    .select('id, title, event_type, status, start_time, created_at, assignee_id, created_by, lead_id, lead:crm_leads(id, code, title, type)')
    .or(`assignee_id.eq.${userId},created_by.eq.${userId}`)
    .gte('start_time', startISO)
    .lte('start_time', endISO)
    .order('start_time', { ascending: false })
    .limit(200);

  for (const ev of evMain || []) {
    eventIds.add(String(ev.id));
    eventRows.push(ev);
  }

  // Fallback: created_at nếu start_time trống
  if (!(evMain || []).length) {
    const { data: evAlt } = await supabase
      .from('crm_events')
      .select('id, title, event_type, status, start_time, created_at, assignee_id, created_by, lead_id, lead:crm_leads(id, code, title, type)')
      .or(`assignee_id.eq.${userId},created_by.eq.${userId}`)
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: false })
      .limit(200);
    for (const ev of evAlt || []) {
      if (!eventIds.has(String(ev.id))) {
        eventIds.add(String(ev.id));
        eventRows.push(ev);
      }
    }
  }

  try {
    const { data: parts } = await supabase
      .from('crm_event_participants')
      .select('event_id')
      .eq('user_id', userId)
      .limit(300);
    const pIds = [...new Set((parts || []).map((p) => p.event_id).filter(Boolean))];
    const missing = pIds.filter((id) => !eventIds.has(String(id)));
    if (missing.length) {
      for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        const { data: evP } = await supabase
          .from('crm_events')
          .select('id, title, event_type, status, start_time, created_at, assignee_id, created_by, lead_id, lead:crm_leads(id, code, title, type)')
          .in('id', chunk)
          .gte('start_time', startISO)
          .lte('start_time', endISO);
        for (const ev of evP || []) {
          if (!eventIds.has(String(ev.id))) {
            eventIds.add(String(ev.id));
            eventRows.push(ev);
          }
        }
      }
    }
  } catch {
    /* participants table optional */
  }

  summary.events = eventRows.length;
  for (const ev of eventRows) {
    const role = String(ev.assignee_id) === String(userId)
      ? 'phụ trách'
      : (String(ev.created_by) === String(userId) ? 'tạo' : 'tham gia');
    items.push({
      id: `event:${ev.id}`,
      kind: 'event',
      occurred_at: ev.start_time || ev.created_at,
      title: ev.title || ev.event_type || 'Sự kiện',
      subtitle: `${ev.event_type || 'event'} · ${role}${ev.lead ? ` · ${leadLabel(ev.lead)}` : ''}`,
      meta: { event_id: ev.id, status: ev.status, lead_id: ev.lead_id },
    });
  }

  // ── Activity / ghi chú CRM ─────────────────────────────────────────────────
  const { data: acts } = await supabase
    .from('crm_activities')
    .select('id, type, title, content, note, created_at, lead_id, lead:crm_leads(id, code, title, type)')
    .eq('created_by', userId)
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .order('created_at', { ascending: false })
    .limit(300);
  summary.activities = (acts || []).length;
  for (const a of acts || []) {
    if (a.lead?.type === 'deal') summary.deal_interactions += 1;
    else if (a.lead?.type === 'lead') summary.lead_interactions += 1;
    items.push({
      id: `activity:${a.id}`,
      kind: 'activity',
      occurred_at: a.created_at,
      title: a.title || a.type || 'Tương tác',
      subtitle: `${a.type || 'note'}${a.lead ? ` · ${leadLabel(a.lead)}` : ''}${a.content || a.note ? ` — ${trunc(a.content || a.note, 60)}` : ''}`,
      meta: { activity_id: a.id, lead_id: a.lead_id, lead_type: a.lead?.type },
    });
  }

  // ── Comment trên lead/deal ─────────────────────────────────────────────────
  try {
    const { data: comments } = await supabase
      .from('crm_lead_comments')
      .select('id, body, created_at, lead_id, lead:crm_leads(id, code, title, type)')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: false })
      .limit(200);
    summary.comments = (comments || []).length;
    for (const c of comments || []) {
      if (c.lead?.type === 'deal') summary.deal_interactions += 1;
      else if (c.lead?.type === 'lead') summary.lead_interactions += 1;
      items.push({
        id: `comment:${c.id}`,
        kind: 'comment',
        occurred_at: c.created_at,
        title: 'Bình luận',
        subtitle: `${c.lead ? leadLabel(c.lead) : 'Lead/Deal'} — ${trunc(c.body, 70)}`,
        meta: { comment_id: c.id, lead_id: c.lead_id },
      });
    }
  } catch {
    summary.comments = 0;
  }

  // ── Chuyển cột (changed_by) ────────────────────────────────────────────────
  const { data: moves } = await supabase
    .from('crm_lead_stage_history')
    .select(`
      id, lead_id, entered_at, pipeline_type, to_canonical_slug,
      lead:crm_leads(id, code, title, type),
      from_stage:crm_pipeline_stages!crm_lead_stage_history_from_stage_id_fkey(name),
      to_stage:crm_pipeline_stages!crm_lead_stage_history_to_stage_id_fkey(name, is_won, is_lost)
    `)
    .eq('changed_by', userId)
    .gte('entered_at', startISO)
    .lte('entered_at', endISO)
    .order('entered_at', { ascending: false })
    .limit(300);
  summary.stage_moves = (moves || []).length;
  for (const m of moves || []) {
    const leadType = m.lead?.type || m.pipeline_type;
    if (leadType === 'deal') summary.deal_stage_moves += 1;
    const fromN = m.from_stage?.name || '—';
    const toN = m.to_stage?.name || m.to_canonical_slug || '—';
    let kind = 'stage_move';
    if (m.to_stage?.is_won) kind = 'deal_won';
    else if (m.to_stage?.is_lost) kind = 'deal_lost';
    items.push({
      id: `stage:${m.id}`,
      kind,
      occurred_at: m.entered_at,
      title: `Chuyển cột: ${fromN} → ${toN}`,
      subtitle: `${(leadType || 'lead').toUpperCase()} · ${leadLabel(m.lead)}`,
      meta: { history_id: m.id, lead_id: m.lead_id, to_slug: m.to_canonical_slug },
    });
  }

  // ── Tạo lead / deal ────────────────────────────────────────────────────────
  const { data: created } = await supabase
    .from('crm_leads')
    .select('id, code, title, type, created_at')
    .eq('created_by', userId)
    .is('parent_lead_id', null)
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .order('created_at', { ascending: false })
    .limit(200);
  for (const row of created || []) {
    if (row.type === 'deal') summary.deals_created += 1;
    else summary.leads_created += 1;
    items.push({
      id: `created:${row.id}`,
      kind: row.type === 'deal' ? 'deal_created' : 'lead_created',
      occurred_at: row.created_at,
      title: row.type === 'deal' ? 'Tạo Deal mới' : 'Tạo Lead mới',
      subtitle: leadLabel(row),
      meta: { lead_id: row.id, type: row.type },
    });
  }

  // ── Task CRM hoàn thành ────────────────────────────────────────────────────
  const { data: tasks } = await supabase
    .from('crm_tasks')
    .select('id, title, status, completed_at, updated_at, lead_id')
    .eq('assignee_id', userId)
    .gte('updated_at', startISO)
    .lte('updated_at', endISO)
    .order('updated_at', { ascending: false })
    .limit(200);
  const doneTasks = (tasks || []).filter((t) => {
    const st = String(t.status || '').toLowerCase();
    return st === 'done' || st === 'completed' || !!t.completed_at;
  });
  summary.tasks_done = doneTasks.length;
  for (const t of doneTasks) {
    items.push({
      id: `task:${t.id}`,
      kind: 'task_done',
      occurred_at: t.completed_at || t.updated_at,
      title: 'Hoàn thành công việc',
      subtitle: trunc(t.title, 80),
      meta: { task_id: t.id, lead_id: t.lead_id },
    });
  }

  summary.interactions = summary.activities + summary.comments;

  items.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));

  return {
    date: reportDate,
    user_id: userId,
    summary,
    items,
    total_items: items.length,
  };
}

/** Số liệu metric bổ sung cho auto-close form BC ngày */
async function computeExtraDailyMetrics(userId, reportDate) {
  const hist = await buildDailyWorkHistory(userId, reportDate);
  const s = hist.summary;
  return {
    events_count: {
      value: s.events,
      note: `Tự động: ${s.events} sự kiện (tạo/phụ trách/tham gia) trong ngày`,
      source: 'crm_events+participants',
    },
    interactions: {
      value: s.interactions,
      note: `Tự động: ${s.activities} activity + ${s.comments} bình luận`,
      source: 'crm_activities+crm_lead_comments',
    },
    stage_moves: {
      value: s.stage_moves,
      note: `Tự động: ${s.stage_moves} lần chuyển cột Lead/Deal`,
      source: 'crm_lead_stage_history:changed_by',
    },
    _history_summary: s,
  };
}

module.exports = {
  buildDailyWorkHistory,
  computeExtraDailyMetrics,
};
