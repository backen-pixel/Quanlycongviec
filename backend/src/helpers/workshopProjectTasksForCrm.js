const { supabase } = require('../config/supabase');

function mapChecklistRows(rows) {
  return (rows || [])
    .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0))
    .map((c, i) => ({
      id: c.id,
      title: c.title || '',
      description: '',
      notes: c.notes || '',
      done: !!c.is_completed,
      order_index: c.order_index ?? i,
      attachments: Array.isArray(c.attachments) ? c.attachments : [],
    }));
}

function mapWorkshopProjectTaskToCrmTask(task, leadId, projectMeta = {}) {
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const wsSlug = String(meta.guessed_stage_slug || task.stage?.slug || 'delivery');
  const perTaskColId = meta.logistics_pipeline_stage_id || null;
  const vcColId = perTaskColId || null;
  const statusRaw = String(task.status || 'todo');
  const status = statusRaw === 'done' ? 'completed' : statusRaw;

  return {
    id: task.id,
    lead_id: leadId,
    title: task.title,
    description: task.description || null,
    notes: null,
    status,
    priority: task.priority || 'medium',
    order_index: Number(task.order_index) || 0,
    assignee_id: task.assignee_id || null,
    assignee: task.assignee || null,
    stage_slug: vcColId ? `vc_pl_${String(vcColId).slice(0, 8)}` : `vc_ws_${wsSlug}`,
    logistics_pipeline_stage_id: vcColId,
    production_pipeline_stage_id: null,
    pipeline_stage_id: null,
    blocks_stage_advance: !!task.blocks_stage_advance,
    file_note_recorded: !!task.file_note_recorded,
    deadline: task.due_date || null,
    checklist: mapChecklistRows(task.checklists),
    file_count: 0,
    note_count: 0,
    attachment_count: 0,
    _workshop_project_task: true,
    source: 'workshop',
    metadata: meta,
  };
}

/**
 * Nhiệm vụ bảng `tasks` (workshop_area=logistics) → shape crm_tasks cho CRMTasksTab (tab VC/LĐ).
 */
