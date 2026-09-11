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
  applyPrimaryLeadOnly,
  fetchLeadOptionsForAssignee,
  resolveAssigneeLeadScope,
  fetchUnifiedTasksSummary,
} = require('../helpers/unifiedTasksQuery');
const { fetchAllByIds, fetchAllByIdsParallel, fetchAllPages } = require('../helpers/supabaseFetchAll');
const { resolveWorkRegionScope, taskMatchesRegionScope } = require('../helpers/workRegionFilter');
const {
  projectOverviewCategoryId,
  projectOverviewSharedCategoryTitle,
  firstVisibleOwnerId,
  isHiddenOverviewOwner,
  productionOwnerCandidateIds,
} = require('../helpers/projectOverviewCategory');
const { assertProjectAccessible } = require('../helpers/projectAccessScope');
const {
  isCrmCompletedStage,
  isLogisticsCompletedColumn,
} = require('../helpers/completeOpenWorkOnModuleDone');

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
const PROJECT_OVERVIEW_TASK_SELECT = `
  unified_id, source, source_id, project_id, lead_id, company_id,
  title, status, assignee_id, deadline, task_kind,
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

/**
 * Bổ sung người phụ trách cấp module cho task theo lô.
 * assignee_* luôn là người được giao thật; effective_assignee_* chỉ fallback khi task chưa gán.
 */
async function enrichTaskModuleOwners(rows, {
  projects: providedProjects = null,
  leads: providedLeads = null,
  productionStaff: providedProductionStaff = null,
} = {}) {
  const tasks = rows || [];
  if (!tasks.length) return tasks;

  const projectIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean).map(String))];
  const leadIds = [...new Set(tasks.map((t) => t.lead_id).filter(Boolean).map(String))];
  const [projects, leads, productionStaff] = await Promise.all([
    providedProjects
      ? Promise.resolve(providedProjects)
      : projectIds.length
      ? fetchAllByIdsParallel({
        table: 'projects',
        columns: `
          id, company_id, project_manager_id, sales_person_id, responsible_person_id,
          production_person_id, logistics_person_id, installer_person_id, installation_person_id
        `,
        key: 'id',
        ids: projectIds,
        tune: (q) => q.order('id'),
      })
      : Promise.resolve([]),
    providedLeads
      ? Promise.resolve(providedLeads)
      : leadIds.length
      ? fetchAllByIdsParallel({
        table: 'crm_leads',
        columns: 'id, assigned_to, lead_owner_id, project_id, company_id, region_id',
        key: 'id',
        ids: leadIds,
        tune: (q) => q.order('id'),
      })
      : Promise.resolve([]),
    // Nhân sự SX chỉ phụ thuộc danh sách dự án — chỗ gọi biết trước thì nạp sẵn và
    // truyền vào, để lượt đọc này chạy song song với lượt đọc nhiệm vụ thay vì nối tiếp.
    providedProductionStaff
      ? Promise.resolve(providedProductionStaff)
      : projectIds.length
      ? fetchAllByIdsParallel({
        table: 'project_production_staff',
        columns: 'project_id, user_id, is_primary, order_index',
        key: 'project_id',
        ids: projectIds,
        tune: (q) => q.order('project_id').order('order_index').order('user_id'),
      })
      : Promise.resolve([]),
  ]);

  const projectById = new Map((projects || []).map((p) => [String(p.id), p]));
  const leadById = new Map((leads || []).map((l) => [String(l.id), l]));
  const companyIds = [...new Set((projects || []).map((p) => p.company_id).filter(Boolean).map(String))];
  const handoverRows = companyIds.length
    ? await fetchAllByIdsParallel({
      table: 'production_handover_settings',
      columns: 'production_company_id, responsible_user_id',
      key: 'production_company_id',
      ids: companyIds,
      tune: (q) => q.order('production_company_id'),
    })
    : [];
  const handoverByCompany = new Map(
    (handoverRows || [])
      .filter((row) => row.responsible_user_id)
      .map((row) => [String(row.production_company_id), String(row.responsible_user_id)]),
  );
  const userIds = new Set();
  const addUserId = (id) => {
    if (id) userIds.add(String(id));
  };
  handoverByCompany.forEach((id) => addUserId(id));
  (projects || []).forEach((project) => {
    addUserId(project.production_person_id);
    addUserId(project.logistics_person_id);
    addUserId(project.installer_person_id);
    addUserId(project.installation_person_id);
    addUserId(project.project_manager_id);
    addUserId(project.responsible_person_id);
    addUserId(project.sales_person_id);
  });
  (leads || []).forEach((lead) => {
    addUserId(lead.assigned_to);
    addUserId(lead.lead_owner_id);
  });
  (productionStaff || []).forEach((row) => addUserId(row.user_id));
  for (const task of tasks) addUserId(task.assignee_id);

  const users = userIds.size
    ? await fetchAllByIdsParallel({
      table: 'users',
      columns: 'id, full_name, role, company_id',
      key: 'id',
      ids: [...userIds],
      tune: (q) => q.order('id'),
    })
    : [];
  const userById = new Map((users || []).map((u) => [String(u.id), u]));
  const nameById = new Map((users || []).map((u) => [String(u.id), u.full_name]));
  const pickOwner = (...ids) => firstVisibleOwnerId(ids, userById);

  const productionStaffByProject = new Map();
  (productionStaff || [])
    .slice()
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || (a.order_index || 0) - (b.order_index || 0))
    .forEach((row) => {
      const key = String(row.project_id);
      if (productionStaffByProject.has(key)) return;
      const visibleId = pickOwner(row.user_id);
      if (visibleId) productionStaffByProject.set(key, visibleId);
    });
  const ownerIdFor = (task) => {
    const lead = task.lead_id ? leadById.get(String(task.lead_id)) : null;
    const project = projectById.get(String(task.project_id || lead?.project_id || '')) || null;
    const lane = taskOwnerLane(task);
    if (lane === 'production') {
      return pickOwner(...productionOwnerCandidateIds(
        project,
        productionStaffByProject.get(String(project?.id || '')),
        handoverByCompany,
      ));
    }
    if (lane === 'logistics') {
      return pickOwner(
        project?.logistics_person_id,
        project?.installer_person_id,
        project?.installation_person_id,
        project?.production_person_id,
        productionStaffByProject.get(String(project?.id || '')),
      );
    }
    return pickOwner(
      project?.project_manager_id,
      project?.sales_person_id,
      project?.responsible_person_id,
      lead?.assigned_to,
      lead?.lead_owner_id,
    );
  };

  for (const task of tasks) {
    const ownerId = ownerIdFor(task);
    const assigneeId = task.assignee_id ? String(task.assignee_id) : null;
    const lead = task.lead_id ? leadById.get(String(task.lead_id)) : null;
    const assigneeUser = assigneeId ? userById.get(assigneeId) : null;
    const visibleAssigneeId = assigneeId && !isHiddenOverviewOwner(assigneeUser) ? assigneeId : null;
    task.assignee_name = assigneeId ? (nameById.get(assigneeId) || null) : null;
    task.module_owner_id = ownerId;
    task.module_owner_name = ownerId ? (nameById.get(String(ownerId)) || null) : null;
    task.effective_assignee_id = visibleAssigneeId || ownerId || null;
    task.effective_assignee_name = visibleAssigneeId
      ? (nameById.get(visibleAssigneeId) || null)
      : (task.module_owner_name || null);
    task.region_id = lead?.region_id || null;
  }
  return tasks;
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

function foldTaskStageName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

function isProductionTaskTerminalStage(stage) {
  if (!stage) return false;
  if (stage.is_handover_to_logistics || stage.counts_as_completed_revenue || stage.counts_as_collected_revenue) {
    return true;
  }
  const slug = String(stage.bucket_slug || '').toLowerCase().trim();
  if (['delivered', 'completed', 'done', 'collected'].includes(slug)) return true;
  const name = foldTaskStageName(stage.name);
  return name.includes('da giao hang') || name === 'da giao'
    || name.startsWith('hoan thanh') || name.startsWith('da thu');
}

// GET /api/work-tasks/project-overview — toàn bộ NV mở của các dự án chưa kết thúc theo từng module
/**
 * Phần đuôi dùng chung của /project-overview: gắn tên công ty/khu vực, sắp xếp,
 * tính thống kê rồi trả JSON. Dùng chung cho cả đường RPC gộp lẫn đường cũ nên hai
 * đường chắc chắn cho cùng một hình dạng kết quả.
 */
/**
 * @param {{companies: object[], regions: object[]}|null} preloaded Hai bảng này rất nhỏ
 *   nên chỗ gọi nạp trọn từ đầu; ở đây chỉ lọc lại đúng những dòng có xuất hiện, giữ
 *   nguyên thứ tự theo id như khi đọc theo id.
 */
async function finishProjectOverview(res, tasks, preloaded = null) {
  const companyIds = [...new Set(tasks.map((task) => task.company_id).filter(Boolean).map(String))];
  const regionIds = [...new Set(tasks.map((task) => task.region_id).filter(Boolean).map(String))];
  const [companies, regions] = preloaded ? [
    (preloaded.companies || []).filter((row) => companyIds.includes(String(row.id))),
    (preloaded.regions || []).filter((row) => regionIds.includes(String(row.id))),
  ] : await Promise.all([
    companyIds.length
      ? fetchAllByIdsParallel({
        table: 'companies',
        columns: 'id, name, short_name',
        key: 'id',
        ids: companyIds,
        tune: (q) => q.order('id'),
      })
      : Promise.resolve([]),
    regionIds.length
      ? fetchAllByIdsParallel({
        table: 'company_regions',
        columns: 'id, company_id, name, code',
        key: 'id',
        ids: regionIds,
        tune: (q) => q.order('id'),
      })
      : Promise.resolve([]),
  ]);
  const companyById = new Map(companies.map((row) => [String(row.id), row]));
  const regionById = new Map(regions.map((row) => [String(row.id), row]));
  tasks.forEach((task) => {
    const company = companyById.get(String(task.company_id || ''));
    const region = regionById.get(String(task.region_id || ''));
    task.company_name = company?.short_name || company?.name || null;
    task.region_name = region?.name || null;
  });
  tasks.sort((a, b) => (
    String(a.deadline || '9999-12-31').localeCompare(String(b.deadline || '9999-12-31'))
    || (a.category_order || 999) - (b.category_order || 999)
    // Hoà cả hai khoá trên thì trước đây thứ tự phụ thuộc thứ tự nạp (chia khúc id),
    // nên mỗi lần mỗi khác. Chốt bằng unified_id để cả hai đường và mọi lần chạy
    // đều cho cùng một thứ tự.
    || String(a.unified_id).localeCompare(String(b.unified_id))
  ));

  const nowMs = Date.now();
  const warningMs = nowMs + 3 * 24 * 60 * 60 * 1000;
  const stats = {
    total: tasks.length,
    overdue: 0,
    warning: 0,
    by_module: { crm: 0, sx: 0, vc: 0 },
  };
  tasks.forEach((task) => {
    const lane = taskOwnerLane(task);
    if (lane === 'sales') stats.by_module.crm += 1;
    else if (lane === 'logistics') stats.by_module.vc += 1;
    else stats.by_module.sx += 1;
    const deadlineMs = task.deadline ? new Date(task.deadline).getTime() : null;
    if (deadlineMs != null && Number.isFinite(deadlineMs)) {
      if (deadlineMs < nowMs) stats.overdue += 1;
      else if (deadlineMs <= warningMs) stats.warning += 1;
    }
  });
  return res.json({
    tasks,
    stats,
    filter_options: {
      companies,
      regions,
    },
  });
}

r.get('/project-overview', async (req, res) => {
  try {
    const requestedCompany = String(req.query.company_id || '').trim();
    const effectiveCompany = isSystemAdmin(req.user)
      ? (requestedCompany || null)
      : (req.user?.company_id || null);
    const requestedModule = ['crm', 'sx', 'vc'].includes(String(req.query.module || '').toLowerCase())
      ? String(req.query.module).toLowerCase()
      : '';
    /**
     * Bốn bảng tra cứu này rất nhỏ (222 + 97 + 9 + 12 = 340 dòng) nhưng trước đây được
     * đọc ở CUỐI đường tới hạn, sau khi đã gom đủ id — đo được ~400ms chỉ để chờ. Nạp
     * trọn ngay từ đầu, song song với projects: cùng dữ liệu, chỉ khác thời điểm.
     */
    const lookupsPromise = Promise.all([
      fetchAllPages(() => supabase.from('crm_pipeline_stages').select('id, name, order_index').order('id')),
      fetchAllPages(() => supabase.from('workshop_task_templates').select('id, name, workshop_area, order_index').order('id')),
      fetchAllPages(() => supabase.from('companies').select('id, name, short_name').order('id')),
      fetchAllPages(() => supabase.from('company_regions').select('id, company_id, name, code').order('id')),
    ]);

    const projects = await fetchAllPages(() => {
      let q = supabase
        .from('projects')
        .select(`
          id, status, company_id, sx_kanban_column_id, vc_kanban_column_id,
          project_manager_id, sales_person_id, responsible_person_id,
          production_person_id, logistics_person_id, installer_person_id, installation_person_id
        `)
        .order('id');
      if (effectiveCompany) q = q.eq('company_id', effectiveCompany);
      return q;
    });
    const activeProjects = (projects || []).filter((project) => (
      !['completed', 'cancelled', 'canceled'].includes(String(project.status || '').toLowerCase())
    ));
    const projectIds = activeProjects.map((project) => project.id).filter(Boolean);

    const needsCrmLeads = !requestedModule || requestedModule === 'crm';
    const needsSxStages = requestedModule !== 'vc';
    const needsVcStages = !requestedModule || requestedModule === 'vc';
    const [sxStagesRes, vcStagesRes, leads] = await Promise.all([
      needsSxStages
        ? supabase.from('production_pipeline_stages').select(
          'id, name, order_index, bucket_slug, is_handover_to_logistics, counts_as_completed_revenue, counts_as_collected_revenue',
        )
        : Promise.resolve({ data: [], error: null }),
      needsVcStages
        ? supabase.from('logistics_pipeline_stages').select('id, name, order_index, bucket_slug')
        : Promise.resolve({ data: [], error: null }),
      needsCrmLeads && projectIds.length
        ? fetchAllByIdsParallel({
          table: 'crm_leads',
          columns: `
            id, project_id, company_id, region_id, assigned_to, lead_owner_id,
            stage:crm_pipeline_stages!crm_leads_stage_id_fkey(
              id, name, canonical_slug, is_won, is_lost, counts_as_completed_revenue
            )
          `,
          key: 'project_id',
          ids: projectIds,
          tune: (q) => q.order('id'),
        })
        : Promise.resolve([]),
    ]);

    // Nhân sự SX chỉ cần danh sách dự án — cho chạy ngay, song song với RPC gộp,
    // thay vì chờ RPC trả về rồi mới đọc (đo được ~500ms nằm thẳng trên đường tới hạn).
    const staffPromiseEarly = projectIds.length
      ? fetchAllByIdsParallel({
        table: 'project_production_staff',
        columns: 'project_id, user_id, is_primary, order_index',
        key: 'project_id',
        ids: projectIds,
        tune: (q) => q.order('project_id').order('order_index').order('user_id'),
        /**
         * 50 dự án/khúc — chọn theo mật độ ĐO ĐƯỢC 12,3 dòng/dự án, tức ~615 dòng/khúc,
         * gọn trong một trang 1.000 nên KHÔNG phải phân trang lần nào.
         * Với khúc 500 mặc định: ~6.150 dòng = 7 trang lồng nhau chờ nhau theo lô, tốn
         * 17 truy vấn qua 3–4 đợt. Nay còn 14 truy vấn nhỏ trong một đợt.
         * Đừng nâng lên 100: 100×12,3 = 1.230, vừa TRÀN trang 1.000 nên mỗi khúc lại bắn
         * thêm một lô 5 trang mà 4 trong số đó rỗng — đo được 183 truy vấn, chậm hơn cả cũ.
         */
        idChunk: 50,
        chunkConcurrency: 16,
      })
      : Promise.resolve([]);

    if (sxStagesRes.error) throw sxStagesRes.error;
    if (vcStagesRes.error) throw vcStagesRes.error;

    const sxStageById = new Map((sxStagesRes.data || []).map((stage) => [String(stage.id), stage]));
    const vcStageById = new Map((vcStagesRes.data || []).map((stage) => [String(stage.id), stage]));
    const productionProjectIds = activeProjects
      .filter((project) => !isProductionTaskTerminalStage(sxStageById.get(String(project.sx_kanban_column_id || ''))))
      .map((project) => project.id);
    const logisticsProjectIds = activeProjects
      .filter((project) => !isLogisticsCompletedColumn(vcStageById.get(String(project.vc_kanban_column_id || ''))))
      .map((project) => project.id);
    const activeLeadIds = (leads || [])
      .filter((lead) => !lead.stage?.is_won && !lead.stage?.is_lost && !isCrmCompletedStage(lead.stage))
      .map((lead) => lead.id);

    const tuneTaskQuery = (q, { kinds, leadScoped = false } = {}) => {
      q = applyPrimaryLeadOnly(q, leadScoped);
      if (kinds?.length) q = q.in('task_kind', kinds);
      if (effectiveCompany) q = q.eq('company_id', effectiveCompany);
      if (!isManagerLike(req.user)) q = applyEmployeeScope(q, req.user.userId);
      return q.order('unified_id');
    };
    // Nhân sự SX chỉ cần danh sách dự án — đã biết từ trước lượt đọc nhiệm vụ. Trước đây
    // chờ có nhiệm vụ rồi mới đọc (đo được 1,1s nằm thẳng trên đường tới hạn); nay đọc
    // cùng lúc. Lấy theo TOÀN BỘ dự án đang hoạt động thay vì theo dự án suy ra từ nhiệm
    // vụ — đo thực tế cùng cỡ (6.163 so với 6.304 dòng) nên không tốn thêm.
    const crmTasksPromise = (!requestedModule || requestedModule === 'crm') && activeLeadIds.length
        ? fetchAllByIdsParallel({
          table: 'unified_tasks_v',
          columns: PROJECT_OVERVIEW_TASK_SELECT,
          key: 'lead_id',
          ids: activeLeadIds,
          tune: (q) => tuneTaskQuery(q.eq('source', 'crm_task'), { leadScoped: true }),
          // 11,8 dòng/lead đo được → 50 lead/khúc ≈ 590 dòng, vừa một trang. Xem chú thích
          // dài ở lượt đọc nhân sự SX bên trên về vì sao KHÔNG nên nâng số này.
          idChunk: 50,
          chunkConcurrency: 16,
          // Một khúc lead có thể ra >6.000 nhiệm vụ = 11 trang. Với lô 5 trang mặc định
          // phải chờ 3 đợt nối tiếp; lô 12 gộp còn 2 đợt (đổi lấy vài truy vấn rỗng ở cuối).
          pageBatchSize: 12,
        })
      : Promise.resolve([]);

    const productionTasksPromise = (!requestedModule || requestedModule === 'sx') && productionProjectIds.length
        ? fetchAllByIdsParallel({
          table: 'unified_tasks_v',
          columns: PROJECT_OVERVIEW_TASK_SELECT,
          key: 'project_id',
          ids: productionProjectIds,
          tune: (q) => tuneTaskQuery(q.eq('source', 'task'), { kinds: ['SX', 'Dự án'] }),
          // 30,1 dòng/dự án đo được → 25 dự án/khúc ≈ 750 dòng, vừa một trang.
          idChunk: 25,
          chunkConcurrency: 16,
        })
      : Promise.resolve([]);

    const logisticsTasksPromise = (!requestedModule || requestedModule === 'vc') && logisticsProjectIds.length
        ? fetchAllByIdsParallel({
          table: 'unified_tasks_v',
          columns: PROJECT_OVERVIEW_TASK_SELECT,
          key: 'project_id',
          ids: logisticsProjectIds,
          tune: (q) => tuneTaskQuery(q.eq('source', 'task'), { kinds: ['VC'] }),
          // 30,1 dòng/dự án đo được → 25 dự án/khúc ≈ 750 dòng, vừa một trang.
          idChunk: 25,
          chunkConcurrency: 16,
        })
      : Promise.resolve([]);

    // Dùng lại lượt đọc đã khởi động ở trên — không đọc lần hai.
    const productionStaffPromise = staffPromiseEarly;

    /**
     * Chi tiết nhiệm vụ (để suy ra hạng mục) chỉ cần id của chính nhóm nhiệm vụ đó, nên
     * bắt đầu đọc NGAY KHI nguồn tương ứng xong thay vì chờ cả ba nguồn.
     * Phạm vi id giữ nguyên như cũ — vẫn lấy từ nhiệm vụ thật, không mở rộng theo dự án —
     * nên kết quả không đổi, chỉ khác thời điểm bắt đầu.
     */
    const projectTaskDetailsPromise = Promise.all([productionTasksPromise, logisticsTasksPromise])
      .then(([sxRows, vcRows]) => {
        const ids = [...sxRows, ...vcRows].map((t) => t.source_id).filter(Boolean);
        return ids.length
          ? fetchAllByIdsParallel({
            table: 'tasks',
            columns: 'id, metadata, production_stage_id, stage_id',
            key: 'id',
            ids,
            tune: (q) => q.order('id'),
            // Đọc THEO ID: mỗi lô tối đa ID_CHUNK dòng nên không bao giờ phải phân trang,
            // mỗi lô đúng một truy vấn nhỏ. Chạy nhiều lô cùng lúc gộp 4 đợt nối tiếp thành 1.
            chunkConcurrency: 16,
          })
          : [];
      });
    const crmTaskDetailsPromise = crmTasksPromise.then((rows) => {
      const ids = rows.map((t) => t.source_id).filter(Boolean);
      return ids.length
        ? fetchAllByIdsParallel({
          table: 'crm_tasks',
          columns: 'id, stage_slug, pipeline_stage_id, production_pipeline_stage_id',
          key: 'id',
          ids,
          tune: (q) => q.order('id'),
          chunkConcurrency: 16,
        })
        : [];
    });

    const [crmTasks, productionTasks, logisticsTasks, productionStaffRows] = await Promise.all([
      crmTasksPromise, productionTasksPromise, logisticsTasksPromise, productionStaffPromise,
    ]);

    const merged = new Map();
    [...crmTasks, ...productionTasks, ...logisticsTasks].forEach((task) => {
      if (task?.unified_id && !merged.has(String(task.unified_id))) merged.set(String(task.unified_id), task);
    });
    /**
     * Sắp theo unified_id trước khi gom nhóm — nhóm lấy nhiệm vụ ĐẦU TIÊN làm đại diện
     * (source_id, lead_id, lead_title hiển thị trên thẻ), nên thứ tự ở đây quyết định
     * người dùng nhìn thấy gì.
     *
     * Trước đây thứ tự là thứ tự các khúc id trả về nối lại: mỗi khúc được sắp riêng rồi
     * ghép, nên đại diện của nhóm phụ thuộc vào BIÊN CHIA KHÚC — một chi tiết kỹ thuật
     * bên trong. Đổi cỡ khúc là 6 nhóm đổi nhiệm vụ đại diện (đã đo). Sắp toàn cục ở đây
     * làm kết quả không còn phụ thuộc cỡ khúc: đã kiểm chứng khúc 50 và khúc 500 cho ra
     * JSON giống hệt nhau.
     */
    const childTasks = [...merged.values()]
      .sort((a, b) => String(a.unified_id).localeCompare(String(b.unified_id)));
    await enrichTaskModuleOwners(childTasks, {
      projects: activeProjects,
      leads: needsCrmLeads ? leads : null,
      productionStaff: productionStaffRows,
    });

    // Đã bắt đầu đọc từ lúc từng nguồn nhiệm vụ xong (xem trên) — ở đây chỉ chờ kết quả.
    const [projectTaskDetails, crmTaskDetails] = await Promise.all([
      projectTaskDetailsPromise, crmTaskDetailsPromise,
    ]);
    const projectDetailById = new Map(projectTaskDetails.map((row) => [String(row.id), row]));
    const crmDetailById = new Map(crmTaskDetails.map((row) => [String(row.id), row]));
    // Đã nạp từ đầu (lookupsPromise) — ở đây chỉ chờ. Map tra theo id nên có dư dòng
    // cũng không sao: chỉ những id thật sự xuất hiện mới được tra.
    const [allCrmStages, allWorkshopTemplates, allCompanies, allRegions] = await lookupsPromise;
    const workshopTemplateById = new Map(allWorkshopTemplates.map((row) => [String(row.id), row]));
    const crmTaskStageById = new Map(allCrmStages.map((row) => [String(row.id), row]));
    const terminalStatuses = new Set(['done', 'completed', 'cancelled', 'canceled']);
    const humanizeSlug = (value) => {
      const text = String(value || '').replace(/^vc_ws_/, '').replace(/^sx_/, '').replace(/[-_]+/g, ' ').trim();
      return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
    };
    const categoryFor = (task) => {
      if (task.source === 'crm_task') {
        const detail = crmDetailById.get(String(task.source_id)) || {};
        const sharedTitle = projectOverviewSharedCategoryTitle(detail);
        const crmStage = crmTaskStageById.get(String(detail.pipeline_stage_id || ''));
        const sxStage = sxStageById.get(String(detail.production_pipeline_stage_id || ''));
        const categoryId = projectOverviewCategoryId(task, projectDetailById, crmDetailById);
        return {
          id: String(categoryId),
          title: sharedTitle || crmStage?.name || sxStage?.name || humanizeSlug(detail.stage_slug) || 'Nhiệm vụ CRM',
          order: sharedTitle ? 40 : (crmStage?.order_index ?? sxStage?.order_index ?? 999),
        };
      }
      const detail = projectDetailById.get(String(task.source_id)) || {};
      const meta = detail.metadata && typeof detail.metadata === 'object' ? detail.metadata : {};
      const template = workshopTemplateById.get(String(meta.workshop_template_id || ''));
      const productionStage = sxStageById.get(String(detail.production_stage_id || ''));
      const logisticsStage = vcStageById.get(String(meta.logistics_pipeline_stage_id || ''));
      const categoryId = projectOverviewCategoryId(task, projectDetailById, crmDetailById);
      return {
        id: String(categoryId),
        title: template?.name || productionStage?.name || logisticsStage?.name
          || humanizeSlug(meta.guessed_stage_slug) || 'Nhiệm vụ dự án',
        order: template?.order_index ?? productionStage?.order_index ?? logisticsStage?.order_index ?? 999,
      };
    };

    const groupMap = new Map();
    childTasks.forEach((task) => {
      const category = categoryFor(task);
      const ownerKey = task.project_id || task.lead_id || 'none';
      const lane = taskOwnerLane(task);
      const groupKey = `${lane}:${ownerKey}:${category.id}`;
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, { key: groupKey, category, lane, children: [] });
      }
      groupMap.get(groupKey).children.push(task);
    });

    const tasks = [...groupMap.values()].map((group) => {
      const completedChildren = group.children.filter((task) => terminalStatuses.has(String(task.status || '').toLowerCase()));
      const openChildren = group.children.filter((task) => !terminalStatuses.has(String(task.status || '').toLowerCase()));
      if (!openChildren.length) return null;
      const first = openChildren[0] || group.children[0];
      const assigned = openChildren.find((task) => task.effective_assignee_id) || null;
      const deadlines = openChildren
        .map((task) => task.deadline)
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return {
        unified_id: `group:${group.key}`,
        source: first.source,
        source_id: first.source_id,
        project_id: first.project_id,
        lead_id: first.lead_id,
        company_id: first.company_id || null,
        region_id: first.region_id || null,
        task_kind: first.task_kind,
        title: group.category.title,
        category_id: group.category.id,
        owner_lane: group.lane,
        category_order: group.category.order,
        project_code: first.project_code,
        project_name: first.project_name,
        lead_title: first.lead_title,
        deadline: deadlines[0] || null,
        child_completed: completedChildren.length,
        child_total: group.children.length,
        assignee_id: assigned?.effective_assignee_id || null,
        assignee_name: assigned?.effective_assignee_name || null,
        module_owner_id: first.module_owner_id || null,
        module_owner_name: first.module_owner_name || null,
        effective_assignee_id: assigned?.effective_assignee_id || first.module_owner_id || null,
        effective_assignee_name: assigned?.effective_assignee_name || first.module_owner_name || null,
      };
    }).filter(Boolean);
    return finishProjectOverview(res, tasks, { companies: allCompanies, regions: allRegions });
  } catch (e) {
    console.error('[work-tasks] project-overview:', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng quan nhiệm vụ dự án' });
  }
});

// GET /api/work-tasks/project-overview-summary — số liệu chính xác cho trang tổng quan NV dự án
r.get('/project-overview-summary', async (req, res) => {
  try {
    const now = new Date();
    const warningTo = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const moduleKinds = {
      crm: ['CRM-Deal', 'CRM-Lead', 'Giao việc'],
      sx: ['SX', 'Dự án'],
      vc: ['VC'],
    };
    const allKinds = [...moduleKinds.crm, ...moduleKinds.sx, ...moduleKinds.vc];
    const countTasks = async ({ kinds = allKinds, risk = '' } = {}) => {
      let q = supabase.from('unified_tasks_v').select('unified_id', { count: 'exact', head: true });
      q = applyPrimaryLeadOnly(q, false);
      q = applyOpenOnlyFilter(q);
      q = q.in('task_kind', kinds);
      if (!isSystemAdmin(req.user) && req.user?.company_id) q = q.eq('company_id', req.user.company_id);
      if (!isManagerLike(req.user)) q = applyEmployeeScope(q, req.user.userId);
      if (risk === 'overdue') q = q.lt('deadline', now.toISOString());
      if (risk === 'warning') q = q.gte('deadline', now.toISOString()).lte('deadline', warningTo.toISOString());
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    };

    const [total, warning, overdue, crm, sx, vc] = await Promise.all([
      countTasks(),
      countTasks({ risk: 'warning' }),
      countTasks({ risk: 'overdue' }),
      countTasks({ kinds: moduleKinds.crm }),
      countTasks({ kinds: moduleKinds.sx }),
      countTasks({ kinds: moduleKinds.vc }),
    ]);
    res.json({ total, open: total, warning, overdue, by_module: { crm, sx, vc } });
  } catch (e) {
    console.error('[work-tasks] project-overview-summary:', e);
    res.status(500).json({ error: e.message || 'Lỗi tải thống kê nhiệm vụ dự án' });
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
      region_id: regionIdRaw,
    } = req.query;
    const { page, pageSize, from, to } = parsePagination(req);

    const regionScope = await resolveWorkRegionScope(regionIdRaw, {
      ok: true,
      companyId: company_id || (!isSystemAdmin(req.user) ? req.user?.company_id : null) || null,
      companyIds: company_id
        ? [company_id]
        : (!isSystemAdmin(req.user) && req.user?.company_id ? [req.user.company_id] : null),
    });

    if (regionScope && !regionScope.none && !regionScope.leadIds.length && !regionScope.projectIds.length) {
      return res.json({ tasks: [], total: 0, page, page_size: pageSize });
    }

    // opts.leadScoped = true khi đường gọi đã bám theo lead (region lead ids) —
    // khi đó KHÔNG lọc is_primary_lead, nếu không task của lead thứ 2 biến mất.
    const applyListFilters = (q, opts = {}) => {
      if (source) {
        const sources = String(source).split(',').map((s) => s.trim()).filter((s) => VALID_SOURCES.has(s));
        if (sources.length === 1) q = q.eq('source', sources[0]);
        else if (sources.length > 1) q = q.in('source', sources);
      }
      if (project_id) q = q.eq('project_id', project_id);
      const effectiveCompany = company_id || (!isSystemAdmin(req.user) ? req.user?.company_id : null);
      let leadScoped = !!opts.leadScoped;
      if (lead_id) {
        q = q.eq('lead_id', lead_id);
        leadScoped = true;
      } else if (assignee_id) {
        q = applyAssigneeFilter(q, assignee_id, assigneeLeadIds);
        if (assigneeLeadIds.length) leadScoped = true;
      }
      q = applyPrimaryLeadOnly(q, leadScoped);
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
      return q;
    };

    let assigneeLeadIds = [];
    if (!lead_id && assignee_id) {
      const effectiveCompany = company_id || (!isSystemAdmin(req.user) ? req.user?.company_id : null);
      assigneeLeadIds = await resolveAssigneeLeadScope(assignee_id, effectiveCompany || null);
    }

    let data;
    let count;
    if (regionScope && !regionScope.none) {
      const seen = new Map();
      const merge = (rows) => {
        for (const t of rows || []) {
          if (t?.unified_id && !seen.has(String(t.unified_id))) seen.set(String(t.unified_id), t);
        }
      };
      if (regionScope.leadIds.length) {
        merge(await fetchAllByIds({
          table: 'unified_tasks_v',
          columns: TASK_SELECT,
          key: 'lead_id',
          ids: regionScope.leadIds,
          tune: (q) => applyListFilters(q, { leadScoped: true }),
        }));
      }
      if (regionScope.projectIds.length) {
        merge(await fetchAllByIds({
          table: 'unified_tasks_v',
          columns: TASK_SELECT,
          key: 'project_id',
          ids: regionScope.projectIds,
          tune: (q) => applyListFilters(q),
        }));
      }
      const merged = [...seen.values()].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      count = merged.length;
      data = merged.slice(from, to + 1);
    } else if (regionScope?.none) {
      const { data: rows, error: noneErr } = await applyListFilters(
        supabase.from('unified_tasks_v').select(TASK_SELECT).order('updated_at', { ascending: false }),
      ).range(0, 499);
      if (noneErr) throw noneErr;
      const filtered = (rows || []).filter((t) => taskMatchesRegionScope(t, regionScope));
      count = filtered.length;
      data = filtered.slice(from, to + 1);
    } else {
      let q = applyListFilters(
        supabase.from('unified_tasks_v').select(TASK_SELECT, { count: 'exact' })
          .order('updated_at', { ascending: false }),
      );
      q = q.range(from, to);
      const result = await q;
      if (result.error) throw result.error;
      data = result.data;
      count = result.count;
    }

    const tasks = await enrichUnifiedCrmTasks(supabase, data || []);
    await enrichTaskModuleOwners(tasks);
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
    const access = await assertProjectAccessible(req, res, projectId, { operation: 'READ', mode: 'company' });
    if (!access) return;
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
    await enrichTaskModuleOwners(data);

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
      module_owners: {
        crm: data.find((t) => taskOwnerLane(t) === 'sales')?.module_owner_name || null,
        production: data.find((t) => taskOwnerLane(t) === 'production')?.module_owner_name || null,
        logistics: data.find((t) => taskOwnerLane(t) === 'logistics')?.module_owner_name || null,
      },
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

// POST /api/work-tasks/project-overview/remind-complete — nhắc một danh mục nhiệm vụ lớn
r.post('/project-overview/remind-complete', async (req, res) => {
  try {
    if (!isManagerLike(req.user)) {
      return res.status(403).json({ error: 'Chỉ quản lý mới gửi được nhắc hoàn thành' });
    }
    const projectId = String(req.body?.project_id || '').trim();
    const categoryId = String(req.body?.category_id || '').trim();
    const lane = String(req.body?.owner_lane || '').trim();
    const source = lane === 'sales' ? 'crm_task' : 'task';
    const categoryTitle = String(req.body?.title || 'Nhiệm vụ dự án').trim().slice(0, 160);
    if (!projectId || !categoryId || !['sales', 'production', 'logistics'].includes(lane)) {
      return res.status(400).json({ error: 'Thiếu dự án hoặc danh mục nhiệm vụ cần nhắc' });
    }
    const access = await assertProjectAccessible(req, res, projectId, { operation: 'WRITE', mode: 'company' });
    if (!access) return;

    const kinds = lane === 'sales'
      ? ['CRM-Deal', 'CRM-Lead', 'Giao việc']
      : lane === 'logistics' ? ['VC'] : ['SX', 'Dự án'];
    const candidateTasks = await fetchAllByIdsParallel({
      table: 'unified_tasks_v',
      columns: PROJECT_OVERVIEW_TASK_SELECT,
      key: 'project_id',
      ids: [projectId],
      tune: (query) => {
        let q = query.eq('source', source).in('task_kind', kinds);
        q = applyPrimaryLeadOnly(q, source === 'crm_task');
        q = applyOpenOnlyFilter(q);
        return q.order('unified_id');
      },
    });
    const sourceIds = candidateTasks.map((task) => task.source_id);
    const detailRows = sourceIds.length
      ? await fetchAllByIdsParallel({
        table: source === 'crm_task' ? 'crm_tasks' : 'tasks',
        columns: source === 'crm_task'
          ? 'id, stage_slug, pipeline_stage_id, production_pipeline_stage_id'
          : 'id, metadata, production_stage_id, stage_id',
        key: 'id',
        ids: sourceIds,
        tune: (q) => q.order('id'),
      })
      : [];
    const detailById = new Map(detailRows.map((row) => [String(row.id), row]));
    const projectDetailById = source === 'task' ? detailById : new Map();
    const crmDetailById = source === 'crm_task' ? detailById : new Map();
    const tasks = candidateTasks.filter((task) => (
      taskOwnerLane(task) === lane
      && projectOverviewCategoryId(task, projectDetailById, crmDetailById) === categoryId
    ));
    if (!tasks.length) {
      return res.status(400).json({ error: 'Danh mục này không còn nhiệm vụ mở để nhắc' });
    }

    await enrichTaskModuleOwners(tasks);
    const targets = new Set();
    const assignmentBatches = new Map();
    tasks.forEach((task) => {
      const targetId = task.assignee_id || task.module_owner_id;
      if (!targetId) return;
      targets.add(String(targetId));
      if (!task.assignee_id) {
        const key = `${task.source}:${targetId}`;
        if (!assignmentBatches.has(key)) {
          assignmentBatches.set(key, { source: task.source, targetId, ids: [] });
        }
        assignmentBatches.get(key).ids.push(task.source_id);
      }
    });
    if (!targets.size) {
      return res.status(400).json({
        error: 'Dự án chưa có người chịu trách nhiệm. Vui lòng gán phụ trách dự án trước khi nhắc.',
      });
    }

    await Promise.all([...assignmentBatches.values()].map(({ source, targetId, ids }) => (
      supabase
        .from(source === 'crm_task' ? 'crm_tasks' : 'tasks')
        .update({ assignee_id: targetId })
        .in('id', ids)
        .then(({ error }) => {
          if (error) throw error;
        })
    )));

    const actorId = String(req.user.userId || req.user.id || '');
    const actorName = req.user.full_name || req.user.email || 'Quản lý';
    const laneLabel = lane === 'sales' ? 'CRM/Sales' : (lane === 'logistics' ? 'VC-LĐ' : 'Sản xuất');
    const projectCode = tasks[0].project_code || 'dự án';
    const result = await sendCompleteReminderToUsers(req, {
      targets: [...targets],
      actorId,
      title: `Nhắc hoàn thành — ${categoryTitle}`,
      message: `${actorName} nhắc hoàn thành ${categoryTitle} của ${projectCode}: ${tasks.length} nhiệm vụ còn mở.`,
      entityType: remindEntityType(tasks[0].source),
      entityId: tasks[0].source_id,
      meta: {
        ...buildCompleteReminderMeta(tasks[0]),
        category_title: categoryTitle,
        open_count: tasks.length,
        module_label: laneLabel,
      },
    });
    res.json({
      ok: true,
      sent: result.sent,
      recipient_count: result.recipient_count,
      assigned_count: [...assignmentBatches.values()].reduce((sum, batch) => sum + batch.ids.length, 0),
    });
  } catch (e) {
    console.error('[work-tasks] project overview remind-complete:', e);
    res.status(500).json({ error: e.message || 'Không gửi được nhắc danh mục nhiệm vụ' });
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
