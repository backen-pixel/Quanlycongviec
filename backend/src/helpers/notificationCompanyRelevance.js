/**
 * Phạm vi TB theo công ty: user gắn company chỉ nhận TB của công ty mình
 * hoặc nơi công ty mình tham gia (CRM / SX / VC / đặt xưởng), hoặc có liên quan cá nhân.
 */

const { supabase } = require('../config/supabase');
const { isSystemAdmin, isPlatformAdmin } = require('./adminRole');

const SKIP_COMPANY_SCOPE_TYPES = new Set([
  'messenger_chat',
  'messenger_group',
  'release_note',
  'saas_notify',
  'app_update',
]);

function normalizeCompanyId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function isGlobalNotificationViewer(user) {
  return isSystemAdmin(user) || isPlatformAdmin(user);
}

function addCompanyId(set, value) {
  const cid = normalizeCompanyId(value);
  if (cid) set.add(cid);
}

function relatedIdsFromMetadata(metadata) {
  const set = new Set();
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  addCompanyId(set, meta.company_id || meta.companyId);
  const related = meta.related_company_ids || meta.relatedCompanyIds;
  if (Array.isArray(related)) {
    related.forEach((id) => addCompanyId(set, id));
  }
  return set;
}

/**
 * Công ty liên quan tới entity TB (chủ CRM + xưởng SX/VC + placement).
 */
async function resolveRelatedCompanyIds({ entityType, entityId, metadata } = {}) {
  const set = relatedIdsFromMetadata(metadata);
  const et = String(entityType || '');
  const eid = entityId != null ? String(entityId).trim() : '';
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const metaLeadId = meta.lead_id != null ? String(meta.lead_id).trim() : '';
  const metaProjectId = meta.project_id != null ? String(meta.project_id).trim() : '';

  try {
    if (et === 'project' && eid) {
      await collectProjectRelatedCompanyIds(eid, set);
    } else if (['lead', 'deal', 'crm_lead', 'crm_deal'].includes(et) && eid) {
      await collectLeadRelatedCompanyIds(eid, set);
    } else if (et === 'crm_task' && eid) {
      const { data: task } = await supabase
        .from('crm_tasks')
        .select('lead_id, executor_company_id')
        .eq('id', eid)
        .maybeSingle();
      addCompanyId(set, task?.executor_company_id);
      if (task?.lead_id) await collectLeadRelatedCompanyIds(task.lead_id, set);
    } else if (et === 'quotation' && eid) {
      const { data: q } = await supabase
        .from('quotations')
        .select('lead_id, company_id')
        .eq('id', eid)
        .maybeSingle();
      addCompanyId(set, q?.company_id);
      if (q?.lead_id) await collectLeadRelatedCompanyIds(q.lead_id, set);
    } else if (et === 'event' && eid) {
      const { data: ev } = await supabase
        .from('crm_events')
        .select('lead_id, company_id')
        .eq('id', eid)
        .maybeSingle();
      addCompanyId(set, ev?.company_id);
      if (ev?.lead_id) await collectLeadRelatedCompanyIds(ev.lead_id, set);
    } else if (metaLeadId) {
      await collectLeadRelatedCompanyIds(metaLeadId, set);
    } else if (metaProjectId) {
      await collectProjectRelatedCompanyIds(metaProjectId, set);
    }
  } catch (e) {
    console.warn('[notificationCompanyRelevance] resolve:', e.message || e);
  }

  return set;
}

async function collectLeadRelatedCompanyIds(leadId, set) {
  if (!leadId) return;
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id, company_id, project_id, sx_template_company_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return;
  addCompanyId(set, lead.company_id);
  addCompanyId(set, lead.sx_template_company_id);

  const projectIds = new Set();
  if (lead.project_id) projectIds.add(String(lead.project_id));
  try {
    const { data: links } = await supabase
      .from('crm_deal_projects')
      .select('project_id')
      .eq('deal_id', leadId);
    (links || []).forEach((r) => {
      if (r?.project_id) projectIds.add(String(r.project_id));
    });
  } catch (_) { /* ignore */ }

  for (const pid of projectIds) {
    await collectProjectRelatedCompanyIds(pid, set);
  }
}

