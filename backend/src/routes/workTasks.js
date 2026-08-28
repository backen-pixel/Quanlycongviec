/**
 * Gateway API /api/work-tasks — tổng hợp nhiệm vụ từ tasks, crm_tasks, crm_assignments.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isSystemAdmin } = require('../helpers/adminRole');
const {
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  addProjectTaskComment,
  toggleProjectTaskChecklist,
} = require('../helpers/projectTaskMutations');
const {
  createCrmLeadTask,
  updateCrmLeadTask,
  deleteCrmLeadTask,
  getCrmTaskLeadId,
} = require('../helpers/crmLeadTaskMutations');
const {
  createCrmAssignment,
  updateCrmAssignment,
  deleteCrmAssignment,
  addCrmAssignmentComment,
} = require('../helpers/crmAssignmentMutations');
const {
  assertCrmTaskLeadAccess,
  loadLeadForTaskAccess,
} = require('../helpers/crmTaskLeadAccess');
const { createNotification } = require('../helpers/notifications');
const { mergeDeadlineHistoryIntoUnified } = require('../helpers/crmKanbanDeadlineHistory');
const { enrichUnifiedCrmTasks } = require('../helpers/crmTaskAttachmentCounts');
const {
  isManagerLike,
  applyEmployeeScope,
  applyOpenOnlyFilter,
  applyAssigneeFilter,
  fetchLeadOptionsForAssignee,
  resolveAssigneeLeadScope,
  fetchUnifiedTasksSummary,
} = require('../helpers/unifiedTasksQuery');

const r = Router();
r.use(auth);

const VALID_SOURCES = new Set(['task', 'crm_task', 'crm_assignment']);

/** Chuẩn hóa status trước khi ghi DB — tránh CHECK constraint / enum lỗi. */
function normalizeWorkTaskPatchStatus(source, status) {
  const s = String(status || 'pending').toLowerCase();
  if (source === 'crm_task' || source === 'crm_assignment') {
    if (s === 'done') return 'completed';
    if (s === 'review' || s === 'blocked') return 'in_progress';
    if (['pending', 'in_progress', 'completed', 'cancelled'].includes(s)) return s;
    return 'pending';
  }
  if (source === 'task') {
    if (s === 'completed') return 'done';
    if (['pending', 'in_progress', 'review', 'blocked', 'done', 'cancelled'].includes(s)) return s;
    return 'pending';
  }
  return s;
}

function parsePagination(req, defaultSize = 50, maxSize = 500) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const requested = parseInt(req.query.page_size || req.query.limit, 10) || defaultSize;
  const pageSize = Math.max(1, Math.min(maxSize, requested));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}

/** Gate quyền lead trước mutation crm_task — cùng chuẩn với /api/crm/leads/:id/tasks*. */
async function gateCrmTaskLeadAccess(req, leadId, taskId = null, operation = 'READ') {
  const lead = await loadLeadForTaskAccess(supabase, leadId);
  if (!lead) return { ok: false, error: 'Không tìm thấy lead/deal', status: 404 };
  return assertCrmTaskLeadAccess(supabase, req, lead, { taskId, operation });
}

function sendMutationResult(res, result) {
  if (result.error) {
    const payload = { error: result.error };
    if (result.code) payload.code = result.code;
    return res.status(result.status || 400).json(payload);
  }
  return res.status(result.status || 200).json(result.data);
}

const TASK_SELECT = `
  unified_id, source, source_id, project_id, lead_id, company_id,
  title, description, status, priority, assignee_id, deadline,
  completed_at, created_by_id, created_at, updated_at, task_kind,
  project_code, project_name, lead_title
`;

const DONE_REMIND_STATUSES = new Set(['done', 'completed', 'cancelled']);

const REMIND_GROUPS = new Set(['deal', 'sx', 'vc']);

/** Khối tiến độ: sales (Deal) | production (xưởng) | logistics (VC-LĐ). Không trộn người nhận. */
function taskOwnerLane(task) {
  const kind = String(task?.task_kind || '');
  if (kind === 'SX' || kind === 'Dự án') return 'production';
  if (kind === 'VC') return 'logistics';
  if (kind === 'CRM-Deal' || kind === 'CRM-Lead' || kind === 'Giao việc') return 'sales';
  if (task?.source === 'crm_task' || task?.source === 'crm_assignment') return 'sales';
  return 'production';
}