async function loadWorkshopLogisticsTasksForCrmLead(leadId, projectId) {
  if (!leadId || !projectId) return [];

  const { data: project } = await supabase
    .from('projects')
    .select('id, vc_kanban_column_id, logistics_company_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project?.id) return [];

  let { data: rows, error } = await supabase
    .from('tasks')
    .select(`
      id, title, description, status, priority, due_date, order_index, assignee_id, blocks_stage_advance, file_note_recorded, metadata, created_at,
      assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
      stage:workflow_stages(id, name, slug),
      checklists:task_checklists(id, title, is_completed, order_index, notes, attachments)
    `)
    .eq('project_id', projectId)
    .order('order_index')
    .order('created_at');

  if (error && /file_note_recorded/i.test(String(error.message || ''))) {
    ({ data: rows, error } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, due_date, order_index, assignee_id, blocks_stage_advance, metadata, created_at,
        assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug),
        checklists:task_checklists(id, title, is_completed, order_index, notes, attachments)
      `)
      .eq('project_id', projectId)
      .order('order_index')
      .order('created_at'));
  }

  if (error && /task_checklists.*attachments|column.*attachments/i.test(String(error.message || ''))) {
    ({ data: rows, error } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, due_date, order_index, assignee_id, blocks_stage_advance, file_note_recorded, metadata, created_at,
        assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug),
        checklists:task_checklists(id, title, is_completed, order_index, notes)
      `)
      .eq('project_id', projectId)
      .order('order_index')
      .order('created_at'));
  }

  if (error && String(error.message || '').includes('task_checklists')) {
    ({ data: rows, error } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, due_date, order_index, assignee_id, blocks_stage_advance, file_note_recorded, metadata, created_at,
        assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug)
      `)
      .eq('project_id', projectId)
      .order('order_index')
      .order('created_at'));
  }
  if (error) {
    console.warn('[workshopProjectTasksForCrm] tasks:', error.message);
    return [];
  }

  const logistics = (rows || []).filter((t) => {
    const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
    return meta.workshop_area === 'logistics';
  });

  return logistics.map((t) => mapWorkshopProjectTaskToCrmTask(t, leadId, project));
}

function isLogisticsCrmTaskRow(t) {
  const slug = String(t?.stage_slug || '');
  if (slug.startsWith('vc_')) return true;
  const meta = t?.metadata && typeof t.metadata === 'object' ? t.metadata : {};
  return meta.workshop_module === 'logistics' || meta.workshop_area === 'logistics';
}

function matchesOverviewStatus(statusWant, rawStatus) {
  if (!statusWant) return true;
  const want = String(statusWant).toLowerCase();
  const raw = String(rawStatus || '').toLowerCase();
  const mapped = raw === 'done' ? 'completed' : raw === 'todo' ? 'pending' : raw;
  return mapped === want || raw === want;
}

function sortOverviewTasks(rows) {
  return [...(rows || [])].sort((a, b) => {
    const da = a.deadline || a.due_date || '';
    const db = b.deadline || b.due_date || '';
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return String(da).localeCompare(String(db));
  });
}

/**
 * Dự án đã vào module VC (logistics_company_id / vc_kanban_column_id).
 * Khớp listWorkshopPickerProjectIds + chi tiết dự án VC.
 */
async function listLogisticsProjectsForCompany(companyId = null) {
  let projQ = supabase
    .from('projects')
    .select('id, code, name, company_id, logistics_company_id, vc_kanban_column_id')
    .or('logistics_company_id.not.is.null,vc_kanban_column_id.not.is.null')
    .is('vc_deleted_at', null)
    .limit(800);
  if (companyId) {
    projQ = projQ.or(`logistics_company_id.eq.${companyId},company_id.eq.${companyId}`);
  }
  let { data: projects, error: projErr } = await projQ;
  if (projErr && /vc_deleted_at/i.test(String(projErr.message || ''))) {
    let q2 = supabase
      .from('projects')
      .select('id, code, name, company_id, logistics_company_id, vc_kanban_column_id')
      .or('logistics_company_id.not.is.null,vc_kanban_column_id.not.is.null')
      .limit(800);
    if (companyId) q2 = q2.or(`logistics_company_id.eq.${companyId},company_id.eq.${companyId}`);
    ({ data: projects, error: projErr } = await q2);
  }
  if (projErr && /vc_kanban_column_id/i.test(String(projErr.message || ''))) {
    let q3 = supabase
      .from('projects')
      .select('id, code, name, company_id, logistics_company_id')
      .not('logistics_company_id', 'is', null)
      .limit(800);
    if (companyId) q3 = q3.or(`logistics_company_id.eq.${companyId},company_id.eq.${companyId}`);
    ({ data: projects, error: projErr } = await q3);
  }
  if (projErr) {
    console.warn('[logisticsOverview] projects:', projErr.message);
    return [];
  }
  return projects || [];
}

async function loadLeadsForLogisticsProjects(projectIds) {
  if (!projectIds.length) return [];
  const { data: leads, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, title, code, type, project_id, created_at, customer:customers(id, full_name)')
    .in('project_id', projectIds.slice(0, 400))
    .order('created_at', { ascending: false });
  if (leadErr) {
    console.warn('[logisticsOverview] leads:', leadErr.message);
    return [];
  }
  return leads || [];
}

/**
 * Deal chính / dự án — khớp loadCrmDealsForProjectDetail (created_at DESC)
 * rồi ProjectDetail crmDeals[0].
 */
function pickPrimaryLeadPerProject(leads) {
  const byProject = new Map();
  const sorted = [...(leads || [])].sort((a, b) => {
    const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  for (const L of sorted) {
    const pid = L?.project_id ? String(L.project_id) : '';
    if (!pid || !L?.id) continue;
    const prev = byProject.get(pid);
    if (!prev) {
      byProject.set(pid, L);
      continue;
    }
    const prevDeal = String(prev.type || '').toLowerCase() === 'deal';
    const nextDeal = String(L.type || '').toLowerCase() === 'deal';
    // Ưu tiên deal; trong cùng loại giữ bản mới hơn (đã sort DESC nên prev thắng).
    if (nextDeal && !prevDeal) byProject.set(pid, L);
  }
  return byProject;
}

/**
 * crm_tasks vc_* trên deal gắn dự án VC — khớp GET /crm/leads/:id/tasks?task_scope=logistics.
 * Không lọc lead.company_id (deal thường thuộc công ty Sale, không phải VC).
 */
async function loadCrmVcTasksForLogisticsOverview(opts = {}) {
  const {
    companyId = null,
    assigneeId = null,
    status = null,
    userId = null,
    companyWide = false,
  } = opts;

  const projectList = await listLogisticsProjectsForCompany(companyId);
  if (!projectList.length) return [];
  const projectIds = projectList.map((p) => p.id).filter(Boolean);
  const leads = await loadLeadsForLogisticsProjects(projectIds);
  if (!leads.length) return [];

  const primaryByProject = pickPrimaryLeadPerProject(leads);
  const primaryLeads = [...primaryByProject.values()];
  const leadById = new Map(primaryLeads.map((L) => [String(L.id), L]));
  const leadIds = primaryLeads.map((L) => L.id).filter(Boolean);
  if (!leadIds.length) return [];

  let taskQ = supabase
    .from('crm_tasks')
    .select(`
      *,
      assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar),
      supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)
    `)
    .in('lead_id', leadIds.slice(0, 400))
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(2000);
  if (assigneeId) taskQ = taskQ.eq('assignee_id', assigneeId);
  else if (!companyWide && userId) taskQ = taskQ.eq('assignee_id', userId);
  if (status) taskQ = taskQ.eq('status', status);

  const { data: taskRows, error: taskErr } = await taskQ;
  if (taskErr) {
    console.warn('[logisticsOverview] crm_tasks:', taskErr.message);
    return [];
  }

  const out = [];
  for (const t of taskRows || []) {
    if (!isLogisticsCrmTaskRow(t)) continue;
    if (!matchesOverviewStatus(status, t.status)) continue;
    const lead = leadById.get(String(t.lead_id || ''));
    if (!lead?.id) continue;
    out.push({
      ...t,
      lead_id: lead.id,
      lead: {
        id: lead.id,
        title: lead.title,
        code: lead.code,
        type: lead.type,
        project_id: lead.project_id,
        customer: lead.customer || null,
      },
    });
  }
  return out;
}

/**
 * Nhiệm vụ workshop logistics cho GET /crm/tasks/overview (inbox VC).
 * Gắn lead từ crm_leads.project_id; lọc theo công ty / assignee giống overview.
 */
async function loadWorkshopLogisticsTasksForOverview(opts = {}) {
  const {
    companyId = null,
    assigneeId = null,
    status = null,
    userId = null,
    companyWide = false,
  } = opts;

  const projectList = await listLogisticsProjectsForCompany(companyId);
  if (!projectList.length) return [];
  const projectIds = projectList.map((p) => p.id).filter(Boolean);
  const projectById = new Map(projectList.map((p) => [String(p.id), p]));

  const leads = await loadLeadsForLogisticsProjects(projectIds);
  const primaryByProject = pickPrimaryLeadPerProject(leads);
  const leadByProject = primaryByProject;

  const TASK_SELECT = `
    id, title, description, status, priority, due_date, order_index, assignee_id, project_id, blocks_stage_advance, file_note_recorded, metadata, created_at,
    assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
    stage:workflow_stages(id, name, slug)
  `;
  let taskQ = supabase
    .from('tasks')
    .select(TASK_SELECT)
    .in('project_id', projectIds.slice(0, 400))
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(2000);
  if (assigneeId) taskQ = taskQ.eq('assignee_id', assigneeId);
  else if (!companyWide && userId) taskQ = taskQ.eq('assignee_id', userId);

  let { data: taskRows, error: taskErr } = await taskQ;
  if (taskErr && /file_note_recorded/i.test(String(taskErr.message || ''))) {
    let q2 = supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, due_date, order_index, assignee_id, project_id, blocks_stage_advance, metadata, created_at,
        assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug)
      `)
      .in('project_id', projectIds.slice(0, 400))
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(2000);
    if (assigneeId) q2 = q2.eq('assignee_id', assigneeId);
    else if (!companyWide && userId) q2 = q2.eq('assignee_id', userId);
    ({ data: taskRows, error: taskErr } = await q2);
  }
  if (taskErr) {
    console.warn('[workshopOverview] tasks:', taskErr.message);
    return [];
  }

  const out = [];
  for (const t of taskRows || []) {
    const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
    if (meta.workshop_area !== 'logistics') continue;
    if (!matchesOverviewStatus(status, t.status)) continue;
    const pid = t.project_id ? String(t.project_id) : '';
    const lead = leadByProject.get(pid);
    if (!lead?.id) continue;
    const mapped = mapWorkshopProjectTaskToCrmTask(t, lead.id, projectById.get(pid) || {});
    mapped.lead = {
      id: lead.id,
      title: lead.title,
      code: lead.code,
      type: lead.type,
      project_id: lead.project_id,
      customer: lead.customer || null,
    };
    mapped.lead_id = lead.id;
    out.push(mapped);
  }
  return out;
}