async function collectProjectRelatedCompanyIds(projectId, set) {
  if (!projectId) return;
  try {
    const { listProjectParticipantCompanies } = require('./projectParticipantCompanies');
    const list = await listProjectParticipantCompanies(projectId);
    (list || []).forEach((c) => addCompanyId(set, c?.id));
  } catch (_) {
    const { data: proj } = await supabase
      .from('projects')
      .select('company_id, logistics_company_id')
      .eq('id', projectId)
      .maybeSingle();
    addCompanyId(set, proj?.company_id);
    addCompanyId(set, proj?.logistics_company_id);
  }

  try {
    const { data: assigns } = await supabase
      .from('project_company_assignments')
      .select('company_id')
      .eq('project_id', projectId);
    (assigns || []).forEach((r) => addCompanyId(set, r?.company_id));
  } catch (_) { /* ignore */ }
}

async function loadUserCompanyIds(userId) {
  const ids = new Set();
  const { data: user } = await supabase
    .from('users')
    .select('id, role, company_id')
    .eq('id', userId)
    .maybeSingle();
  if (!user) return { user: null, companyIds: ids };
  addCompanyId(ids, user.company_id);
  try {
    const { data: links } = await supabase
      .from('user_companies')
      .select('company_id')
      .eq('user_id', userId);
    (links || []).forEach((r) => addCompanyId(ids, r?.company_id));
  } catch (_) { /* ignore */ }
  return { user, companyIds: ids };
}

async function isPersonallyInvolved(userId, { entityType, entityId, metadata } = {}) {
  const uid = String(userId || '');
  if (!uid) return false;
  const et = String(entityType || '');
  const eid = entityId != null ? String(entityId).trim() : '';
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  if (meta.mentioned === true || meta.mentioned === 'true') return true;

  let leadId = null;
  let projectId = meta.project_id != null ? String(meta.project_id).trim() : '';

  if (['lead', 'deal', 'crm_lead', 'crm_deal'].includes(et) && eid) leadId = eid;
  else if (meta.lead_id) leadId = String(meta.lead_id).trim();
  else if (et === 'project' && eid) projectId = eid;
  else if (et === 'crm_task' && eid) {
    const { data: task } = await supabase
      .from('crm_tasks')
      .select('lead_id, assignee_id, supervisor_id, created_by')
      .eq('id', eid)
      .maybeSingle();
    if ([task?.assignee_id, task?.supervisor_id, task?.created_by].map(String).includes(uid)) return true;
    leadId = task?.lead_id || null;
  }

  if (leadId) {
    const { data: mem } = await supabase
      .from('lead_members')
      .select('user_id')
      .eq('lead_id', leadId)
      .eq('user_id', uid)
      .maybeSingle();
    if (mem?.user_id) return true;

    const { data: lead } = await supabase
      .from('crm_leads')
      .select('assigned_to, lead_owner_id, project_id, created_by')
      .eq('id', leadId)
      .maybeSingle();
    if ([lead?.assigned_to, lead?.lead_owner_id, lead?.created_by].map(String).includes(uid)) return true;
    if (!projectId && lead?.project_id) projectId = String(lead.project_id);
  }

  if (projectId) {
    const { data: staff } = await supabase
      .from('project_production_staff')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();
    if (staff?.user_id) return true;
  }

  return false;
}

function userCompanyOverlapsRelated(userCompanyIds, relatedCompanyIds) {
  if (!relatedCompanyIds?.size) return false;
  for (const cid of userCompanyIds || []) {
    if (relatedCompanyIds.has(String(cid))) return true;
  }
  return false;
}

/**
 * Lọc danh sách người nhận — giữ admin hệ thống, NV không gắn công ty,
 * user thuộc công ty liên quan, hoặc có liên quan cá nhân tới entity.
 */
