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
      const leadId = body.lead_id || await getCrmTaskLeadId(id);
      if (!leadId) return res.status(404).json({ error: 'Không tìm thấy lead cho nhiệm vụ CRM' });
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
    if (source === 'crm_task') return sendMutationResult(res, await deleteCrmLeadTask(req, id));
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