function laneToGroup(lane) {
  if (lane === 'sales') return 'deal';
  if (lane === 'logistics') return 'vc';
  return 'sx';
}

function taskMatchesRemindGroup(task, group) {
  const k = String(task?.task_kind || '');
  if (group === 'deal') return k === 'CRM-Deal' || k === 'CRM-Lead' || k === 'Giao việc';
  if (group === 'sx') return k === 'SX' || k === 'Dự án';
  if (group === 'vc') return k === 'VC';
  return false;
}

function remindNavUrl(task) {
  const group = laneToGroup(taskOwnerLane(task));
  if (task?.project_id) {
    return `/management/work-unified/${task.project_id}?tab=tasks&group=${group}`;
  }
  if (task?.source === 'crm_task' && task?.lead_id) return `/crm/leads/${task.lead_id}?tab=tasks`;
  if (task?.source === 'crm_assignment' && task?.source_id) return `/crm/assignments?focus=${task.source_id}`;
  return '/management/work-unified?tab=tasks';
}

function remindModuleKey(task) {
  const lane = taskOwnerLane(task);
  if (lane === 'production') return 'production';
  if (lane === 'logistics') return 'logistics';
  return 'crm';
}

function remindGroupLabel(group) {
  if (group === 'deal') return 'Sales';
  if (group === 'sx') return 'xưởng';
  if (group === 'vc') return 'VC-LĐ';
  return 'công việc';
}

/** Sales → sales/deal; SX → xưởng; VC → VC. Không broadcast chéo khối. */
async function resolveCompleteReminderTargets(task) {
  if (task?.assignee_id) return [task.assignee_id];

  const lane = taskOwnerLane(task);
  const ids = [];
  if (task?.project_id) {
    const { data: p } = await supabase
      .from('projects')
      .select('project_manager_id, sales_person_id, designer_id, production_person_id, logistics_person_id, installer_person_id, installation_person_id')
      .eq('id', task.project_id)
      .maybeSingle();
    if (lane === 'production') {
      ids.push(p?.production_person_id, p?.project_manager_id);
    } else if (lane === 'logistics') {
      ids.push(p?.logistics_person_id, p?.installer_person_id, p?.installation_person_id, p?.production_person_id);
    } else {
      ids.push(p?.sales_person_id, p?.designer_id);
    }
  }
  if (lane === 'sales' && !ids.filter(Boolean).length && task?.lead_id) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('assigned_to, lead_owner_id')
      .eq('id', task.lead_id)
      .maybeSingle();
    ids.push(lead?.assigned_to, lead?.lead_owner_id);
  }
  return [...new Set(ids.filter(Boolean))];
}

async function sendCompleteReminderToUsers(req, {
  targets, actorId, title, message, entityType, entityId, meta,
}) {
  const uids = [...new Set((targets || []).map(String))]
    .filter((uid) => uid && uid !== String(actorId || ''));
  let sent = 0;
  for (const uid of uids) {
    const n = await createNotification(
      req, uid, 'task_complete_reminder', title, message, entityType, entityId, meta,
    );
    if (n) sent += 1;
  }
  return { sent, recipient_count: uids.length, recipients: uids };
}