async function filterUserIdsByCompanyRelevance(userIds, {
  type,
  entityType,
  entityId,
  metadata,
  relatedCompanyIds,
} = {}) {
  const unique = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!unique.length) return [];
  if (SKIP_COMPANY_SCOPE_TYPES.has(String(type || ''))) return unique;

  let related = relatedCompanyIds instanceof Set
    ? relatedCompanyIds
    : new Set((relatedCompanyIds || []).map(String).filter(Boolean));
  if (!related.size) {
    related = await resolveRelatedCompanyIds({ entityType, entityId, metadata });
  }
  // Không resolve được công ty → không chặn (messenger / TB hệ thống).
  if (!related.size) return unique;

  const { data: users, error } = await supabase
    .from('users')
    .select('id, role, company_id')
    .in('id', unique);
  if (error) {
    console.warn('[notificationCompanyRelevance] users:', error.message);
    return unique;
  }

  const allowed = new Set();
  const candidates = [];

  for (const u of users || []) {
    const id = String(u.id);
    if (isGlobalNotificationViewer(u)) {
      allowed.add(id);
      continue;
    }
    const ucid = normalizeCompanyId(u.company_id);
    if (!ucid) {
      // NV xưởng chưa gắn company — chỉ nhận khi đã nằm trong list đích (member/assignee).
      allowed.add(id);
      continue;
    }
    if (related.has(ucid)) {
      allowed.add(id);
      continue;
    }
    candidates.push(id);
  }

  if (candidates.length) {
    try {
      const { data: links } = await supabase
        .from('user_companies')
        .select('user_id, company_id')
        .in('user_id', candidates);
      for (const row of links || []) {
        if (related.has(normalizeCompanyId(row.company_id))) {
          allowed.add(String(row.user_id));
        }
      }
    } catch (_) { /* ignore */ }

    const still = candidates.filter((id) => !allowed.has(id));
    await Promise.all(still.map(async (uid) => {
      if (await isPersonallyInvolved(uid, { entityType, entityId, metadata })) {
        allowed.add(uid);
      }
    }));
  }

  return unique.filter((id) => allowed.has(id));
}

/**
 * Inbox sync: TB có related_company_ids rõ ràng phải khớp công ty viewer.
 * Chỉ stamp company_id đơn → giữ lại để lớp async resolve participant.
 */
function notificationRelevantToCompanyViewer(n, viewer) {
  if (!n) return false;
  if (isGlobalNotificationViewer(viewer)) return true;
  const viewerCid = normalizeCompanyId(viewer?.company_id);
  if (!viewerCid) return true;

  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const relatedList = meta.related_company_ids || meta.relatedCompanyIds;
  const hasExplicitRelated = Array.isArray(relatedList) && relatedList.length > 0;
  const related = relatedIdsFromMetadata(meta);
  if (!related.size) return true;
  if (related.has(viewerCid)) return true;
  if (!hasExplicitRelated) return true;
  return false;
}

/**
 * Lọc inbox bất đồng bộ: resolve entity khi thiếu stamp (batch).
 */
