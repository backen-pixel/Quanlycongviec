/**
 * Gom nhật ký công trình từ nhiều nguồn (nhiệm vụ, phát sinh, dự án, CRM, bình luận).
 */
const { supabase } = require('../config/supabase');
const {
  resolveCompanyScopeForRequest,
  applyProjectScopeFilter,
} = require('./tenantScope');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(['all', 'tasks', 'phat_sinh', 'project', 'crm', 'comments']);
const HISTORY_CAP = 800;
const EXPORT_CAP = 2000;

function scopedAdminCompanyId(req) {
  const sac = req.user?.scoped_admin_company_id || req.user?.scopedAdminCompanyId;
  return sac && String(sac).trim() ? String(sac).trim() : null;
}

function companyScope(req, companyIdQuery) {
  return resolveCompanyScopeForRequest(req, companyIdQuery, {
    scopedAdminCompanyId: scopedAdminCompanyId(req),
  });
}

function chunk(arr, size = 200) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function inRange(iso, from, to) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  if (from) {
    const a = new Date(`${from}T00:00:00+07:00`).getTime();
    if (Number.isFinite(a) && t < a) return false;
  }
  if (to) {
    const b = new Date(`${to}T23:59:59.999+07:00`).getTime();
    if (Number.isFinite(b) && t > b) return false;
  }
  return true;
}