// GET /api/work-tasks/summary — KPI + phân bổ theo module
r.get('/summary', async (req, res) => {
  try {
    const {
      assignee_id, company_id, date_from, date_to, lead_id,
      status, task_kind, q, open_only,
    } = req.query;
    const summary = await fetchUnifiedTasksSummary(req.user, {
      assignee_id, company_id, date_from, date_to, lead_id,
      status, task_kind, q, open_only,
    });
    res.json(summary);
  } catch (e) {
    console.error('[work-tasks] summary:', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng hợp' });
  }
});

// GET /api/work-tasks/lead-options — lead/deal theo NV phụ trách (dropdown lọc)
r.get('/lead-options', async (req, res) => {
  try {
    const { assignee_id, company_id } = req.query;
    if (!assignee_id) return res.json({ leads: [] });
    const effectiveCompany = company_id || (!isSystemAdmin(req.user) ? req.user?.company_id : null);
    const leads = await fetchLeadOptionsForAssignee(assignee_id, effectiveCompany || null);
    res.json({ leads });
  } catch (e) {
    console.error('[work-tasks] lead-options:', e);
    res.status(500).json({ error: e.message || 'Lỗi tải lead/deal' });
  }
});

// GET /api/work-tasks
r.get('/', async (req, res) => {
  try {
    const {
      source, project_id, assignee_id, status, q: searchQ, task_kind,
      date_from, date_to, company_id, open_only, module_key, lead_id,
    } = req.query;
    const { page, pageSize, from, to } = parsePagination(req);

    let q = supabase.from('unified_tasks_v').select(TASK_SELECT, { count: 'exact' })
      .order('updated_at', { ascending: false });

    if (source) {
      const sources = String(source).split(',').map((s) => s.trim()).filter((s) => VALID_SOURCES.has(s));
      if (sources.length === 1) q = q.eq('source', sources[0]);
      else if (sources.length > 1) q = q.in('source', sources);
    }
    if (project_id) q = q.eq('project_id', project_id);
    const effectiveCompany = company_id || (!isSystemAdmin(req.user) ? req.user?.company_id : null);
    if (lead_id) {
      q = q.eq('lead_id', lead_id);
    } else if (assignee_id) {
      const assigneeLeadIds = await resolveAssigneeLeadScope(assignee_id, effectiveCompany || null);
      q = applyAssigneeFilter(q, assignee_id, assigneeLeadIds);
    }
    if (status) q = q.eq('status', status);
    if (task_kind) q = q.eq('task_kind', task_kind);
    if (searchQ) q = q.ilike('title', `%${searchQ}%`);
    if (date_from) q = q.gte('deadline', date_from);
    if (date_to) q = q.lte('deadline', date_to);
    if (open_only === '1' || open_only === 'true') q = applyOpenOnlyFilter(q);

    const MODULE_KIND_FILTER = {
      crm: ['CRM-Deal', 'CRM-Lead'],
      production: ['SX', 'Dự án'],
      logistics: ['VC'],
      assignment: ['Giao việc'],
      personal: ['Cá nhân'],
    };
    if (module_key && MODULE_KIND_FILTER[module_key]) {
      q = q.in('task_kind', MODULE_KIND_FILTER[module_key]);
    }

    if (effectiveCompany) q = q.eq('company_id', effectiveCompany);

    if (!isManagerLike(req.user)) {
      q = applyEmployeeScope(q, req.user.userId);
    }

    q = q.range(from, to);
    const { data, error, count } = await q;
    if (error) throw error;

    const tasks = await enrichUnifiedCrmTasks(supabase, data || []);
    const assigneeIds = [...new Set(tasks.map((t) => t.assignee_id).filter(Boolean))];
    if (assigneeIds.length) {
      const { data: users } = await supabase.from('users').select('id, full_name').in('id', assigneeIds);
      const nameById = Object.fromEntries((users || []).map((u) => [String(u.id), u.full_name]));
      for (const t of tasks) {
        t.assignee_name = t.assignee_id ? (nameById[String(t.assignee_id)] || null) : null;
      }
    }
    res.json({ tasks, total: count ?? tasks.length ?? 0, page, page_size: pageSize });
  } catch (e) {
    console.error('[work-tasks] list:', e);
    res.status(500).json({ error: e.message || 'Lỗi tải danh sách' });
  }
});

// GET /api/work-tasks/by-project/:projectId
r.get('/by-project/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const leadIds = await getLeadIdsForProject(projectId);

    let qProject = supabase.from('unified_tasks_v').select(TASK_SELECT).eq('project_id', projectId);
    if (!isManagerLike(req.user)) qProject = applyEmployeeScope(qProject, req.user.userId);
    const { data: projectTasks, error: e1 } = await qProject;
    if (e1) throw e1;

    let crmTasks = [];
    if (leadIds.length) {
      let qCrm = supabase.from('unified_tasks_v').select(TASK_SELECT).in('lead_id', leadIds);
      if (!isManagerLike(req.user)) qCrm = applyEmployeeScope(qCrm, req.user.userId);
      const { data: ct, error: e2 } = await qCrm;
      if (e2) throw e2;
      crmTasks = ct || [];
    }

    const seen = new Set();
    const data = [...(projectTasks || []), ...crmTasks].filter((t) => {
      if (seen.has(t.unified_id)) return false;
      seen.add(t.unified_id);
      return true;
    }).sort((a, b) => String(a.task_kind).localeCompare(String(b.task_kind)));

    const groups = {
      crm_deal: [],
      production: [],
      logistics: [],
      assignment: [],
      other: [],
    };
    (data || []).forEach((t) => {
      if (t.source === 'crm_task' || t.task_kind === 'CRM-Deal' || t.task_kind === 'CRM-Lead') {
        groups.crm_deal.push(t);
      } else if (t.task_kind === 'SX' || t.task_kind === 'Dự án') {
        groups.production.push(t);
      } else if (t.task_kind === 'VC') {
        groups.logistics.push(t);
      } else if (t.source === 'crm_assignment' || t.task_kind === 'Giao việc') {
        groups.assignment.push(t);
      } else {
        groups.other.push(t);
      }
    });

    const all = data || [];
    const doneStatuses = new Set(['done', 'completed', 'cancelled']);
    const completed = all.filter((t) => doneStatuses.has(t.status)).length;

    res.json({
      project_id: projectId,
      groups,
      progress: { completed, total: all.length },
      tasks: all,
    });
  } catch (e) {
    console.error('[work-tasks] by-project:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

async function getLeadIdsForProject(projectId) {
  const { data } = await supabase.from('crm_leads').select('id').eq('project_id', projectId);
  return (data || []).map((l) => l.id);
}

// GET /api/work-tasks/history
r.get('/history', async (req, res) => {
  try {
    const { source, id, project_id, lead_id, assignee_id, page: _p } = req.query;
    const { page, pageSize, from, to } = parsePagination(req, 50, 500);

    let q = supabase.from('unified_task_history').select(`
      *,
      actor:users!unified_task_history_actor_user_id_fkey(id, full_name, avatar)
    `, { count: 'exact' }).order('created_at', { ascending: false });

    if (source && id) {
      q = q.eq('source', source).eq('source_id', String(id));
    } else if (project_id) {
      q = q.eq('project_id', project_id);
    } else if (lead_id) {
      q = q.eq('lead_id', lead_id);
    } else {
      return res.status(400).json({ error: 'Cần source+id hoặc project_id hoặc lead_id' });
    }

    if (assignee_id && !isManagerLike(req.user)) {
      // nhân viên chỉ xem lịch sử NV mình — filter qua subquery tasks
      if (String(assignee_id) !== String(req.user.userId)) {
        return res.status(403).json({ error: 'Không có quyền' });
      }
    }

    let history;
    let total;
    if (lead_id) {
      const { data: rows, error: eLead } = await q.limit(150);
      if (eLead) throw eLead;
      let merged = rows || [];
      try {
        const { data: dlRows } = await supabase
          .from('crm_lead_deadline_history')
          .select(`
            id, old_deadline_at, new_deadline_at, reason, source, created_at,
            changer:users!crm_lead_deadline_history_changed_by_fkey(id, full_name, avatar)
          `)
          .eq('lead_id', lead_id)
          .order('created_at', { ascending: false })
          .limit(100);
        merged = mergeDeadlineHistoryIntoUnified(merged, dlRows || [], lead_id);
      } catch (dlErr) {
        console.warn('[work-tasks] merge deadline history:', dlErr.message);
      }
      total = merged.length;
      history = merged.slice(from, to + 1);
    } else {
      q = q.range(from, to);
      const { data, error, count } = await q;
      if (error) throw error;
      history = data || [];
      total = count ?? history.length;
    }

    res.json({ history, total, page, page_size: pageSize });
  } catch (e) {
    console.error('[work-tasks] history:', e);
    res.status(500).json({ error: e.message || 'Lỗi tải lịch sử' });
  }
});

// POST /api/work-tasks — tạo mới
r.post('/', async (req, res) => {
  try {
    const { source, lead_id, ...payload } = req.body || {};
    if (!VALID_SOURCES.has(source)) {
      return res.status(400).json({ error: 'source phải là task | crm_task | crm_assignment' });
    }

    if (source === 'task') {
      if (!payload.title) return res.status(400).json({ error: 'Cần title' });
      return sendMutationResult(res, await createProjectTask(req, payload));
    }
    if (source === 'crm_task') {
      if (!lead_id) return res.status(400).json({ error: 'crm_task cần lead_id' });
      if (!payload.title) return res.status(400).json({ error: 'Cần title' });
      const gate = await gateCrmTaskLeadAccess(req, lead_id, null, 'CREATE');
      if (!gate.ok) return res.status(gate.status || 403).json({ error: gate.error });
      const result = await createCrmLeadTask(req, lead_id, payload);
      if (result.error) return sendMutationResult(res, result);
      return res.status(result.status).json(result.data);
    }
    if (source === 'crm_assignment') {
      return sendMutationResult(res, await createCrmAssignment(req, payload));
    }
    return res.status(400).json({ error: 'source không hợp lệ' });
  } catch (e) {
    console.error('[work-tasks] create:', e);
    res.status(500).json({ error: e.message || 'Lỗi tạo nhiệm vụ' });
  }
});

// PATCH /api/work-tasks/:source/:id
r.patch('/:source/:id', async (req, res) => {
  try {
    const { source, id } = req.params;
    if (!VALID_SOURCES.has(source)) return res.status(400).json({ error: 'source không hợp lệ' });

    const body = { ...req.body };
    if (body.status !== undefined) {
      body.status = normalizeWorkTaskPatchStatus(source, body.status);
    }

    if (source === 'task') {
      return sendMutationResult(res, await updateProjectTask(req, id, body));
    }
    if (source === 'crm_task') {
      // Lấy lead từ DB trước — tránh spoof body.lead_id để vượt gate quyền
      const leadId = await getCrmTaskLeadId(id) || body.lead_id;
      if (!leadId) return res.status(404).json({ error: 'Không tìm thấy lead cho nhiệm vụ CRM' });
      const gate = await gateCrmTaskLeadAccess(req, leadId, id, 'UPDATE');
      if (!gate.ok) return res.status(gate.status || 403).json({ error: gate.error });
      const result = await updateCrmLeadTask(req, leadId, id, body);
      if (result.error) return sendMutationResult(res, result);
      return res.status(result.status).json(result.data);
    }
    if (source === 'crm_assignment') {
      return sendMutationResult(res, await updateCrmAssignment(req, id, body));
    }
    return res.status(400).json({ error: 'source không hợp lệ' });
  } catch (e) {
    console.error('[work-tasks] patch:', e);
    res.status(500).json({ error: e.message || 'Lỗi cập nhật' });
  }
});

// DELETE /api/work-tasks/:source/:id
r.delete('/:source/:id', async (req, res) => {
  try {
    const { source, id } = req.params;
    if (source === 'task') return sendMutationResult(res, await deleteProjectTask(req, id));
    if (source === 'crm_task') {
      const leadId = await getCrmTaskLeadId(id);
      if (!leadId) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ CRM' });
      const gate = await gateCrmTaskLeadAccess(req, leadId, id, 'DELETE');
      if (!gate.ok) return res.status(gate.status || 403).json({ error: gate.error });
      return sendMutationResult(res, await deleteCrmLeadTask(req, id));
    }
    if (source === 'crm_assignment') return sendMutationResult(res, await deleteCrmAssignment(req, id));
    return res.status(400).json({ error: 'source không hợp lệ' });
  } catch (e) {
    console.error('[work-tasks] delete:', e);
    res.status(500).json({ error: e.message || 'Lỗi xóa' });
  }
});

function buildCompleteReminderMeta(task, extra = {}) {
  const moduleKey = remindModuleKey(task);
  return {
    kind: 'task_complete_reminder',
    unified_id: task.unified_id,
    source: task.source,
    source_id: task.source_id,
    project_id: task.project_id || null,
    lead_id: task.lead_id || null,
    company_id: task.company_id || null,
    module_key: moduleKey,
    ecosystem_module_key: moduleKey,
    nav_tab: 'tasks',
    nav_url: remindNavUrl(task),
    owner_lane: taskOwnerLane(task),
    ...extra,
  };
}

function remindEntityType(source) {
  if (source === 'crm_task') return 'crm_task';
  if (source === 'crm_assignment') return 'crm_assignment';
  return 'task';
}

// POST /api/work-tasks/by-project/:projectId/remind-complete — nhắc cả khối Deal/SX/VC
r.post('/by-project/:projectId/remind-complete', async (req, res) => {
  try {
    if (!isManagerLike(req.user)) {
      return res.status(403).json({ error: 'Chỉ quản lý mới gửi được nhắc hoàn thành' });
    }
    const projectId = req.params.projectId;
    const group = String(req.body?.group || '').trim();
    if (!REMIND_GROUPS.has(group)) {
      return res.status(400).json({ error: 'group phải là deal | sx | vc' });
    }

    const { data: project, error: pe } = await supabase
      .from('projects')
      .select('id, code, name, company_id')
      .eq('id', projectId)
      .maybeSingle();
    if (pe) throw pe;
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    if (!isSystemAdmin(req.user) && req.user?.company_id && project.company_id
      && String(project.company_id) !== String(req.user.company_id)) {
      return res.status(403).json({ error: 'Không có quyền nhắc công việc công ty khác' });
    }

    const leadIds = await getLeadIdsForProject(projectId);
    let qProject = supabase.from('unified_tasks_v').select(TASK_SELECT).eq('project_id', projectId);
    const { data: projectTasks, error: e1 } = await qProject;
    if (e1) throw e1;
    let crmTasks = [];
    if (leadIds.length) {
      const { data: ct, error: e2 } = await supabase
        .from('unified_tasks_v')
        .select(TASK_SELECT)
        .in('lead_id', leadIds);
      if (e2) throw e2;
      crmTasks = ct || [];
    }
    const seen = new Set();
    const openTasks = [...(projectTasks || []), ...crmTasks].filter((t) => {
      if (!t?.unified_id || seen.has(t.unified_id)) return false;
      seen.add(t.unified_id);
      if (!taskMatchesRemindGroup(t, group)) return false;
      return !DONE_REMIND_STATUSES.has(String(t.status || '').toLowerCase());
    });
    if (!openTasks.length) {
      return res.status(400).json({ error: 'Khối này không còn việc mở để nhắc' });
    }

    const actorId = String(req.user.userId || req.user.id || '');
    const actorName = req.user.full_name || req.user.email || 'Quản lý';
    const byUser = new Map();
    for (const task of openTasks) {
      const targets = await resolveCompleteReminderTargets(task);
      for (const uid of targets.map(String).filter((id) => id && id !== actorId)) {
        if (!byUser.has(uid)) byUser.set(uid, []);
        byUser.get(uid).push(task);
      }
    }
    if (!byUser.size) {
      return res.status(400).json({
        error: 'Không có người nhận. Gán nhân viên cho việc, hoặc gán người phụ trách Sales / xưởng.',
      });
    }

    const groupLabel = remindGroupLabel(group);
    const sample = openTasks[0];
    const moduleKey = group === 'deal' ? 'crm' : (group === 'vc' ? 'logistics' : 'production');
    const titles = openTasks.slice(0, 4).map((t) => t.title).filter(Boolean);
    const extra = openTasks.length > 4 ? ` và ${openTasks.length - 4} việc khác` : '';
    const title = `Nhắc hoàn thành — ${groupLabel}`;
    const message = `${actorName} nhắc hoàn thành phần ${groupLabel} trên ${project.code || 'dự án'}: ${openTasks.length} việc còn mở (${titles.join(', ')}${extra}). Nộp bản vẽ / render / bảng mô tả trong Công việc, không đưa vào Bình luận.`;
    const meta = {
      kind: 'task_complete_reminder',
      project_id: projectId,
      company_id: project.company_id || null,
      module_key: moduleKey,
      ecosystem_module_key: moduleKey,
      nav_tab: 'tasks',
      nav_url: `/management/work-unified/${projectId}?tab=tasks&group=${group}`,
      owner_lane: group === 'deal' ? 'sales' : (group === 'vc' ? 'logistics' : 'production'),
      remind_group: group,
      open_count: openTasks.length,
    };

    const result = await sendCompleteReminderToUsers(req, {
      targets: [...byUser.keys()],
      actorId,
      title,
      message,
      entityType: remindEntityType(sample?.source),
      entityId: sample?.source_id || projectId,
      meta,
    });
    res.json({
      ok: true,
      sent: result.sent,
      recipient_count: result.recipient_count,
      open_count: openTasks.length,
      group,
    });
  } catch (e) {
    console.error('[work-tasks] group remind-complete:', e);
    res.status(500).json({ error: e.message || 'Không gửi được nhắc' });
  }
});

// POST /api/work-tasks/:source/:id/remind-complete — quản lý nhắc NV hoàn thành việc
r.post('/:source/:id/remind-complete', async (req, res) => {
  try {
    if (!isManagerLike(req.user)) {
      return res.status(403).json({ error: 'Chỉ quản lý mới gửi được nhắc hoàn thành' });
    }
    const { source, id } = req.params;
    if (!VALID_SOURCES.has(source)) return res.status(400).json({ error: 'source không hợp lệ' });

    const { data: rows, error: te } = await supabase
      .from('unified_tasks_v')
      .select(TASK_SELECT)
      .eq('source', source)
      .eq('source_id', String(id))
      .limit(1);
    if (te) throw te;
    const task = (rows || [])[0];
    if (!task) return res.status(404).json({ error: 'Không tìm thấy công việc' });

    if (!isSystemAdmin(req.user) && req.user?.company_id && task.company_id
      && String(task.company_id) !== String(req.user.company_id)) {
      return res.status(403).json({ error: 'Không có quyền nhắc công việc công ty khác' });
    }

    if (DONE_REMIND_STATUSES.has(String(task.status || '').toLowerCase())) {
      return res.status(400).json({ error: 'Công việc đã kết thúc — không cần nhắc hoàn thành' });
    }

    const actorId = String(req.user.userId || req.user.id || '');
    const targets = await resolveCompleteReminderTargets(task);
    if (!targets.filter((uid) => String(uid) !== actorId).length) {
      return res.status(400).json({
        error: 'Không có người nhận. Gán nhân viên cho việc, hoặc gán người phụ trách Sales / xưởng.',
      });
    }

    const actorName = req.user.full_name || req.user.email || 'Quản lý';
    const lane = taskOwnerLane(task);
    const laneLabel = lane === 'sales' ? 'Sales' : (lane === 'logistics' ? 'VC-LĐ' : 'xưởng');
    const label = [task.project_code, task.title].filter(Boolean).join(' · ');
    const title = `Nhắc hoàn thành — ${laneLabel}`;
    const message = `${actorName} nhắc ${laneLabel} hoàn thành: ${label || 'công việc'}. Nộp file tiến trình (bản vẽ, render, bảng mô tả) trong Công việc.`;
    const result = await sendCompleteReminderToUsers(req, {
      targets,
      actorId,
      title,
      message,
      entityType: remindEntityType(source),
      entityId: task.source_id,
      meta: buildCompleteReminderMeta(task),
    });
    if (!result.recipient_count) {
      return res.status(400).json({
        error: 'Không có người nhận. Gán nhân viên cho việc, hoặc gán người phụ trách Sales / xưởng.',
      });
    }

    res.json({ ok: true, sent: result.sent, recipient_count: result.recipient_count, owner_lane: lane });
  } catch (e) {
    console.error('[work-tasks] remind-complete:', e);
    res.status(500).json({ error: e.message || 'Không gửi được nhắc' });
  }
});

// POST /api/work-tasks/:source/:id/comment
r.post('/:source/:id/comment', async (req, res) => {
  try {
    const { source, id } = req.params;
    if (source === 'task') return sendMutationResult(res, await addProjectTaskComment(req, id, req.body));
    if (source === 'crm_assignment') return sendMutationResult(res, await addCrmAssignmentComment(req, id, req.body));
    return res.status(400).json({ error: 'Comment chỉ hỗ trợ task và crm_assignment' });
  } catch (e) {
    console.error('[work-tasks] comment:', e);
    res.status(500).json({ error: e.message || 'Lỗi bình luận' });
  }
});

// POST /api/work-tasks/task/:id/checklists/:cid/toggle
r.post('/task/:id/checklists/:cid/toggle', async (req, res) => {
  try {
    return sendMutationResult(res, await toggleProjectTaskChecklist(req, req.params.id, req.params.cid, req.body));
  } catch (e) {
    console.error('[work-tasks] checklist toggle:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

module.exports = r;
