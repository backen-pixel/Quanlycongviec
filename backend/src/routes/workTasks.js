/**
 * Gateway API /api/work-tasks — tổng hợp nhiệm vụ từ tasks, crm_tasks, crm_assignments.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const {
  resolveCompanyScopeForRequest,
  applyCompanyScopeFilter,
} = require('../helpers/tenantScope');
const { loadOperationalProjectAccess } = require('../helpers/operationalProjectScope');
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
const { mergeDeadlineHistoryIntoUnified } = require('../helpers/crmKanbanDeadlineHistory');
const { enrichUnifiedCrmTasks } = require('../helpers/crmTaskAttachmentCounts');
const {
  DONE_STATUSES,
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

function applyWorkStateGroup(q, stateGroup) {
  if (stateGroup === 'open') return applyOpenOnlyFilter(q);
  if (stateGroup === 'done') return q.in('status', DONE_STATUSES);
  if (stateGroup === 'overdue') {
    return applyOpenOnlyFilter(q)
      .not('deadline', 'is', null)
      .lt('deadline', new Date().toISOString());
  }
  if (stateGroup === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return applyOpenOnlyFilter(q)
      .gte('deadline', start.toISOString())
      .lt('deadline', end.toISOString());
  }
  return q;
}

function resolveWorkScope(req, res, requestedCompanyId) {
  const scope = resolveCompanyScopeForRequest(req, requestedCompanyId);
  if (scope.ok) return scope;
  res.status(scope.code === 'tenant_company_denied' ? 403 : 400).json({
    error: scope.error || 'Không có quyền truy cập',
    code: scope.code,
  });
  return null;
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

// GET /api/work-tasks/summary — KPI + phân bổ theo module
r.get('/summary', async (req, res) => {
  try {
    const {
      assignee_id, company_id, date_from, date_to, lead_id,
      status, task_kind, q, open_only,
    } = req.query;
    const scope = resolveWorkScope(req, res, company_id);
    if (!scope) return;
    const summary = await fetchUnifiedTasksSummary(req.user, {
      assignee_id,
      company_id: scope.companyId || undefined,
      company_ids: scope.companyIds || undefined,
      date_from, date_to, lead_id,
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
    const scope = resolveWorkScope(req, res, company_id);
    if (!scope) return;
    const leads = await fetchLeadOptionsForAssignee(
      assignee_id,
      scope.companyId || null,
      300,
      scope.companyIds || [],
    );
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
      date_from, date_to, company_id, open_only, module_key, lead_id, state_group: stateGroup,
    } = req.query;
    const { page, pageSize, from, to } = parsePagination(req);
    const scope = resolveWorkScope(req, res, company_id);
    if (!scope) return;

    let q = supabase.from('unified_tasks_v').select(TASK_SELECT, { count: 'exact' });

    if (source) {
      const sources = String(source).split(',').map((s) => s.trim()).filter((s) => VALID_SOURCES.has(s));
      if (sources.length === 1) q = q.eq('source', sources[0]);
      else if (sources.length > 1) q = q.in('source', sources);
    }
    if (project_id) q = q.eq('project_id', project_id);
    if (lead_id) {
      q = q.eq('lead_id', lead_id);
    } else if (assignee_id) {
      const assigneeLeadIds = await resolveAssigneeLeadScope(
        assignee_id,
        scope.companyId || null,
        scope.companyIds || [],
      );
      q = applyAssigneeFilter(q, assignee_id, assigneeLeadIds);
    }
    if (status) q = q.eq('status', status);
    if (task_kind) q = q.eq('task_kind', task_kind);
    if (searchQ) q = q.ilike('title', `%${searchQ}%`);
    if (date_from) q = q.gte('deadline', date_from);
    if (date_to) q = q.lte('deadline', date_to);
    if (open_only === '1' || open_only === 'true') q = applyOpenOnlyFilter(q);
    q = applyWorkStateGroup(q, stateGroup);

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

    q = applyCompanyScopeFilter(q, scope);

    if (!isManagerLike(req.user)) {
      q = applyEmployeeScope(q, req.user.userId);
    }

    if (['open', 'overdue', 'today'].includes(stateGroup)) {
      q = q.order('deadline', { ascending: true, nullsFirst: false })
        .order('updated_at', { ascending: false });
    } else {
      q = q.order('updated_at', { ascending: false });
    }
    q = q.range(from, to);
    const { data, error, count } = await q;
    if (error) throw error;

    const tasks = await enrichUnifiedCrmTasks(supabase, data || []);
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
    const scope = resolveWorkScope(req, res, req.query.company_id);
    if (!scope) return;
    const projectAccess = await loadOperationalProjectAccess(projectId, scope);
    if (!projectAccess) return res.status(404).json({ error: 'Không tìm thấy dự án trong phạm vi vận hành' });

    const leadIds = await getLeadIdsForProject(projectId, scope);

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
    const doneStatuses = new Set(DONE_STATUSES);
    const nowMs = Date.now();
    const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };
    const actionRank = (task) => {
      const status = String(task.status || '').toLowerCase();
      if (doneStatuses.has(status)) return 3;
      const deadlineMs = task.deadline ? new Date(task.deadline).getTime() : null;
      if (deadlineMs != null && !Number.isNaN(deadlineMs) && deadlineMs < nowMs) return 0;
      if (deadlineMs != null && !Number.isNaN(deadlineMs)) return 1;
      return 2;
    };
    const data = [...(projectTasks || []), ...crmTasks].filter((t) => {
      if (seen.has(t.unified_id)) return false;
      seen.add(t.unified_id);
      return true;
    }).sort((a, b) => {
      const rankDiff = actionRank(a) - actionRank(b);
      if (rankDiff !== 0) return rankDiff;
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;
      const priorityDiff = (priorityRank[String(a.priority || '').toLowerCase()] ?? 4)
        - (priorityRank[String(b.priority || '').toLowerCase()] ?? 4);
      if (priorityDiff !== 0) return priorityDiff;
      return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
    });

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
    const completed = all.filter((t) => doneStatuses.has(String(t.status || '').toLowerCase())).length;
    const openTasks = all.filter((t) => !doneStatuses.has(String(t.status || '').toLowerCase()));
    const overdue = openTasks.filter((t) => {
      const deadlineMs = t.deadline ? new Date(t.deadline).getTime() : null;
      return deadlineMs != null && !Number.isNaN(deadlineMs) && deadlineMs < nowMs;
    }).length;

    res.json({
      project_id: projectId,
      company_id: projectAccess.company_id,
      logistics_company_id: projectAccess.logistics_company_id,
      scope_company_id: scope.companyId || null,
      groups,
      progress: { completed, open: openTasks.length, overdue, total: all.length },
      next_actions: openTasks.slice(0, 5),
      tasks: all,
    });
  } catch (e) {
    console.error('[work-tasks] by-project:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

async function getLeadIdsForProject(projectId, scope = null) {
  let query = supabase.from('crm_leads').select('id').eq('project_id', projectId);
  if (scope) query = applyCompanyScopeFilter(query, scope);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((l) => l.id);
}

// GET /api/work-tasks/history
r.get('/history', async (req, res) => {
  try {
    const { source, id, project_id, lead_id, assignee_id, company_id, page: _p } = req.query;
    const { page, pageSize, from, to } = parsePagination(req, 50, 500);
    const scope = resolveWorkScope(req, res, company_id);
    if (!scope) return;

    if (lead_id) {
      let leadAccessQuery = supabase.from('crm_leads').select('id').eq('id', lead_id);
      leadAccessQuery = applyCompanyScopeFilter(leadAccessQuery, scope);
      const { data: leadAccess, error: leadAccessError } = await leadAccessQuery.maybeSingle();
      if (leadAccessError) throw leadAccessError;
      if (!leadAccess) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    }

    let q = supabase.from('unified_task_history').select(`
      *,
      actor:users!unified_task_history_actor_user_id_fkey(id, full_name, avatar)
    `, { count: 'exact' }).order('created_at', { ascending: false });
    q = applyCompanyScopeFilter(q, scope);

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