async function filterNotificationsForCompanyViewerAsync(rows, viewer) {
  const list = rows || [];
  if (!list.length) return [];
  if (isGlobalNotificationViewer(viewer)) return list;
  const viewerCid = normalizeCompanyId(viewer?.company_id);
  if (!viewerCid) return list;

  const { companyIds: viewerCompanies } = await loadUserCompanyIds(viewer?.userId || viewer?.id);
  if (viewerCid) viewerCompanies.add(viewerCid);

  const out = [];
  const needResolve = [];

  for (const n of list) {
    const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
    const relatedList = meta.related_company_ids || meta.relatedCompanyIds;
    const hasExplicitRelated = Array.isArray(relatedList) && relatedList.length > 0;
    const stamped = relatedIdsFromMetadata(meta);

    if (hasExplicitRelated) {
      if (userCompanyOverlapsRelated(viewerCompanies, stamped)) out.push(n);
      continue;
    }
    if (stamped.size && userCompanyOverlapsRelated(viewerCompanies, stamped)) {
      out.push(n);
      continue;
    }
    if (SKIP_COMPANY_SCOPE_TYPES.has(String(n.type || ''))) {
      out.push(n);
      continue;
    }
    // company_id lệch hoặc chưa stamp → resolve participant companies
    needResolve.push(n);
  }

  if (!needResolve.length) return out;

  const leadIds = new Set();
  const projectIds = new Set();
  const taskIds = new Set();
  const quotationIds = new Set();
  const eventIds = new Set();

  for (const n of needResolve) {
    const et = String(n.entity_type || '');
    const eid = n.entity_id != null ? String(n.entity_id).trim() : '';
    const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
    if (['lead', 'deal', 'crm_lead', 'crm_deal'].includes(et) && eid) leadIds.add(eid);
    else if (et === 'project' && eid) projectIds.add(eid);
    else if (et === 'crm_task' && eid) taskIds.add(eid);
    else if (et === 'quotation' && eid) quotationIds.add(eid);
    else if (et === 'event' && eid) eventIds.add(eid);
    if (meta.lead_id) leadIds.add(String(meta.lead_id).trim());
    if (meta.project_id) projectIds.add(String(meta.project_id).trim());
  }

  if (taskIds.size) {
    const { data: tasks } = await supabase
      .from('crm_tasks')
      .select('id, lead_id, executor_company_id')
      .in('id', [...taskIds]);
    for (const t of tasks || []) {
      if (t.lead_id) leadIds.add(String(t.lead_id));
    }
  }
  if (quotationIds.size) {
    const { data: qs } = await supabase
      .from('quotations')
      .select('id, lead_id, company_id')
      .in('id', [...quotationIds]);
    for (const q of qs || []) {
      if (q.lead_id) leadIds.add(String(q.lead_id));
    }
  }
  if (eventIds.size) {
    const { data: evs } = await supabase
      .from('crm_events')
      .select('id, lead_id, company_id')
      .in('id', [...eventIds]);
    for (const e of evs || []) {
      if (e.lead_id) leadIds.add(String(e.lead_id));
    }
  }

  const leadCompanyMap = new Map();
  if (leadIds.size) {
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, company_id, project_id, sx_template_company_id')
      .in('id', [...leadIds]);
    for (const l of leads || []) {
      const set = new Set();
      addCompanyId(set, l.company_id);
      addCompanyId(set, l.sx_template_company_id);
      if (l.project_id) projectIds.add(String(l.project_id));
      leadCompanyMap.set(String(l.id), set);
    }
    try {
      const { data: links } = await supabase
        .from('crm_deal_projects')
        .select('deal_id, project_id')
        .in('deal_id', [...leadIds]);
      for (const r of links || []) {
        if (r?.project_id) projectIds.add(String(r.project_id));
      }
    } catch (_) { /* ignore */ }
  }

  const projectCompanyMap = new Map();
  if (projectIds.size) {
    for (const pid of projectIds) {
      const set = new Set();
      await collectProjectRelatedCompanyIds(pid, set);
      projectCompanyMap.set(String(pid), set);
    }
  }

  // Gắn company từ project vào lead map
  if (leadIds.size) {
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, project_id')
      .in('id', [...leadIds]);
    for (const l of leads || []) {
      const set = leadCompanyMap.get(String(l.id)) || new Set();
      const pset = l.project_id ? projectCompanyMap.get(String(l.project_id)) : null;
      if (pset) pset.forEach((c) => set.add(c));
      leadCompanyMap.set(String(l.id), set);
    }
  }

  for (const n of needResolve) {
    const et = String(n.entity_type || '');
    const eid = n.entity_id != null ? String(n.entity_id).trim() : '';
    const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
    const related = new Set();

    if (['lead', 'deal', 'crm_lead', 'crm_deal'].includes(et) && eid) {
      const s = leadCompanyMap.get(eid);
      if (s) s.forEach((c) => related.add(c));
    } else if (et === 'project' && eid) {
      const s = projectCompanyMap.get(eid);
      if (s) s.forEach((c) => related.add(c));
    } else if (meta.lead_id && leadCompanyMap.has(String(meta.lead_id))) {
      leadCompanyMap.get(String(meta.lead_id)).forEach((c) => related.add(c));
    } else if (meta.project_id && projectCompanyMap.has(String(meta.project_id))) {
      projectCompanyMap.get(String(meta.project_id)).forEach((c) => related.add(c));
    }

    if (!related.size) continue;
    if (userCompanyOverlapsRelated(viewerCompanies, related)) out.push(n);
  }

  return out;
}

module.exports = {
  SKIP_COMPANY_SCOPE_TYPES,
  resolveRelatedCompanyIds,
  filterUserIdsByCompanyRelevance,
  notificationRelevantToCompanyViewer,
  filterNotificationsForCompanyViewerAsync,
  relatedIdsFromMetadata,
  isPersonallyInvolved,
};