function matchesQuery(item, q) {
  if (!q) return true;
  const hay = [
    item.title, item.description, item.event_label, item.actor_name, item.source_label,
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function actorName(actor) {
  if (!actor) return '';
  if (typeof actor === 'string') return actor;
  return actor.full_name || actor.email || '';
}

function actorIdOf(actor, fallbackId) {
  const id = actor?.id || fallbackId || null;
  return id ? String(id) : null;
}

async function resolveAllowedActorIds({ userId, regionId, companyId }) {
  if (userId && UUID_RE.test(userId)) return new Set([String(userId)]);
  const regionNone = regionId === '__none__';
  if (!regionNone && !regionId && !companyId) return null;

  let companyUsers = null;
  if (companyId && UUID_RE.test(companyId)) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .neq('is_active', false);
    if (error) throw error;
    companyUsers = new Set((data || []).map((r) => String(r.id)).filter(Boolean));
  }

  if (regionNone) {
    let pool = companyUsers;
    if (!pool) {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .neq('is_active', false);
      if (error) throw error;
      pool = new Set((data || []).map((r) => String(r.id)).filter(Boolean));
    }
    const { data: assigned, error } = await supabase
      .from('user_company_regions')
      .select('user_id');
    if (error) throw error;
    const withRegion = new Set((assigned || []).map((r) => String(r.user_id)).filter(Boolean));
    return new Set([...pool].filter((id) => !withRegion.has(id)));
  }

  if (regionId && UUID_RE.test(regionId)) {
    const { data, error } = await supabase
      .from('user_company_regions')
      .select('user_id')
      .eq('region_id', regionId);
    if (error) throw error;
    const byRegion = new Set((data || []).map((r) => String(r.user_id)).filter(Boolean));
    return companyUsers
      ? new Set([...byRegion].filter((id) => companyUsers.has(id)))
      : byRegion;
  }

  return companyUsers;
}

function stringifyJson(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    if (value.title) return String(value.title);
    if (value.status) return String(value.status);
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function eventLabel(type) {
  const map = {
    created: 'Tạo mới',
    deleted: 'Đã xóa',
    status_changed: 'Đổi trạng thái',
    assignee_changed: 'Đổi người phụ trách',
    deadline_changed: 'Đổi hạn',
    completed: 'Hoàn thành',
    comment_added: 'Bình luận',
    file_added: 'Đính kèm',
    assignment_created: 'Tạo phát sinh',
    system: 'Hệ thống',
    comment: 'Hoạt động',
  };
  return map[type] || type || 'Thao tác';
}

function kindLabel(kind) {
  const map = {
    tasks: 'Nhiệm vụ',
    phat_sinh: 'Phát sinh',
    project: 'Dự án',
    crm: 'CRM',
    comments: 'Bình luận',
  };
  return map[kind] || kind;
}

function sourceLabel(source) {
  const map = {
    task: 'Nhiệm vụ SX/VC',
    crm_task: 'Nhiệm vụ CRM',
    crm_assignment: 'Giao việc / phát sinh',
    activity_log: 'Nhật ký dự án',
    crm_activity: 'Hoạt động CRM',
    lead_comment: 'Bình luận deal',
    deadline: 'Hạn CRM',
    assignment: 'Phát sinh',
  };
  return map[source] || source || '';
}

async function fetchAllIn(table, select, column, ids, extra) {
  if (!ids.length) return [];
  const rows = [];
  for (const part of chunk(ids)) {
    let q = supabase.from(table).select(select).in(column, part);
    if (typeof extra === 'function') q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

async function resolveLeadIds(projectId) {
  const ids = new Set();
  const { data: leads, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, code, title, type, project_id')
    .eq('project_id', projectId);
  if (leadErr) throw leadErr;
  for (const row of leads || []) {
    if (row?.id) ids.add(String(row.id));
  }
  try {
    const { data: links, error } = await supabase
      .from('crm_deal_projects')
      .select('deal_id')
      .eq('project_id', projectId);
    if (!error) {
      for (const row of links || []) {
        if (row?.deal_id) ids.add(String(row.deal_id));
      }
    }
  } catch (_) { /* bảng có thể chưa có */ }

  let details = leads || [];
  const missing = [...ids].filter((id) => !details.some((l) => String(l.id) === id));
  if (missing.length) {
    const extra = await fetchAllIn(
      'crm_leads',
      'id, code, title, type, project_id',
      'id',
      missing,
    );
    details = [...details, ...extra];
  }
  return { leadIds: [...ids], leads: details };
}

async function loadScopedProject(req, projectId, companyIdQuery) {
  const scope = companyScope(req, companyIdQuery);
  if (!scope.ok) return { error: scope.error || 'Không có quyền', status: 403 };
  let q = supabase
    .from('projects')
    .select('id, code, name, status, company_id, customer:customers(full_name)')
    .eq('id', projectId);
  q = applyProjectScopeFilter(q, scope);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return { error: 'Không tìm thấy công trình hoặc không có quyền xem', status: 404 };
  return { project: data, scope };
}

function mapHistoryRow(row) {
  const source = row.source;
  const kind = source === 'crm_assignment' ? 'phat_sinh' : 'tasks';
  return {
    id: `hist-${row.id}`,
    kind,
    event_type: row.event_type,
    event_label: eventLabel(row.event_type),
    title: stringifyJson(row.new_value) || row.description || eventLabel(row.event_type),
    description: row.description || '',
    created_at: row.created_at,
    actor: row.actor || null,
    actor_id: actorIdOf(row.actor, row.actor_user_id),
    actor_name: actorName(row.actor),
    source,
    source_label: sourceLabel(source),
    source_id: row.source_id,
    lead_id: row.lead_id || null,
  };
}

function mapActivityLog(row) {
  return {
    id: `alog-${row.id}`,
    kind: 'project',
    event_type: row.action || 'updated',
    event_label: eventLabel(row.action) || row.action || 'Dự án',
    title: row.description || row.action || 'Thao tác dự án',
    description: row.description || '',
    created_at: row.created_at,
    actor: row.user || null,
    actor_id: actorIdOf(row.user, row.user_id),
    actor_name: actorName(row.user),
    source: 'activity_log',
    source_label: sourceLabel('activity_log'),
    source_id: String(row.id),
    lead_id: null,
  };
}

function mapCrmActivity(row) {
  return {
    id: `cact-${row.id}`,
    kind: 'crm',
    event_type: row.type || 'comment',
    event_label: eventLabel(row.type) || 'Hoạt động CRM',
    title: row.title || row.type || 'Hoạt động CRM',
    description: row.description || row.outcome || '',
    created_at: row.created_at || row.activity_date,
    actor: row.creator || null,
    actor_id: actorIdOf(row.creator, row.created_by),
    actor_name: actorName(row.creator),
    source: 'crm_activity',
    source_label: sourceLabel('crm_activity'),
    source_id: String(row.id),
    lead_id: row.lead_id || null,
  };
}

function mapLeadComment(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const isPhatSinh = meta.source === 'shared_workspace_assignment'
    || /nhiệm vụ (phát sinh|lỗi từ nhân viên)/i.test(String(row.body || ''));
  const isSystem = String(row.comment_type || '') === 'system';
  return {
    id: `cmt-${row.id}`,
    kind: isPhatSinh ? 'phat_sinh' : (isSystem ? 'crm' : 'comments'),
    event_type: isPhatSinh ? 'assignment_created' : (isSystem ? 'system' : 'comment_added'),
    event_label: isPhatSinh ? 'Tạo phát sinh' : (isSystem ? 'Hệ thống' : 'Bình luận'),
    title: isPhatSinh ? 'Phát sinh Không gian chung' : (isSystem ? 'Nhật ký hệ thống' : 'Bình luận'),
    description: String(row.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    created_at: row.created_at,
    actor: row.user || null,
    actor_id: actorIdOf(row.user, row.user_id),
    actor_name: actorName(row.user),
    source: 'lead_comment',
    source_label: sourceLabel('lead_comment'),
    source_id: String(row.id),
    lead_id: row.lead_id || null,
  };
}

function mapDeadline(row) {
  const oldV = row.old_deadline_at ? new Date(row.old_deadline_at).toLocaleString('vi-VN') : '—';
  const newV = row.new_deadline_at ? new Date(row.new_deadline_at).toLocaleString('vi-VN') : '—';
  return {
    id: `ddl-${row.id}`,
    kind: 'crm',
    event_type: 'deadline_changed',
    event_label: 'Đổi hạn',
    title: 'Đổi hạn CRM',
    description: `${oldV} → ${newV}${row.reason ? ` · ${row.reason}` : ''}`,
    created_at: row.created_at,
    actor: row.changer || null,
    actor_id: actorIdOf(row.changer, row.changed_by),
    actor_name: actorName(row.changer),
    source: 'deadline',
    source_label: sourceLabel('deadline'),
    source_id: String(row.id),
    lead_id: row.lead_id || null,
  };
}

function mapAssignmentSnapshot(row) {
  const src = String(row.task_source_type || '');
  const srcLabel = src === 'employee_error' ? 'Lỗi từ nhân viên' : 'Phát sinh từ khách hàng';
  return {
    id: `asg-${row.id}`,
    kind: 'phat_sinh',
    event_type: 'assignment_created',
    event_label: 'Tạo phát sinh',
    title: row.title || 'Phát sinh',
    description: [srcLabel, row.description].filter(Boolean).join(' · '),
    created_at: row.created_at,
    actor: row.created_by || null,
    actor_id: actorIdOf(row.created_by, row.created_by_id),
    actor_name: actorName(row.created_by),
    source: 'assignment',
    source_label: sourceLabel('assignment'),
    source_id: String(row.id),
    lead_id: row.lead_id || null,
  };
}

async function collectLogs(projectId, leadIds) {
  const items = [];
  const warn = (label, err) => {
    console.warn(`[project-logs] ${label}:`, err?.message || err);
  };

  try {
    const histSelect = `
        id, source, source_id, project_id, lead_id, event_type, field_name,
        old_value, new_value, description, created_at,
        actor:users!unified_task_history_actor_user_id_fkey(id, full_name, avatar)
      `;
    const seenHist = new Set();
    const pushHist = (rows) => {
      for (const row of rows || []) {
        if (seenHist.has(row.id)) continue;
        seenHist.add(row.id);
        items.push(mapHistoryRow(row));
      }
    };
    const { data: byProject, error: pErr } = await supabase
      .from('unified_task_history')
      .select(histSelect)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_CAP);
    if (pErr) throw pErr;
    pushHist(byProject);
    if (leadIds.length) {
      const byLead = await fetchAllIn(
        'unified_task_history',
        histSelect,
        'lead_id',
        leadIds,
        (q) => q.order('created_at', { ascending: false }).limit(400),
      );
      pushHist(byLead);
    }
  } catch (e) { warn('unified_task_history', e); }

  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('id, action, description, created_at, user:users(id, full_name, avatar)')
      .eq('entity_type', 'project')
      .eq('entity_id', projectId)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    for (const row of data || []) items.push(mapActivityLog(row));
  } catch (e) { warn('activity_logs', e); }

  if (leadIds.length) {
    try {
      const rows = await fetchAllIn(
        'crm_activities',
        'id, lead_id, type, title, description, outcome, created_at, activity_date, created_by, creator:users!crm_activities_created_by_fkey(id, full_name)',
        'lead_id',
        leadIds,
        (q) => q.order('created_at', { ascending: false }).limit(400),
      );
      for (const row of rows) items.push(mapCrmActivity(row));
    } catch (e) { warn('crm_activities', e); }

    try {
      const rows = await fetchAllIn(
        'crm_lead_comments',
        'id, lead_id, body, comment_type, metadata, created_at, user:users!crm_lead_comments_user_id_fkey(id, full_name, avatar)',
        'lead_id',
        leadIds,
        (q) => q.order('created_at', { ascending: false }).limit(500),
      );
      for (const row of rows) items.push(mapLeadComment(row));
    } catch (e) { warn('crm_lead_comments', e); }

    try {
      const rows = await fetchAllIn(
        'crm_lead_deadline_history',
        'id, lead_id, old_deadline_at, new_deadline_at, reason, created_at, changer:users!crm_lead_deadline_history_changed_by_fkey(id, full_name, avatar)',
        'lead_id',
        leadIds,
        (q) => q.order('created_at', { ascending: false }).limit(200),
      );
      for (const row of rows) items.push(mapDeadline(row));
    } catch (e) { warn('deadline_history', e); }

    try {
      const rows = await fetchAllIn(
        'crm_assignments',
        `id, lead_id, title, description, task_source_type, created_at,
         created_by:users!crm_assignments_created_by_id_fkey(id, full_name)`,
        'lead_id',
        leadIds,
        (q) => q.not('task_source_type', 'is', null).order('created_at', { ascending: false }).limit(400),
      );
      const haveAsg = new Set(
        items.filter((x) => x.source === 'crm_assignment' && x.event_type === 'created')
          .map((x) => String(x.source_id)),
      );
      for (const row of rows) {
        if (haveAsg.has(String(row.id))) continue;
        items.push(mapAssignmentSnapshot(row));
      }
    } catch (e) { warn('crm_assignments', e); }
  }

  return items;
}

function emptyCounts() {
  return { all: 0, tasks: 0, phat_sinh: 0, project: 0, crm: 0, comments: 0 };
}

async function listProjectConstructionLogs(req, query = {}) {
  const projectId = String(query.project_id || '').trim();
  if (!UUID_RE.test(projectId)) {
    return { error: 'Chọn công trình hợp lệ', status: 400 };
  }
  const kind = KINDS.has(String(query.kind || 'all')) ? String(query.kind || 'all') : 'all';
  const q = String(query.q || '').trim().toLowerCase().slice(0, 80);
  const dateFrom = String(query.date_from || '').trim().slice(0, 10);
  const dateTo = String(query.date_to || '').trim().slice(0, 10);
  const userId = String(query.user_id || '').trim();
  const regionId = String(query.region_id || '').trim();
  const companyId = String(query.company_id || '').trim();
  const limit = Math.min(Math.max(Number(query.limit) || 80, 1), EXPORT_CAP);
  const offset = Math.max(Number(query.offset) || 0, 0);

  const loaded = await loadScopedProject(req, projectId, null);
  if (loaded.error) return loaded;

  const { leadIds, leads } = await resolveLeadIds(projectId);
  const raw = await collectLogs(projectId, leadIds);
  const allowedActors = await resolveAllowedActorIds({ userId, regionId, companyId: '' });
  const filtered = raw.filter((item) => {
    if (!inRange(item.created_at, dateFrom, dateTo) || !matchesQuery(item, q)) return false;
    if (!allowedActors) return true;
    return item.actor_id && allowedActors.has(String(item.actor_id));
  });
  const counts = emptyCounts();
  for (const item of filtered) {
    counts.all += 1;
    if (counts[item.kind] != null) counts[item.kind] += 1;
  }
  const scoped = kind === 'all' ? filtered : filtered.filter((item) => item.kind === kind);
  scoped.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return {
    data: {
      project: {
        id: loaded.project.id,
        code: loaded.project.code,
        name: loaded.project.name,
        status: loaded.project.status,
        customer_name: loaded.project.customer?.full_name || null,
      },
      leads: leads.map((l) => ({ id: l.id, code: l.code, title: l.title, type: l.type })),
      items: scoped.slice(offset, offset + limit),
      total: scoped.length,
      counts,
      kind,
    },
    status: 200,
  };
}

module.exports = {
  KINDS,
  kindLabel,
  resolveAllowedActorIds,
  listProjectConstructionLogs,
};