/**
 * Inbox VC đầy đủ = crm_tasks vc_* trên deal chính dự án + workshop logistics.
 * Merge theo từng dự án giống GET /crm/leads/:id/tasks?task_scope=logistics
 * rồi filterVcLogisticsUiTasks (mobile chi tiết).
 * Assignee lọc SAU merge để không đổi nhánh hasNativeVc (khớp số việc khi «Tất cả NV»).
 */
async function loadLogisticsTasksForOverview(opts = {}) {
  const {
    assigneeId = null,
    userId = null,
    companyWide = false,
  } = opts;

  // Load đủ task deal/workshop trước — không cắt theo assignee ở SQL.
  const loadOpts = {
    ...opts,
    assigneeId: null,
    companyWide: true,
  };
  const [crmRows, wsRows] = await Promise.all([
    loadCrmVcTasksForLogisticsOverview(loadOpts),
    loadWorkshopLogisticsTasksForOverview(loadOpts),
  ]);

  const crmByProject = new Map();
  for (const row of crmRows) {
    const pid = row?.lead?.project_id ? String(row.lead.project_id) : '';
    if (!pid) continue;
    if (!crmByProject.has(pid)) crmByProject.set(pid, []);
    crmByProject.get(pid).push(row);
  }
  const wsByProject = new Map();
  for (const row of wsRows) {
    const pid = row?.lead?.project_id ? String(row.lead.project_id) : '';
    if (!pid) continue;
    if (!wsByProject.has(pid)) wsByProject.set(pid, []);
    wsByProject.get(pid).push(row);
  }

  const projectIds = new Set([...crmByProject.keys(), ...wsByProject.keys()]);
  let out = [];
  const seen = new Set();
  for (const pid of projectIds) {
    const crm = crmByProject.get(pid) || [];
    const ws = wsByProject.get(pid) || [];
    // Khớp crmTasks.js logistics + filterVcLogisticsUiTasks:
    // có native vc_* → crm vc + workshop; không → chỉ workshop (không fallback CRM sales).
    const nativeVc = crm.filter((t) => String(t.stage_slug || '').startsWith('vc_')
      || t.source === 'workshop'
      || t._workshop_project_task);
    const hasNativeVc = nativeVc.some((t) => String(t.stage_slug || '').startsWith('vc_'));
    const merged = hasNativeVc
      ? [...nativeVc.filter((t) => !t._workshop_project_task), ...ws]
      : ws;
    for (const row of merged) {
      const id = String(row?.id || '');
      if (!id || seen.has(id)) continue;
      // Chỉ vc_* / workshop — khớp filterVcLogisticsUiTasks trên mobile.
      const slug = String(row.stage_slug || '');
      const isWs = row._workshop_project_task === true || row.source === 'workshop';
      if (!isWs && !slug.startsWith('vc_')) continue;
      seen.add(id);
      out.push(row);
    }
  }

  const wantAssignee = assigneeId
    || (!companyWide && userId ? String(userId) : null);
  if (wantAssignee) {
    out = out.filter((t) => {
      if (String(t.assignee_id || '') === String(wantAssignee)) return true;
      const multi = Array.isArray(t.assignees) ? t.assignees : [];
      return multi.some((a) => String(a?.id || '') === String(wantAssignee));
    });
  }

  return sortOverviewTasks(out);
}

module.exports = {
  loadWorkshopLogisticsTasksForCrmLead,
  loadWorkshopLogisticsTasksForOverview,
  loadCrmVcTasksForLogisticsOverview,
  loadLogisticsTasksForOverview,
  mapWorkshopProjectTaskToCrmTask,
};
