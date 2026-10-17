/**
 * Gateway API /api/work-tasks — tổng hợp nhiệm vụ từ tasks, crm_tasks, crm_assignments.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isSystemAdmin, isAdminLike } = require('../helpers/adminRole');
const { applyCompanyTenantScope } = require('../helpers/tenantScope');
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
const { SX_URL_SAFE_ID_MAX } = require('../helpers/sxChunkedIdPage');
const { WORKSHOP_STATUSES, getWorkshopStageMap, getWonDealProjectIds } = require('../helpers/workshopKanban');
const { effectiveDealCompanyId } = require('../helpers/workshopCompanyScope');
const { resolveSxVisibilityRestrictIds } = require('../helpers/sxKanbanSummary');
const { laMienTruChanKeo } = require('../helpers/sxChanKeoTheoNhiemVu');
const { resolveWorkRegionScope, taskMatchesRegionScope } = require('../helpers/workRegionFilter');
const {
  projectOverviewCategoryId,
  projectOverviewSharedCategoryTitle,
  firstVisibleOwnerId,
  isHiddenOverviewOwner,
  productionOwnerCandidateIds,
} = require('../helpers/projectOverviewCategory');
const { assertProjectAccessible } = require('../helpers/projectAccessScope');
const { attachInstallEventDatesToProjects } = require('../helpers/createPlannedVcLdEvents');
const {
  resolveOverviewGroupDeadline,
  stampOpenChildModuleDeadlines,
  collectOpenChildDeadlineStamps,
  indexSxCrmCompletion,
  workshopChildDone,
  deadlineGroupForWorkshopChild,
  earliestSxPlanDeadline,
} = require('../helpers/projectOverviewDeadline');
const { computeSxInstallPlanDeadline } = require('../helpers/sxInstallPlanKanbanDeadline');
const { companyWorkEndMsFromRaw } = require('../helpers/companyDeadlineClock');
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
  const leadColumns = 'id, assigned_to, lead_owner_id, project_id, company_id, region_id';
  const [projects, leadsFromIds, leadsByProject, productionStaff] = await Promise.all([
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
        columns: leadColumns,
        key: 'id',
        ids: leadIds,
        tune: (q) => q.order('id'),
      })
      : Promise.resolve([]),
    // NV SX/VC thường không có lead_id; khu vực nằm trên deal gắn project_id.
    providedLeads
      ? Promise.resolve([])
      : projectIds.length
      ? fetchAllByIdsParallel({
        table: 'crm_leads',
        columns: leadColumns,
        key: 'project_id',
        ids: projectIds,
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

  const leads = [];
  const seenLeadIds = new Set();
  for (const lead of [...(leadsFromIds || []), ...(leadsByProject || [])]) {
    const id = String(lead?.id || '');
    if (!id || seenLeadIds.has(id)) continue;
    seenLeadIds.add(id);
    leads.push(lead);
  }

  const projectById = new Map((projects || []).map((p) => [String(p.id), p]));
  const leadById = new Map(leads.map((l) => [String(l.id), l]));
  const leadByProjectId = new Map();
  leads.forEach((lead) => {
    const pid = String(lead.project_id || '');
    if (!pid) return;
    const existing = leadByProjectId.get(pid);
    if (!existing) {
      leadByProjectId.set(pid, lead);
      return;
    }
    if (!existing.region_id && lead.region_id) leadByProjectId.set(pid, lead);
  });
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
    const leadFromProject = task.project_id ? leadByProjectId.get(String(task.project_id)) : null;
    task.region_id = lead?.region_id || leadFromProject?.region_id || null;
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

/**
 * GET /api/work-tasks/team-project-tasks — việc DỰ ÁN (bảng `tasks` + `crm_tasks` của deal đã có dự án) CHƯA XONG,
 * có hạn đến hết `due_days` ngày tới, cho góc nhìn quản lý. Phân trang THEO NHÓM DỰ ÁN (mỗi nhóm kèm đủ việc
 * trong cửa sổ) để app chỉ tải phần đang xem; số đếm toàn bộ do máy chủ tính.
 *
 * Chỉ tính việc thuộc PHẠM VI SẢN XUẤT (xem `restrictToProductionScope`): dự án mở được chi tiết SX + việc `crm_task` của
 * quy trình sản xuất; việc giai đoạn bán hàng và dự án ngoài phạm vi SX không có trong số đếm.
 *
 * Query: company_id, assignee_id, q, due_days (mặc định 7, tối đa 60), page, page_size (nhóm/trang, mặc định 20).
 * Trả: { counts: {overdue, soon, total, in_progress, groups}, page, page_size, has_more, tasks[] }.
 * Quá hạn xếp trước, nhóm có hạn cũ nhất lên đầu. Một việc có thể có cả bản ở `tasks` lẫn `crm_tasks` → khử trùng.
 */
const TEAM_PROJECT_TASK_KINDS = ['SX', 'Dự án', 'CRM-Deal'];
/**
 * Trần số dòng quét cho một lần tính. Trước đây 8000 và CẮT ÂM THẦM: HCB đã có ~6400 việc không hạn cũ (mọi phân loại,
 * vì lọc phân loại làm SAU khi quét) nên sắp chạm trần, vượt là số đếm sai mà không báo. Nay trần cao hơn, quét theo
 * từng đợt song song (không dồn hàng chục request cùng lúc), và nếu vẫn vượt thì trả `truncated` + `scan_total`.
 */
const TEAM_TASKS_SCAN_CAP = Math.max(1000, Number(process.env.TEAM_TASKS_SCAN_CAP) || 30000);
/** Tập dự án của loại nhỏ hơn ngưỡng này thì đẩy `project_id in (…)` xuống truy vấn quét (nhanh); lớn hơn thì dùng phần bù. */
const TEAM_TASKS_IN_MAX = 200;
/** Số lô 1000 dòng chạy song song mỗi đợt. */
const TEAM_TASKS_SCAN_WAVE = Math.max(1, Number(process.env.TEAM_TASKS_SCAN_WAVE) || 6);
/** Cache kết quả quét theo bộ lọc (30s): trang 2+ và lần mở lại không phải quét lại; dữ liệu cũ tối đa 30s. */
const TEAM_TASKS_CACHE_MS = Math.max(0, Number(process.env.TEAM_TASKS_CACHE_MS) || 30_000);
const teamTasksCache = new Map();
/** Tổng dòng quét lần trước theo bộ lọc — chỉ để bắn sớm các lô khi tính lại (không ảnh hưởng kết quả). */
const teamScanHint = new Map();
/** Phạm vi dự án của loại lần trước theo công ty+loại — để quét sớm song song với việc lấy dự án mới (luôn kiểm lại, không ảnh hưởng kết quả). */
const teamTypeScopeCache = new Map();

/** Tên người dùng theo id (cache 10 phút) — chế độ `lite` chỉ cần `assignee_name`, khỏi chạy cả `enrichTaskModuleOwners`. */
const USER_NAME_TTL_MS = 10 * 60_000;
const userNameCache = new Map();
async function lookupUserNames(ids) {
  const out = new Map();
  const now = Date.now();
  const missing = [];
  for (const id of ids) {
    const hit = userNameCache.get(id);
    if (hit && now - hit.at < USER_NAME_TTL_MS) out.set(id, hit.name);
    else missing.push(id);
  }
  if (missing.length) {
    const users = await fetchAllByIdsParallel({
      table: 'users',
      columns: 'id, full_name',
      key: 'id',
      ids: missing,
      tune: (q) => q.order('id'),
    });
    const found = new Map((users || []).map((u) => [String(u.id), u.full_name || null]));
    for (const id of missing) {
      const name = found.get(id) ?? null;
      userNameCache.set(id, { name, at: now });
      out.set(id, name);
    }
    if (userNameCache.size > 5000) userNameCache.delete(userNameCache.keys().next().value);
  }
  return out;
}

/** Id gốc ở bảng `crm_tasks`; thiếu `source_id` thì lấy từ `unified_id` («crm_task:<uuid>») — không bao giờ gửi «undefined» xuống DB. */
const crmTaskIdOf = (t) => String(t.source_id || String(t.unified_id || '').replace(/^crm_task:/, ''));

/**
 * Chỉ giữ việc thuộc PHẠM VI SẢN XUẤT — cùng quy tắc với trang chi tiết dự án (web + app), để việc đếm ở tab Công việc
 * mở ra được ở chi tiết dự án:
 *  1. Dự án phải trong phạm vi SX như `GET /production/projects/:id` (deal thắng / cột kanban SX / trạng thái xưởng /
 *     giai đoạn xưởng). Dự án ngoài phạm vi bị 403 «không thuộc phạm vi sản xuất» khi mở chi tiết.
 *  2. Việc `crm_task` chỉ tính khi là việc của quy trình sản xuất (`stage_slug` bắt đầu `sx_` hoặc có
 *     `production_pipeline_stage_id`) — như `GET /crm/leads/:id/tasks?task_scope=production`. Các việc giai đoạn bán hàng
 *     (Bản hợp đồng, Báo giá, Bản vẽ 2D…) cũng là `crm_task` của deal đã có dự án nhưng không hiện ở chi tiết dự án SX.
 *  3. Dự án phải CHƯA KẾT THÚC như trang «Quản lý nhiệm vụ Sản xuất» (`GET /project-overview`): bỏ dự án `completed` / huỷ và
 *     dự án đã ở cột kết thúc SX (`isProductionTaskTerminalStage`: bàn giao vận chuyển, «đã giao hàng», «hoàn thành», «đã thu»).
 * Việc ở bảng `tasks` (SX / Dự án) của dự án trong phạm vi vẫn giữ nguyên.
 */
async function restrictToProductionScope(rows, companyId) {
  if (!rows.length) return rows;
  const projectIds = [...new Set(rows.map((t) => String(t.project_id)))];
  const crmIds = rows.filter((t) => t.source === 'crm_task').map(crmTaskIdOf).filter(Boolean);
  const [wonIds, stageMap, projects, crmTasks, productionStages] = await Promise.all([
    getWonDealProjectIds(companyId || null),
    getWorkshopStageMap(),
    fetchAllByIdsParallel({
      table: 'projects',
      columns: 'id, status, current_stage_id, sx_kanban_column_id',
      key: 'id',
      ids: projectIds,
    }),
    fetchAllByIdsParallel({
      table: 'crm_tasks',
      columns: 'id, stage_slug, production_pipeline_stage_id',
      key: 'id',
      ids: crmIds,
    }),
    // Cột pipeline SX (bảng nhỏ) — để biết dự án đã ở cột KẾT THÚC chưa (`isProductionTaskTerminalStage`). Phần bổ sung: lỗi thì
    // bỏ qua bộ lọc cột kết thúc (như trước đây) và ghi log, KHÔNG làm hỏng cả endpoint.
    fetchAllPages(() => supabase
      .from('production_pipeline_stages')
      .select('id, name, bucket_slug, is_handover_to_logistics, counts_as_completed_revenue, counts_as_collected_revenue')
      .order('id'))
      .catch((err) => {
        console.warn('[work-tasks] team-project-tasks: bỏ qua lọc cột kết thúc —', err?.message || err);
        return [];
      }),
  ]);
  const won = new Set((wonIds || []).map(String));
  const workshopStageIds = new Set((stageMap?.ids || []).map(String));
  const stageById = new Map((productionStages || []).map((s) => [String(s.id), s]));
  // Cùng quy tắc với trang «Quản lý nhiệm vụ Sản xuất» (`GET /project-overview`): chỉ tính dự án CHƯA KẾT THÚC —
  // bỏ dự án đã hoàn thành / huỷ và dự án đã sang cột kết thúc SX (bàn giao vận chuyển, «đã giao hàng», «hoàn thành», «đã thu»…).
  const projectEnded = (p) => ['completed', 'cancelled', 'canceled'].includes(String(p.status || '').toLowerCase())
    || isProductionTaskTerminalStage(stageById.get(String(p.sx_kanban_column_id || '')));
  const inScope = new Set(
    projects
      .filter((p) => !projectEnded(p)
        && (won.has(String(p.id))
          || !!p.sx_kanban_column_id
          || WORKSHOP_STATUSES.includes(p.status)
          || (p.current_stage_id && workshopStageIds.has(String(p.current_stage_id)))))
      .map((p) => String(p.id)),
  );
  const sxCrm = new Set(
    crmTasks
      .filter((c) => String(c.stage_slug || '').startsWith('sx_') || c.production_pipeline_stage_id)
      .map((c) => String(c.id)),
  );
  return rows.filter((t) => inScope.has(String(t.project_id))
    && (t.source !== 'crm_task' || sxCrm.has(crmTaskIdOf(t))));
}

/**
 * Các deal mà chi tiết dự án lấy việc `crm_task` từ đó, theo từng dự án: deal GỐC (cùng quy tắc `pickBootstrapDeal` của
 * `GET /production/projects/:id/task-bootstrap`: deal cũ nhất không có deal cha) + deal con trực tiếp + lead fulfillment của
 * các đơn thuộc deal gốc (`appendFulfillmentChildTasksForMasterDeal` gộp việc của chúng vào deal gốc).
 *
 * Một dự án có thể gắn nhiều deal (đơn bổ sung, deal nhân bản) nhưng chi tiết chỉ hiện việc của deal gốc — nên danh sách
 * team không được đếm `crm_task` của deal khác (HCB: TB-2026-1037 / 1038 thừa 27 việc khi bỏ gộp theo tên).
 * Trả `Map<projectId, Set<leadId>>`; dự án không có lead nào thì không có mục (giữ nguyên mọi việc).
 */
async function loadDetailLeadsByProject(projectIds) {
  const leads = await fetchAllByIdsParallel({
    table: 'crm_leads',
    columns: 'id, type, parent_lead_id, created_at, project_id',
    key: 'project_id',
    ids: projectIds,
    idChunk: 200,
  });
  const byProject = new Map();
  for (const l of leads) {
    const pid = String(l.project_id);
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push(l);
  }
  const primaryOf = new Map();
  for (const [pid, list] of byProject) {
    const typed = list.filter((d) => String(d.type || '') === 'deal');
    const pool = typed.length ? typed : list;
    const roots = pool.filter((d) => d.parent_lead_id == null || String(d.parent_lead_id).trim() === '');
    const preferred = roots.length ? roots : pool;
    const first = [...preferred].sort((a, b) => {
      const ca = String(a.created_at || '');
      const cb = String(b.created_at || '');
      if (ca !== cb) return ca.localeCompare(cb);
      return String(a.id || '').localeCompare(String(b.id || ''));
    })[0];
    if (first) primaryOf.set(pid, String(first.id));
  }
  const orders = await fetchAllByIdsParallel({
    table: 'orders',
    columns: 'lead_id, fulfillment_lead_id',
    key: 'lead_id',
    ids: [...primaryOf.values()],
    idChunk: 200,
  });
  const out = new Map();
  for (const [pid, primary] of primaryOf) {
    const allowed = new Set([primary]);
    for (const l of byProject.get(pid) || []) {
      if (String(l.parent_lead_id || '') === primary) allowed.add(String(l.id));
    }
    for (const o of orders) {
      if (String(o.lead_id) === primary && o.fulfillment_lead_id) allowed.add(String(o.fulfillment_lead_id));
    }
    out.set(pid, allowed);
  }
  return out;
}

/** Việc `crm_task` có thuộc các deal mà chi tiết dự án hiện không (xem `loadDetailLeadsByProject`)? Việc ở bảng `tasks` luôn giữ. */
function crmRowInDetailLeads(t, detailLeads) {
  if (t.source !== 'crm_task') return true;
  const allowed = detailLeads.get(String(t.project_id));
  return !allowed || allowed.has(String(t.lead_id));
}

/** Trạng thái đã đóng — cùng bộ với `applyOpenOnlyFilter`. */
const CLOSED_TASK_STATUSES = new Set(['done', 'completed', 'cancelled']);

/**
 * Người nhận của việc ở bảng `tasks` theo khóa «dự án + tên việc» — để KẾ THỪA cho các `crm_task` cùng tên chưa có người nhận.
 * Đợt gán nhân sự 08–12/10 chỉ ghi vào `tasks` (HCB: 1.401/2.026 `crm_task` SX chưa giao thực ra đã có người nhận ở bản `tasks`),
 * nên tab / «Theo dự án» / «Chưa giao» phải xét cả hai bảng mới nói đúng ai đang phụ trách. Chỉ ĐỌC; lỗi → rỗng + log.
 * @returns {Promise<Map<string, string>>} khóa `${projectId}|${tên thường}` → assignee_id
 */
async function loadTaskAssigneesByKey(projectIds) {
  const out = new Map();
  const ids = [...new Set((projectIds || []).filter(Boolean).map(String))];
  if (!ids.length) return out;
  try {
    const rows = await fetchAllByIdsParallel({
      table: 'tasks',
      columns: 'id, project_id, title, assignee_id, status',
      key: 'project_id',
      ids,
      idChunk: 100,
      tune: (q) => q.not('assignee_id', 'is', null).neq('status', 'done').order('id'),
    });
    for (const r of rows) {
      const key = `${r.project_id}|${String(r.title || '').trim().toLowerCase()}`;
      if (r.assignee_id && !out.has(key)) out.set(key, String(r.assignee_id));
    }
  } catch (err) {
    console.warn('[work-tasks] bỏ qua kế thừa người nhận từ tasks —', err?.message || err);
  }
  return out;
}

/**
 * Việc ở bảng `tasks` đang CHẶN KÉO CỘT Kanban SX — đúng điều kiện của `workshopStageAdvanceGate`: `blocks_stage_advance`, chưa
 * xong, `production_stage_id` = cột SX hiện tại của dự án, và dự án chưa được miễn chặn (`laMienTruChanKeo`: theo công ty / phân
 * loại trong `app_settings`). Chi tiết dự án chỉ đọc `crm_task` nên người kéo thẻ bị chặn bởi việc họ không thấy ở đâu; tab Công
 * việc vì vậy phải giữ các việc này (kể cả chưa ai nhận / không có bản `crm_task` / hạn đã xa). Toàn hệ thống chỉ ~90 việc có cờ +
 * cột nên truy vấn nhỏ. Lỗi → trả rỗng + log (không làm hỏng endpoint). Chỉ ĐỌC.
 * @returns {Promise<Array<{ id: string, project_id: string, title: string, company_id: string|null, status: string }>>}
 */
async function loadBlockingTasks(effectiveCompany, typedSet) {
  try {
    const flagged = await fetchAllPages(() => supabase
      .from('tasks')
      .select('id, project_id, production_stage_id, status, title')
      .eq('blocks_stage_advance', true)
      .neq('status', 'done')
      .not('production_stage_id', 'is', null)
      .not('project_id', 'is', null)
      .order('id', { ascending: true }));
    if (!flagged.length) return [];
    const projects = await fetchAllByIdsParallel({
      table: 'projects',
      columns: 'id, company_id, workshop_type_id, sx_kanban_column_id, status',
      key: 'id',
      ids: [...new Set(flagged.map((t) => String(t.project_id)))],
      idChunk: 100,
    });
    const projectById = new Map(projects.map((p) => [String(p.id), p]));
    const exemptCache = new Map();
    const out = [];
    for (const t of flagged) {
      const p = projectById.get(String(t.project_id));
      if (!p || !p.sx_kanban_column_id || String(p.sx_kanban_column_id) !== String(t.production_stage_id)) continue;
      if (CLOSED_TASK_STATUSES.has(String(t.status || '').toLowerCase())) continue;
      if (effectiveCompany && String(p.company_id || '') !== String(effectiveCompany)) continue;
      if (typedSet && !typedSet.has(String(p.id))) continue;
      const ek = `${p.company_id || ''}|${p.workshop_type_id || ''}`;
      if (!exemptCache.has(ek)) exemptCache.set(ek, await laMienTruChanKeo(p.company_id, p.workshop_type_id));
      if (exemptCache.get(ek)) continue; // công ty / phân loại được kéo tự do → việc này không chặn gì
      out.push({
        id: String(t.id),
        project_id: String(t.project_id),
        title: String(t.title || ''),
        company_id: p.company_id ? String(p.company_id) : null,
        status: String(t.status || ''),
      });
    }
    return out;
  } catch (err) {
    console.warn('[work-tasks] team-project-tasks: bỏ qua việc chặn kéo cột —', err?.message || err);
    return [];
  }
}

/**
 * `crm_task` (trong danh sách) đang có «Giao việc» còn mở soi gương ở `crm_assignments` — app cộng «Giao việc» với việc dự án nên
 * việc đó bị đếm và hiện HAI lần. Trả mảng id `crm_task` để app bỏ dòng giao việc trùng. Lỗi → rỗng + log. Chỉ ĐỌC.
 * @param {string[]} crmTaskIds
 * @returns {Promise<string[]>}
 */
async function loadAssignedCrmTaskIds(crmTaskIds) {
  const ids = [...new Set((crmTaskIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];
  try {
    const rows = await fetchAllByIdsParallel({
      table: 'crm_assignments',
      columns: 'crm_task_id, status',
      key: 'crm_task_id',
      ids,
      idChunk: 100,
    });
    return [...new Set(
      rows
        .filter((r) => r.crm_task_id && !CLOSED_TASK_STATUSES.has(String(r.status || '').toLowerCase()))
        .map((r) => String(r.crm_task_id)),
    )];
  } catch (err) {
    console.warn('[work-tasks] team-project-tasks: bỏ qua đối chiếu giao việc trùng —', err?.message || err);
    return [];
  }
}

/**
 * Bỏ khỏi tab Công việc các việc ở bảng `tasks` mà bản `crm_task` CÙNG TÊN trong cùng dự án đã xong.
 *
 * Mỗi việc sản xuất có hai bản: `tasks` (bảng việc xưởng) và `crm_task` (việc của deal). Chi tiết dự án đọc bản `crm_task`,
 * còn danh sách này ưu tiên bản `tasks` (khử trùng). Khi bản `crm_task` đã hoàn thành mà bản `tasks` còn «todo» thì việc vẫn
 * hiện là chưa xong — và nếu có hạn thì bị tính quá hạn — dù chi tiết dự án đã đánh dấu xong. Đo ở HCB · Tủ bếp: 112 / 600
 * việc «chưa xong» và 40 / 149 việc «quá hạn» thuộc loại này.
 *
 * Chỉ bỏ khi mọi bản `crm_task` sản xuất cùng tên đều đã đóng (còn một bản đang mở thì giữ — trường hợp nhiều việc cùng tên
 * ở các cột khác nhau) VÀ việc chưa giao cho ai. Việc đã giao người thì giữ, gắn `closed_on_deal` (không tính quá hạn). Việc
 * không có bản `crm_task` tương ứng luôn được giữ nguyên, kể cả chưa ai nhận (trước đây ẩn việc mẫu bị bỏ quên — đã bỏ quy
 * tắc đó vì việc chưa giao vẫn là việc thật). KHÔNG ghi dữ liệu.
 */
async function dropTasksClosedOnDeal(rows, detailLeads, { dropWithTwin = false } = {}) {
  const taskRows = rows.filter((t) => t.source === 'task');
  if (!taskRows.length) return rows;
  const projectIds = [...new Set(taskRows.map((t) => String(t.project_id)))];
  const crmRowsAll = await fetchAllByIdsParallel({
    table: 'unified_tasks_v',
    columns: 'unified_id, source_id, project_id, lead_id, title, status, deadline',
    key: 'project_id',
    ids: projectIds,
    // `in` trên view nhanh với khoảng ≤ ~200 id (xem TEAM_TASKS_IN_MAX) → chia khúc nhỏ.
    idChunk: 100,
    tune: (q) => q.eq('source', 'crm_task').order('unified_id', { ascending: true }),
  });
  // Chỉ xét bản crm ở các deal mà chi tiết dự án hiện (bản ở deal khác không quyết định việc đã xong hay chưa).
  const crmRows = detailLeads ? crmRowsAll.filter((c) => crmRowInDetailLeads({ ...c, source: 'crm_task' }, detailLeads)) : crmRowsAll;
  if (!crmRows.length) return rows;
  const crmDetail = await fetchAllByIdsParallel({
    table: 'crm_tasks',
    columns: 'id, stage_slug, production_pipeline_stage_id',
    key: 'id',
    ids: crmRows.map(crmTaskIdOf),
  });
  const sxCrm = new Set(
    crmDetail
      .filter((c) => String(c.stage_slug || '').startsWith('sx_') || c.production_pipeline_stage_id)
      .map((c) => String(c.id)),
  );
  const keyOf = (t) => `${t.project_id}|${String(t.title || '').trim().toLowerCase()}`;
  const state = new Map();
  for (const c of crmRows) {
    if (!sxCrm.has(crmTaskIdOf(c))) continue;
    const k = keyOf(c);
    const s = state.get(k) || { open: 0, closed: 0, openDeadlineMs: [] };
    if (CLOSED_TASK_STATUSES.has(String(c.status || '').toLowerCase())) s.closed += 1;
    else {
      s.open += 1;
      const ms = c.deadline ? new Date(c.deadline).getTime() : NaN;
      if (Number.isFinite(ms)) s.openDeadlineMs.push(ms);
    }
    state.set(k, s);
  }
  const kept = rows.filter((t) => {
    if (t.source !== 'task') return true;
    // Việc đang CHẶN KÉO CỘT (xem `loadBlockingTasks`) luôn giữ: cổng kéo cột đọc bảng `tasks` nên nó vẫn chặn dù chi tiết dự án
    // không hiện.
    if (t.blocks_stage_advance) return true;
    const s = state.get(keyOf(t));
    // Chế độ «Chưa giao»: đã có bản `crm_task` cùng tên (dù mở hay xong) thì bản crm mới là việc thật → bỏ bản `tasks` để khỏi hiện
    // thành «chưa giao» khi bản crm đã có người nhận.
    if (dropWithTwin && s) return false;
    // 1. Bản `crm_task` cùng tên đã đóng hết → việc đã xong ở chi tiết dự án. CHƯA GIAO ai thì bỏ; đã giao cho một người thì
    //    GIỮ (đánh dấu `closed_on_deal` ở bước dưới) để việc đang gắn với người không biến mất âm thầm.
    if (s && s.closed > 0 && s.open === 0 && !t.assignee_id) return false;
    // (Trước đây có quy tắc 2 ẩn việc mẫu chưa ai nhận / không có `crm_task` cùng tên — đã BỎ theo yêu cầu: việc chưa giao vẫn là
    //  việc thật, hiện bình thường khi nằm trong cửa sổ; việc cũ không hạn vẫn do cửa sổ quyết định.)
    return true;
  });
  // 3. HẠN lấy theo `crm_task` (bản chi tiết dự án hiển thị) thay vì `tasks.due_date`: bản `tasks` hay cũ / do script gán nên
  //    trước đây tab báo «quá hạn» trong khi chi tiết không có hạn hoặc hạn còn xa (HCB: chỉ 16/93 việc quá hạn khớp chi
  //    tiết). Có nhiều bản crm mở cùng tên → lấy hạn SỚM NHẤT có giá trị (cùng bản được ghép làm song sinh ở bước khử trùng);
  //    bản crm không có hạn → việc không có hạn.
  return kept.map((t) => {
    if (t.source !== 'task') return t;
    const s = state.get(keyOf(t));
    // Đã giao người nhưng bản crm đã xong: giữ lại, gắn cờ `closed_on_deal`. Hạn cũ của bản `tasks` sẽ KHÔNG tính quá hạn (xem
    // `computeTeamTasks`) — đã xong ở deal nên hạn đó không còn ý nghĩa; cửa sổ vẫn xét theo hạn / ngày tạo gốc.
    if (s && s.closed > 0 && s.open === 0 && t.assignee_id && !t.blocks_stage_advance) return { ...t, closed_on_deal: true };
    if (!s || s.open === 0) return t;
    const ms = s.openDeadlineMs.length ? Math.min(...s.openDeadlineMs) : null;
    const current = t.deadline ? new Date(t.deadline).getTime() : null;
    if (ms === current) return t;
    return { ...t, deadline: ms == null ? null : new Date(ms).toISOString() };
  });
}

/**
 * Việc con của thẻ «Quản lý nhiệm vụ Sản xuất» (Kanban / Hạn) lấy từ `crm_task` — CÙNG nguồn và quy tắc với «Theo dự án» / tab
 * Công việc của app / chi tiết dự án — thay vì từ bảng `tasks`:
 *  - Mỗi `crm_task` SX (mở lẫn đã xong, để tính tiến độ) ở các deal mà chi tiết dự án hiện = một việc con.
 *  - Bản `tasks` CÙNG TÊN với một `crm_task` bị bỏ (crm là việc thật); người nhận của bản `tasks` được KẾ THỪA cho các
 *    `crm_task` cùng tên chưa có người nhận (đợt gán nhân sự hàng loạt chỉ ghi vào `tasks`).
 *  - Bản `tasks` KHÔNG có `crm_task` cùng tên vẫn giữ (xưởng theo dõi riêng ở `tasks`), kèm việc đang chặn kéo cột.
 * Hàm thuần, KHÔNG ghi dữ liệu.
 * @returns {{ children: object[], crmDetails: Map<string, object> }}
 */
function buildCrmSxOverviewChildren({
  tasksRows = [], sxCrmRows = [], leadProjectById, detailLeads = null, projectById, blockingTaskIds = null,
}) {
  const projects = projectById instanceof Map ? projectById : new Map();
  const leadProject = leadProjectById instanceof Map ? leadProjectById : new Map();
  const normTitle = (v) => String(v || '').trim().toLowerCase();
  const keyOf = (projectId, title) => `${projectId}|${normTitle(title)}`;
  const crmDetails = new Map();
  const crmChildren = [];
  const twinsByKey = new Map();
  for (const row of sxCrmRows) {
    const slug = String(row?.stage_slug || '');
    if (!slug.startsWith('sx_') && !row?.production_pipeline_stage_id) continue;
    const projectId = leadProject.get(String(row.lead_id || ''));
    const project = projectId ? projects.get(String(projectId)) : null;
    if (!project) continue;
    if (!crmRowInDetailLeads({ source: 'crm_task', project_id: projectId, lead_id: row.lead_id }, detailLeads || new Map())) continue;
    const child = {
      unified_id: `crm_task:${row.id}`,
      source: 'crm_task',
      source_id: String(row.id),
      project_id: String(projectId),
      lead_id: String(row.lead_id),
      company_id: project.company_id || null,
      title: row.title,
      status: row.status,
      assignee_id: row.assignee_id || null,
      deadline: row.deadline || null,
      task_kind: 'SX',
      project_code: project.code || null,
      project_name: project.name || null,
      lead_title: null,
    };
    crmChildren.push(child);
    crmDetails.set(String(row.id), {
      id: String(row.id),
      stage_slug: row.stage_slug || null,
      production_pipeline_stage_id: row.production_pipeline_stage_id || null,
      pipeline_stage_id: null,
    });
    const k = keyOf(projectId, row.title);
    if (!twinsByKey.has(k)) twinsByKey.set(k, []);
    twinsByKey.get(k).push(child);
  }
  const keptTaskRows = [];
  for (const t of tasksRows) {
    if (t?.source !== 'task') { keptTaskRows.push(t); continue; }
    const twins = twinsByKey.get(keyOf(t.project_id, t.title));
    if (twins && twins.length) {
      // Người nhận của bản `tasks` → các `crm_task` cùng tên chưa có người nhận (không ghi DB, chỉ hiển thị).
      if (t.assignee_id) twins.forEach((c) => { if (!c.assignee_id) c.assignee_id = t.assignee_id; });
      if (!(blockingTaskIds instanceof Set && blockingTaskIds.has(String(t.source_id)))) continue;
    }
    keptTaskRows.push(t);
  }
  return {
    children: [...crmChildren, ...keptTaskRows],
    crmDetails,
    // Dự án đã có việc SX ở `crm_task`: việc `tasks` không có bản crm của dự án đó gom vào nhóm riêng «Việc xưởng riêng».
    projectsWithCrmSx: new Set(crmChildren.map((child) => String(child.project_id))),
  };
}

/** Nhóm trên Kanban cho việc ở bảng `tasks` KHÔNG có bản `crm_task` cùng tên (dự án đã có việc SX ở deal). */
const WORKSHOP_OWN_CATEGORY_ID = 'workshop-own';
const WORKSHOP_OWN_CATEGORY_TITLE = 'Việc xưởng riêng';

/**
 * Lọc theo CÔNG TY ĐẶT HÀNG (công ty chủ deal) — cùng nguồn với tab Dự án / Kanban SX (`resolveSxVisibilityRestrictIds` →
 * `getAccountingClientProjectIdsAtWorkshop`): `deal_company_id` = công ty CRM (UUID); `deal_external_company_name` = khách ngoài
 * danh mục (so tên với `crm_leads.external_company_name`, không phân biệt hoa/thường). Không truyền gì → không lọc.
 * `effectiveDealCompanyId` giữ nguyên quy tắc quyền: người không phải admin hệ thống luôn bị khóa vào công ty của mình.
 */
async function dealCompanyProjectIdSet({ req, effectiveCompany, dealCompanyQ, dealExtName, candidateProjectIds }) {
  if (!dealCompanyQ && !dealExtName) return null;
  let allowed = null; // Set<projectId>; null = không giới hạn
  if (dealCompanyQ) {
    const restrict = await resolveSxVisibilityRestrictIds(
      req.user,
      effectiveCompany || null,
      null,
      effectiveDealCompanyId(req, dealCompanyQ, effectiveCompany || null),
    );
    if (Array.isArray(restrict)) allowed = new Set(restrict.map(String));
  }
  if (dealExtName) {
    const leads = await fetchAllByIdsParallel({
      table: 'crm_leads',
      columns: 'project_id, external_company_name',
      key: 'project_id',
      ids: [...new Set(candidateProjectIds.map(String))],
      idChunk: 200,
    });
    const want = dealExtName.trim().toLowerCase();
    const extSet = new Set(
      leads
        .filter((l) => String(l.external_company_name || '').trim().toLowerCase() === want)
        .map((l) => String(l.project_id)),
    );
    allowed = allowed ? new Set([...allowed].filter((id) => extSet.has(id))) : extSet;
  }
  return allowed;
}

async function restrictToDealCompany(rows, { req, effectiveCompany, dealCompanyQ, dealExtName }) {
  if (!rows.length || (!dealCompanyQ && !dealExtName)) return rows;
  const allowed = await dealCompanyProjectIdSet({
    req,
    effectiveCompany,
    dealCompanyQ,
    dealExtName,
    candidateProjectIds: rows.map((t) => t.project_id),
  });
  if (!allowed) return rows;
  return rows.filter((t) => allowed.has(String(t.project_id)));
}

r.get('/team-project-tasks', async (req, res) => {
  try {
    if (!isManagerLike(req.user)) return res.status(403).json({ error: 'Chỉ dành cho quản lý' });
    const { company_id, assignee_id, q: searchQ } = req.query;
    const dealCompanyQ = String(req.query.deal_company_id || '').trim();
    const dealExtName = String(req.query.deal_external_company_name || '').trim();
    const dueDays = Math.min(60, Math.max(0, parseInt(req.query.due_days, 10) || 7));
    const { page, pageSize } = parsePagination(req, 20, 100);
    const effectiveCompany = company_id || (!isSystemAdmin(req.user) ? req.user?.company_id : null);

    // created_days: lấy thêm việc MỚI TẠO trong N ngày qua dù chưa có hạn / hạn xa (0 = tắt). Mặc định 7.
    const createdRaw = parseInt(req.query.created_days, 10);
    const createdDays = Math.min(60, Math.max(0, Number.isFinite(createdRaw) ? createdRaw : 7));

    const nowMs = Date.now();
    const until = new Date(nowMs + dueDays * 86_400_000).toISOString();
    const createdSince = new Date(nowMs - createdDays * 86_400_000).toISOString();
    // `source_id` cần cho `restrictToProductionScope` (tra `crm_tasks` theo id); thiếu cột này thì truy vấn nhận chuỗi «undefined» → 500.
    const COLS = 'unified_id, source, source_id, project_id, lead_id, title, status, deadline, created_at, assignee_id, task_kind, project_code, project_name, lead_title';
    // no_deadline=1: mục riêng «Không hạn» — việc chưa xong KHÔNG có hạn và tạo từ lâu (trước `created_days` ngày);
    // phần mới tạo đã nằm ở danh sách chính. Lấy tách riêng để danh sách chính không phình theo hàng nghìn việc cũ.
    const noDeadlineMode = ['1', 'true'].includes(String(req.query.no_deadline || '').toLowerCase());
    // unassigned=1: mục «Chưa giao» DÀNH CHO ADMIN — mọi việc chưa có người nhận, bất kể ngày tạo / hạn (không áp cửa sổ N ngày) để
    // Admin thấy và giao việc. Không cộng vào số chính. Các vai trò khác không dùng được.
    const unassignedMode = ['1', 'true'].includes(String(req.query.unassigned || '').toLowerCase());
    if (unassignedMode && !isAdminLike(req.user)) return res.status(403).json({ error: 'Mục «Chưa giao» chỉ dành cho Admin' });
    // due_from / due_to (YYYY-MM-DD, ngày lịch VN, gồm cả hai đầu): lọc việc theo KHOẢNG HẠN ở máy chủ (chip Hôm nay / Ngày
    // mai / Trong tuần…). Lọc ở máy chỉ thấy các nhóm đã tải, mà nhóm quá hạn xếp trước nên việc đến hạn hôm nay nằm ở trang sau.
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const dueFromRaw = String(req.query.due_from || '').trim();
    const dueToRaw = String(req.query.due_to || '').trim();
    const dueRange = dateRe.test(dueFromRaw) && dateRe.test(dueToRaw) && !noDeadlineMode && !unassignedMode
      ? {
        from: new Date(`${dueFromRaw}T00:00:00+07:00`).toISOString(),
        // Hết ngày due_to = đầu ngày kế tiếp (VN).
        to: new Date(new Date(`${dueToRaw}T00:00:00+07:00`).getTime() + 86_400_000).toISOString(),
      }
      : null;

    // Toàn bộ phần quét + gom nhóm gói trong `computeTeamTasks` để CACHE ngắn hạn: các trang 2, 3… (cuộn tiếp) và các lần
    // mở lại cùng bộ lọc không phải quét lại hàng nghìn dòng (HCB «Không hạn» ~5.500 việc: ~3,3s/trang khi quét tuần tự).
    const computeTeamTasks = async () => {
      // `skipCompany`: bỏ lọc `company_id` của view — dùng cho việc `crm_task` của deal thuộc CÔNG TY KHÁC (xem `loadCrossCompanyCrmRows`).
      const applyScanFilters = (qy, skipCompany = false) => {
        qy = qy.in('task_kind', TEAM_PROJECT_TASK_KINDS).not('project_id', 'is', null);
        if (unassignedMode) {
          // Mọi việc chưa có người nhận, không giới hạn ngày tạo / hạn; mới tạo lên trước.
          qy = qy.is('assignee_id', null).order('created_at', { ascending: false });
        } else if (noDeadlineMode) {
          qy = qy.is('deadline', null).lt('created_at', createdSince).order('created_at', { ascending: false });
        } else if (dueRange) {
          // Chip hạn xử lý: chỉ việc có hạn nằm trong khoảng đã chọn (không kèm việc mới tạo).
          qy = qy.gte('deadline', dueRange.from).lt('deadline', dueRange.to).order('deadline', { ascending: true });
        } else {
          // Có hạn đến hết cửa sổ N ngày tới, HOẶC mới tạo gần đây (kể cả không hạn).
          qy = qy
            .or(createdDays > 0
              ? `and(deadline.not.is.null,deadline.lte.${until}),created_at.gte.${createdSince}`
              : `and(deadline.not.is.null,deadline.lte.${until})`)
            .order('deadline', { ascending: true });
        }
        qy = qy.order('unified_id', { ascending: true });
        qy = applyOpenOnlyFilter(qy);
        if (effectiveCompany && !skipCompany) qy = qy.eq('company_id', effectiveCompany);
        // Không chọn công ty (Admin hệ thống xem tất cả) → vẫn chỉ trong các công ty của hệ sinh thái mình, nếu không lộ việc của tenant khác.
        else if (!skipCompany) qy = applyCompanyTenantScope(qy, req);
        if (assignee_id && !unassignedMode) qy = qy.eq('assignee_id', assignee_id);
        const needle = String(searchQ || '').trim();
        if (needle) qy = qy.ilike('title', `%${needle}%`);
        return qy;
      };

      // Việc `crm_task` của dự án thuộc công ty đang xem NHƯNG deal đặt hàng thuộc công ty khác (xưởng sản xuất hộ công ty
      // khác, vd. HCB làm cho VPT / Phúc Đạt). View gán `company_id` của `crm_task` theo công ty của DEAL nên bị lọc
      // `company_id = công ty` loại mất — trong khi chi tiết dự án vẫn hiện các việc này. Lấy bổ sung theo dự án của công ty,
      // cùng bộ lọc hạn / người / từ khóa, chỉ gồm việc `crm_task` (việc ở bảng `tasks` đã có company_id = công ty dự án).
      const loadCrossCompanyCrmRows = async (typedSetIn) => {
        if (!effectiveCompany) return [];
        const leads = await fetchAllPages(() => supabase
          .from('crm_leads')
          .select('project_id, projects!inner(company_id)')
          .eq('projects.company_id', effectiveCompany)
          .or(`company_id.is.null,company_id.neq.${effectiveCompany}`)
          .not('project_id', 'is', null)
          .order('project_id', { ascending: true }));
        let projectIds = [...new Set((leads || []).map((l) => String(l.project_id)))];
        if (typedSetIn) projectIds = projectIds.filter((id) => typedSetIn.has(id));
        if (!projectIds.length) return [];
        return fetchAllByIdsParallel({
          table: 'unified_tasks_v',
          columns: COLS,
          key: 'project_id',
          ids: projectIds,
          // `in` trên view nhanh với khoảng ≤ ~200 id (xem TEAM_TASKS_IN_MAX) → chia khúc nhỏ.
          idChunk: 100,
          tune: (q) => applyScanFilters(q.eq('source', 'crm_task'), true),
        });
      };

      // Lọc theo PHÂN LOẠI xưởng (`workshop_type_id`: mã loại hoặc `none`) — view không có cột này nên lấy tập dự án trước rồi
      // ĐẨY XUỐNG truy vấn quét để khỏi đọc cả công ty: trước đây «Tủ bếp» vẫn đọc ~6.000 dòng, loại rỗng vẫn quét hết, và
      // `scan_total` / `truncated` đo sai phạm vi. Chọn tập NHỎ HƠN (đo trên HCB: `in` nhanh với ≤ ~200 id nhưng chậm gấp 3-4
      // lần khi 300+ id; `not in` phần bù nhanh bằng truy vấn không lọc): loại ít dự án → `project_id in (…)`; loại chiếm đa số
      // (vd. Tủ bếp) → `project_id not in (các dự án loại khác)`; cả hai đều lớn → quét cả công ty như cũ. Luôn lọc lại bằng tập
      // id ở máy để giữ nguyên ngữ nghĩa cũ (việc của dự án thuộc công ty khác vẫn bị loại).
      const typeRaw = String(req.query.workshop_type_id || '').trim();
      const emptyTeamResult = () => ({
        ordered: [],
        counts: {
          overdue: 0, soon: 0, total: 0, in_progress: 0, no_deadline: 0, groups: 0, truncated: false, scan_total: 0,
        },
      });
      // Lấy phạm vi dự án của loại (+ cách đẩy xuống truy vấn): { typedSet, pushdown } — `pushdown` = { mode: 'in' | 'notin', ids } | null.
      const loadTypeScope = async () => {
        const isNone = typeRaw.toLowerCase() === 'none';
        const projectRows = async (typeFilter) => {
          const build = (cols, opts) => {
            let pq = supabase.from('projects').select(cols, opts).order('id', { ascending: true });
            if (effectiveCompany) pq = pq.eq('company_id', effectiveCompany);
            else pq = applyCompanyTenantScope(pq, req);
            if (typeFilter) pq = isNone ? pq.is('workshop_type_id', null) : pq.eq('workshop_type_id', typeRaw);
            return pq;
          };
          const cols = 'id, workshop_type_id';
          const pFirst = await build(cols, { count: 'exact' }).range(0, 999);
          if (pFirst.error) throw pFirst.error;
          const out = [...(pFirst.data || [])];
          const pTotal = Math.min(Number(pFirst.count) || 0, 20000);
          if (pTotal > 1000) {
            const pStarts = [];
            for (let from = 1000; from < pTotal; from += 1000) pStarts.push(from);
            const pParts = await Promise.all(pStarts.map(async (from) => {
              const r = await build(cols).range(from, from + 999);
              if (r.error) throw r.error;
              return r.data || [];
            }));
            pParts.forEach((p) => out.push(...p));
          }
          return out;
        };
        // Có công ty → lấy một lần mọi dự án của công ty (id + loại) để suy ra cả tập loại lẫn phần bù; không có → chỉ tập loại.
        const rowsAll = await projectRows(!effectiveCompany);
        const isType = (p) => (isNone
          ? !p.workshop_type_id
          : String(p.workshop_type_id || '').toLowerCase() === typeRaw.toLowerCase());
        const typedRows = effectiveCompany ? rowsAll.filter(isType) : rowsAll;
        const typedSetLocal = new Set(typedRows.map((p) => String(p.id)));
        const complement = effectiveCompany
          ? rowsAll.filter((p) => !typedSetLocal.has(String(p.id))).map((p) => String(p.id))
          : null;
        let pd = null;
        if (typedSetLocal.size && typedSetLocal.size <= TEAM_TASKS_IN_MAX) pd = { mode: 'in', ids: [...typedSetLocal] };
        else if (typedSetLocal.size && complement && complement.length <= SX_URL_SAFE_ID_MAX) pd = { mode: 'notin', ids: complement };
        return { typedSet: typedSetLocal, pushdown: pd };
      };

      // Quét theo một cách đẩy xuống `pd`: lô đầu kèm tổng số dòng → các lô còn lại chạy song song theo ĐỢT (PostgREST cắt ở
      // 1000 dòng/lần; trần cao hơn thì không được dồn cả chục request một lúc). Nếu lần trước đã biết tổng (`hint`), bắn sẵn các
      // lô đầu tiên CÙNG LÚC với lô đầu thay vì đợi đếm xong — lần tính lại sau khi cache hết hạn chỉ tốn ~một lượt truy vấn.
      const runScan = async (pd) => {
        const build = (qy) => {
          const q2 = applyScanFilters(qy);
          if (!pd || !pd.ids.length) return q2;
          return pd.mode === 'in'
            ? q2.in('project_id', pd.ids)
            : q2.not('project_id', 'in', `(${pd.ids.join(',')})`);
        };
        const fetchBatch = async (from) => {
          const r = await build(supabase.from('unified_tasks_v').select(COLS)).range(from, from + 999);
          if (r.error) throw r.error;
          return r.data || [];
        };
        const hint = Math.min(Number(teamScanHint.get(cacheKey)) || 0, TEAM_TASKS_SCAN_CAP);
        const spec = new Map();
        for (let from = 1000, n = 0; from < hint && n < TEAM_TASKS_SCAN_WAVE; from += 1000, n += 1) {
          spec.set(from, fetchBatch(from).catch(() => null));
        }
        const first = await build(supabase.from('unified_tasks_v').select(COLS, { count: 'exact' })).range(0, 999);
        if (first.error) throw first.error;
        const rows = [...(first.data || [])];
        const scanTotal = Number(first.count) || rows.length;
        const truncated = scanTotal > TEAM_TASKS_SCAN_CAP;
        const total = Math.min(scanTotal, TEAM_TASKS_SCAN_CAP);
        if (truncated) {
          console.warn(`[work-tasks] team-project-tasks: ${scanTotal} dòng vượt trần quét ${TEAM_TASKS_SCAN_CAP} — số đếm chỉ tính phần đầu`);
        }
        if (total > 1000) {
          const starts = [];
          for (let from = 1000; from < total; from += 1000) starts.push(from);
          for (let i = 0; i < starts.length; i += TEAM_TASKS_SCAN_WAVE) {
            const wave = starts.slice(i, i + TEAM_TASKS_SCAN_WAVE);
            const parts = await Promise.all(wave.map(async (from) => {
              const pre = spec.has(from) ? await spec.get(from) : null;
              return pre || fetchBatch(from); // bắn sẵn lỗi/thiếu → lấy lại bình thường
            }));
            parts.forEach((p) => rows.push(...p));
          }
        }
        // Gợi ý thật dùng cho lần tính lại sau (không đổi kết quả, chỉ để bắn sớm).
        teamScanHint.set(cacheKey, scanTotal);
        if (teamScanHint.size > 100) teamScanHint.delete(teamScanHint.keys().next().value);
        return { rows, scanTotal, truncated };
      };

      let typedSet = null;
      let scan;
      if (typeRaw) {
        const typeKey = `${effectiveCompany || ''}|${typeRaw.toLowerCase()}`;
        const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
        const knownRaw = teamTypeScopeCache.get(typeKey);
        const known = knownRaw && knownRaw.typedSet.size ? knownRaw : null;
        const freshP = loadTypeScope();
        let fresh;
        if (known) {
          // Đã biết phạm vi lần trước → quét SỚM bằng phạm vi cũ, song song với việc lấy dự án mới. Chỉ dùng kết quả quét sớm
          // khi tập dự án của loại KHÔNG đổi (luôn lọc lại bằng tập mới nên không sai); đổi (dự án mới / đổi loại) thì quét lại.
          const [freshNow, early] = await Promise.all([freshP, runScan(known.pushdown)]);
          fresh = freshNow;
          scan = sameSet(fresh.typedSet, known.typedSet) ? early : null;
        } else {
          fresh = await freshP;
        }
        if (fresh.typedSet.size) teamTypeScopeCache.set(typeKey, fresh);
        if (teamTypeScopeCache.size > 30) teamTypeScopeCache.delete(teamTypeScopeCache.keys().next().value);
        typedSet = fresh.typedSet;
        // Loại không có dự án nào → không có việc nào, khỏi quét.
        if (!typedSet.size) return emptyTeamResult();
        if (!scan) scan = await runScan(fresh.pushdown);
      } else {
        scan = await runScan(null);
      }
      const { scanTotal, truncated } = scan;
      // Lọc lại theo tập dự án của loại (no-op với `in`; loại bỏ việc của dự án công ty khác khi dùng `not in`).
      // Cộng thêm việc `crm_task` của dự án công ty này nhưng deal thuộc công ty khác (không trùng dòng đã quét vì company_id khác).
      // Phần bổ sung: lỗi truy vấn thì bỏ qua (kết quả như trước đây) và ghi log, KHÔNG làm hỏng cả endpoint.
      const crossRows = await loadCrossCompanyCrmRows(typedSet).catch((err) => {
        console.warn('[work-tasks] team-project-tasks: bỏ qua việc crm của deal công ty khác —', err?.message || err);
        return [];
      });
      // Quét bổ sung theo DỰ ÁN nên cũng trả lại các dòng đã có ở lần quét chính (dự án nhiều deal, một deal thuộc công ty
      // khác: việc của deal cùng công ty bị lấy hai lần → mỗi việc hiện đôi, HCB · Tủ bếp thừa 27 việc ở TB-2026-1037/1038)
      // → chỉ thêm dòng CHƯA có theo `unified_id`.
      const knownIds = new Set(scan.rows.map((t) => t.unified_id));
      const crossNew = crossRows.filter((t) => !knownIds.has(t.unified_id));
      // Việc `tasks` đang chặn kéo cột: lấy thêm những việc nằm NGOÀI cửa sổ quét (không hạn / hạn xa, tạo từ lâu) để chúng không
      // biến mất khỏi tab trong khi cổng kéo cột vẫn đọc chúng. Không áp ở chế độ «không hạn» / khoảng hạn / lọc người (việc
      // này chưa ai nhận) — các chế độ đó có bộ lọc riêng.
      const blockingList = (noDeadlineMode || unassignedMode || dueRange || assignee_id) ? [] : await loadBlockingTasks(effectiveCompany, typedSet);
      const blockingIdSet = new Set(blockingList.map((b) => b.id));
      let blockingExtra = [];
      if (blockingList.length) {
        const haveTaskIds = new Set(scan.rows.filter((t) => t.source === 'task').map((t) => String(t.source_id)));
        const needleB = String(searchQ || '').trim().toLowerCase();
        const missing = blockingList.filter((b) => !haveTaskIds.has(b.id) && (!needleB || b.title.toLowerCase().includes(needleB)));
        if (missing.length) {
          blockingExtra = await fetchAllByIdsParallel({
            table: 'unified_tasks_v',
            columns: COLS,
            key: 'source_id',
            ids: missing.map((b) => b.id),
            idChunk: 100,
            tune: (q) => q.eq('source', 'task').order('unified_id', { ascending: true }),
          }).catch((err) => {
            console.warn('[work-tasks] team-project-tasks: bỏ qua việc chặn ngoài cửa sổ —', err?.message || err);
            return [];
          });
          blockingExtra = blockingExtra.filter((t) => TEAM_PROJECT_TASK_KINDS.includes(t.task_kind) && t.project_id && !knownIds.has(t.unified_id));
        }
      }
      const scanRowsBase = crossNew.length ? scan.rows.concat(crossNew) : scan.rows;
      const scanRows = blockingExtra.length ? scanRowsBase.concat(blockingExtra) : scanRowsBase;
      const typedRows = typedSet ? scanRows.filter((t) => typedSet.has(String(t.project_id))) : scanRows;
      // Chỉ giữ việc thuộc phạm vi sản xuất (xem `restrictToProductionScope`) — làm TRƯỚC khi lấy bản «song sinh» và khử
      // trùng để việc bán hàng / dự án ngoài phạm vi không lọt vào số đếm.
      const productionRows = await restrictToProductionScope(typedRows, effectiveCompany);
      // Lọc công ty đặt hàng (chỉ khi app gửi tham số) — dùng cùng nguồn với tab Dự án.
      const scopedRows = await restrictToDealCompany(productionRows, { req, effectiveCompany, dealCompanyQ, dealExtName });
      // `crm_task` chỉ tính ở các deal mà chi tiết dự án hiện (deal gốc + con) — dự án nhiều deal không đếm thừa.
      const detailLeads = await loadDetailLeadsByProject([...new Set(scopedRows.map((t) => String(t.project_id)))]);
      const scanned = scopedRows
        .filter((t) => crmRowInDetailLeads(t, detailLeads))
        // Đánh dấu việc đang chặn kéo cột để khử trùng / cửa sổ bên dưới giữ lại (xem `loadBlockingTasks`).
        .map((t) => (t.source === 'task' && blockingIdSet.has(String(t.source_id)) ? { ...t, blocks_stage_advance: true } : t));

      // Chip hạn xử lý: khử trùng phải thấy cả bản SX «song sinh» nằm NGOÀI khoảng. Nếu chỉ quét trong khoảng thì bản CRM
      // (hạn hôm nay) sống sót dù bản SX của chính việc đó đã quá hạn → việc quá hạn lọt vào «Hôm nay» / «Ngày mai».
      // Nên lấy thêm bản không phải crm_task của các dự án có việc CRM trong khoảng (mọi hạn), khử trùng rồi mới lọc lại khoảng.
      if (dueRange) {
        const crmProjectIds = [...new Set(scanned.filter((t) => t.source === 'crm_task').map((t) => String(t.project_id)))];
        if (crmProjectIds.length) {
          const chunks = [];
          for (let i = 0; i < crmProjectIds.length; i += 15) chunks.push(crmProjectIds.slice(i, i + 15));
          const twinParts = await Promise.all(chunks.map(async (ids) => {
            let tq = supabase.from('unified_tasks_v').select(COLS)
              .in('task_kind', TEAM_PROJECT_TASK_KINDS)
              .in('project_id', ids)
              .neq('source', 'crm_task')
              .order('unified_id', { ascending: true });
            tq = applyOpenOnlyFilter(tq);
            if (effectiveCompany) tq = tq.eq('company_id', effectiveCompany);
            if (assignee_id) tq = tq.eq('assignee_id', assignee_id);
            const needle = String(searchQ || '').trim();
            if (needle) tq = tq.ilike('title', `%${needle}%`);
            const r = await tq.range(0, 999);
            if (r.error) throw r.error;
            return r.data || [];
          }));
          const have = new Set(scanned.map((t) => t.unified_id));
          twinParts.forEach((p) => p.forEach((t) => { if (!have.has(t.unified_id)) { have.add(t.unified_id); scanned.push(t); } }));
        }
      }

      // Khử trùng: ưu tiên bản ở bảng `tasks` (source != crm_task). `scanned` đã chỉ gồm dự án của loại được chọn (nếu có lọc).
      // Một việc sản xuất có thể xuất hiện ở NHIỀU cột quy trình (cùng tên, mỗi cột một `crm_task`; chi tiết dự án liệt kê đủ
      // từng cái) trong khi bảng `tasks` chỉ có MỘT dòng cho tên đó. Nên khóa «dự án + tên» chỉ gom bản `tasks` với MỘT bản
      // `crm_task` (cặp song sinh); các `crm_task` còn lại là việc thật ở cột khác → giữ riêng, để số việc khớp chi tiết dự án
      // (trước đây gộp hết thành một: HCB · Tủ bếp mất 20 việc, vd. «Sơn» ×3 ở TB-2026-1013).
      const keyOf = (t) => `${t.project_id}|${String(t.title || '').trim().toLowerCase()}`;
      // KẾ THỪA người nhận: `crm_task` chưa có người nhận mà bản `tasks` cùng tên đã được giao → hiện người đó (chỉ hiển thị, không ghi).
      // Bản `tasks` có thể nằm ngoài cửa sổ quét nên đọc riêng theo dự án, không dựa vào `scanned`.
      const assigneeByKey = scanned.some((t) => t.source === 'crm_task' && !t.assignee_id)
        ? await loadTaskAssigneesByKey([...new Set(scanned.map((t) => String(t.project_id)))])
        : new Map();
      const scannedAll = scanned.map((t) => {
        if (t.source !== 'crm_task' || t.assignee_id) return t;
        const inherited = assigneeByKey.get(keyOf(t));
        return inherited ? { ...t, assignee_id: inherited, assignee_inherited: true } : t;
      });
      // Mục «Chưa giao» (Admin): việc đã có người nhận ở bản `tasks` không còn là «chưa giao».
      const scannedBase = unassignedMode ? scannedAll.filter((t) => !t.assignee_inherited) : scannedAll;
      const deadlineMsOrMax = (t) => (t.deadline ? new Date(t.deadline).getTime() : Number.MAX_SAFE_INTEGER);
      const groupsByKey = new Map();
      for (const t of scannedBase) {
        const k = keyOf(t);
        let g = groupsByKey.get(k);
        if (!g) { g = { task: null, crm: [] }; groupsByKey.set(k, g); }
        if (t.source === 'crm_task') g.crm.push(t);
        else if (!g.task) g.task = t; // nhiều dòng `tasks` cùng tên vẫn gom thành một như trước
      }
      const chosenRows = [];
      // Chế độ «Chưa giao»: KHÔNG ghép «song sinh» — mọi dòng chưa giao đều là một việc riêng; bản `tasks` đã có bản `crm_task` cùng
      // tên bị bỏ ở `dropTasksClosedOnDeal` (bản crm mới là việc thật; nếu nó chưa giao thì tự có mặt trong danh sách).
      // Khử trùng theo `unified_id`: view `unified_tasks_v` trả MỘT việc `tasks` thành nhiều dòng khi dự án có nhiều deal
      // (mỗi lead một dòng; HCB thừa ~3.400 dòng) — chế độ thường đã gom ở nhóm bên dưới, chế độ này thì không.
      if (unassignedMode) {
        const seenUnified = new Set();
        for (const t of scannedBase) {
          if (seenUnified.has(t.unified_id)) continue;
          seenUnified.add(t.unified_id);
          chosenRows.push(t);
        }
      } else for (const g of groupsByKey.values()) {
        // Có bản `tasks` → nó đại diện cho MỘT bản crm (bản hạn sớm nhất); phần còn lại giữ nguyên.
        const crmSorted = g.crm.slice().sort((a, b) => deadlineMsOrMax(a) - deadlineMsOrMax(b)
          || String(a.unified_id).localeCompare(String(b.unified_id)));
        // Bản `tasks` (tạo từ bộ mẫu, thường rất cũ) mang `created_at` của chính nó nên khi áp lại cửa sổ «mới tạo trong M ngày»
        // nó rơi ra ngoài, kéo theo việc `crm_task` mới tạo mà nó đại diện (TB-2026-898: 9/10 việc tạo hôm qua biến mất so với
        // chi tiết dự án). Cho bản đại diện thừa hưởng `created_at` của bản crm nó thay thế → số việc trong cửa sổ = số `crm_task`
        // trong cửa sổ, đúng như chi tiết dự án.
        if (g.task) {
          chosenRows.push(crmSorted.length && crmSorted[0].created_at
            ? { ...g.task, created_at: crmSorted[0].created_at }
            : g.task);
        }
        chosenRows.push(...(g.task ? crmSorted.slice(1) : crmSorted));
      }
      // Bỏ bản `tasks` còn «todo» mà bản `crm_task` cùng tên đã xong (chi tiết dự án coi là xong) — xem `dropTasksClosedOnDeal`.
      let rows = await dropTasksClosedOnDeal(chosenRows, detailLeads, { dropWithTwin: unassignedMode });
      // Hạn đã đổi theo `crm_task` → áp lại cửa sổ của lần quét (có hạn ≤ N ngày tới, HOẶC mới tạo trong M ngày): việc có hạn
      // xa hơn cửa sổ / không hạn mà tạo từ lâu rời khỏi danh sách như mọi việc khác. Chế độ khoảng hạn / «không hạn» có lọc riêng.
      if (!noDeadlineMode && !unassignedMode && !dueRange) {
        const untilMs = new Date(until).getTime();
        const createdSinceMs = new Date(createdSince).getTime();
        rows = rows.filter((t) => {
          if (t.blocks_stage_advance) return true; // việc chặn kéo cột: luôn hiện, bất kể hạn / ngày tạo
          const dl = t.deadline ? new Date(t.deadline).getTime() : null;
          if (dl != null && dl <= untilMs) return true;
          return createdDays > 0 && t.created_at && new Date(t.created_at).getTime() >= createdSinceMs;
        });
      }
      // Sau khi khử trùng mới áp khoảng hạn: chỉ giữ bản được chọn mà hạn của chính nó nằm trong khoảng.
      if (dueRange) {
        const fromMs = new Date(dueRange.from).getTime();
        const toMs = new Date(dueRange.to).getTime();
        rows = rows.filter((t) => {
          if (!t.deadline) return false;
          const ms = new Date(t.deadline).getTime();
          return ms >= fromMs && ms < toMs;
        });
      }

      // Việc đã giao người nhưng bản crm đã xong (`closed_on_deal`): vẫn hiện (cửa sổ / khoảng hạn đã xét ở trên theo hạn gốc) nhưng
      // KHÔNG tính quá hạn — hạn cũ của bản `tasks` đã hết ý nghĩa khi việc xong ở deal (khớp số quá hạn của chi tiết dự án).
      rows = rows.map((t) => (t.closed_on_deal && t.deadline ? { ...t, deadline: null } : t));

      let overdue = 0;
      let inProgress = 0;
      let noDeadline = 0;
      const groups = new Map();
      for (const t of rows) {
        // Việc không có hạn KHÔNG được coi là quá hạn (new Date(null) = 1970).
        const hasDeadline = !!t.deadline;
        const isOver = hasDeadline && new Date(t.deadline).getTime() < nowMs;
        if (isOver) overdue += 1;
        if (!hasDeadline) noDeadline += 1;
        if (String(t.status || '').toLowerCase() === 'in_progress') inProgress += 1;
        let g = groups.get(t.project_id);
        if (!g) { g = { firstDeadline: null, newestCreated: '', overdue: false, rows: [] }; groups.set(t.project_id, g); }
        if (isOver) g.overdue = true;
        if (hasDeadline && (g.firstDeadline == null || String(t.deadline) < String(g.firstDeadline))) g.firstDeadline = t.deadline;
        if (String(t.created_at || '') > g.newestCreated) g.newestCreated = String(t.created_at || '');
        g.rows.push(t);
      }
      // Thứ tự nhóm: (0) có việc quá hạn → (1) có việc sắp đến hạn → (2) chỉ có việc mới tạo chưa có hạn / hạn xa.
      // Nhóm 0–1 theo hạn gần nhất cũ → mới; nhóm 2 theo việc tạo MỚI NHẤT lên trước.
      const tierOf = (g) => (g.overdue ? 0 : g.firstDeadline != null && String(g.firstDeadline) <= until ? 1 : 2);
      const ordered = [...groups.values()].sort((a, b) => {
        // «Chưa giao»: dự án có việc mới tạo gần nhất lên trước (hạn cũ của việc mẫu không có ý nghĩa để xếp).
        if (unassignedMode) return String(b.newestCreated).localeCompare(String(a.newestCreated));
        const ta = tierOf(a); const tb = tierOf(b);
        if (ta !== tb) return ta - tb;
        if (ta === 2) return String(b.newestCreated).localeCompare(String(a.newestCreated));
        return String(a.firstDeadline).localeCompare(String(b.firstDeadline));
      });
      // «Giao việc» soi gương `crm_task` — app cộng cả hai nên báo id `crm_task` đã có giao việc mở để bỏ dòng trùng.
      const assignedCrmTaskIds = await loadAssignedCrmTaskIds(
        rows.filter((t) => t.source === 'crm_task').map(crmTaskIdOf),
      );
      return {
        ordered,
        assignedCrmTaskIds,
        counts: {
          overdue,
          soon: rows.length - overdue,
          total: rows.length,
          in_progress: inProgress,
          no_deadline: noDeadline,
          groups: ordered.length,
          // true = bộ lọc khớp nhiều dòng hơn trần quét nên số đếm chỉ tính phần đầu (xem TEAM_TASKS_SCAN_CAP).
          truncated,
          scan_total: scanTotal,
        },
      };
    };

    const cacheKey = JSON.stringify([
      effectiveCompany || '', assignee_id || '', String(req.query.workshop_type_id || ''),
      String(searchQ || '').trim(), dueDays, createdDays, noDeadlineMode, unassignedMode, dueFromRaw, dueToRaw,
      dealCompanyQ, dealExtName.toLowerCase(), req.user?.company_id || '', isSystemAdmin(req.user) ? 'sys' : '',
      req.tenantId || '',
    ]);
    let computed = teamTasksCache.get(cacheKey);
    if (!computed || Date.now() - computed.at > TEAM_TASKS_CACHE_MS) {
      computed = { at: Date.now(), ...(await computeTeamTasks()) };
      teamTasksCache.set(cacheKey, computed);
      if (teamTasksCache.size > 30) teamTasksCache.delete(teamTasksCache.keys().next().value);
    }
    const { ordered, counts, assignedCrmTaskIds } = computed;

    const start = (page - 1) * pageSize;
    const pageGroups = ordered.slice(start, start + pageSize);
    const pageTasks = pageGroups.flatMap((g) => g.rows);
    // `lite=1` (app mobile): chỉ cần `assignee_name` — bỏ `enrichTaskModuleOwners` (3 đợt truy vấn nối tiếp ~450ms mỗi lần
    // gọi, kể cả trúng cache) vốn tính thêm module_owner_*, effective_assignee_*, region_id mà app không dùng.
    const lite = ['1', 'true'].includes(String(req.query.lite || '').toLowerCase());
    let tasks;
    if (lite) {
      const assigneeIds = [...new Set(pageTasks.map((t) => t.assignee_id).filter(Boolean).map(String))];
      const [enriched, names] = await Promise.all([
        enrichUnifiedCrmTasks(supabase, pageTasks),
        lookupUserNames(assigneeIds),
      ]);
      tasks = enriched;
      for (const t of tasks) t.assignee_name = t.assignee_id ? (names.get(String(t.assignee_id)) ?? null) : null;
    } else {
      tasks = await enrichUnifiedCrmTasks(supabase, pageTasks);
      await enrichTaskModuleOwners(tasks);
    }

    res.json({
      counts,
      page,
      page_size: pageSize,
      has_more: start + pageSize < ordered.length,
      // id `crm_task` (cả mọi trang) đang có «Giao việc» mở soi gương — app bỏ dòng giao việc trùng.
      assigned_crm_task_ids: assignedCrmTaskIds || [],
      tasks,
    });
  } catch (e) {
    console.error('[work-tasks] team-project-tasks:', e);
    res.status(500).json({ error: e.message || 'Lỗi tải việc dự án của đội' });
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
    const deadlineMs = task.deadline
      ? (companyWorkEndMsFromRaw(task.deadline, task.company_id) ?? new Date(task.deadline).getTime())
      : null;
    if (deadlineMs != null && Number.isFinite(deadlineMs)) {
      if (deadlineMs < nowMs) stats.overdue += 1;
      else if (deadlineMs <= warningMs) stats.warning += 1;
    }
  });
  return res.json({
    tasks,
    stats,
    filter_options: {
      companies: preloaded?.companies?.length
        ? (preloaded.companies.filter((row) => companyIds.includes(String(row.id))))
        : companies,
      // Đủ khu vực của các công ty đang có nhiệm vụ — không chỉ những KV đã gắn trên thẻ.
      regions: preloaded?.regions?.length
        ? preloaded.regions.filter((row) => companyIds.includes(String(row.company_id || '')))
        : regions,
    },
  });
}

r.get('/project-overview', async (req, res) => {
  try {
    const requestedProjectId = String(req.query.project_id || '').trim();
    const requestedCompany = String(req.query.company_id || '').trim();
    const requestedDealCompany = String(req.query.deal_company_id || '').trim();
    const requestedDealExtName = String(req.query.deal_external_company_name || '').trim();
    // Phân loại xưởng (`projects.workshop_type_id`): mã loại hoặc `none` (chưa phân loại) — cùng quy ước với `team-project-tasks`.
    const requestedWorkshopType = String(req.query.workshop_type_id || '').trim();
    // include_children=1: kèm danh sách VIỆC CON của từng thẻ (app mobile mở nhiệm vụ ở màn «Quá hạn & Hôm nay»). Mặc định tắt
    // để các nơi gọi hiện có (web, tổng quan) không phải nhận thêm dữ liệu.
    const includeChildren = ['1', 'true'].includes(String(req.query.include_children || '').toLowerCase());
    const effectiveCompany = isSystemAdmin(req.user)
      ? (requestedCompany || null)
      : (req.user?.company_id || null);
    const requestedModule = ['crm', 'sx', 'vc'].includes(String(req.query.module || '').toLowerCase())
      ? String(req.query.module).toLowerCase()
      : '';
    // Trang «Quản lý nhiệm vụ Sản xuất» (module=sx): việc con lấy từ `crm_task` như «Theo dự án» (xem `buildCrmSxOverviewChildren`).
    // `source=tasks` quay về cách cũ (việc con từ bảng `tasks`) để đối chiếu / lùi khi cần.
    const legacyOverviewSource = String(req.query.source || '').toLowerCase() === 'tasks';
    const crmSxMode = requestedModule === 'sx' && !legacyOverviewSource;
    /**
     * Bốn bảng tra cứu này rất nhỏ (222 + 97 + 9 + 12 = 340 dòng) nhưng trước đây được
     * đọc ở CUỐI đường tới hạn, sau khi đã gom đủ id — đo được ~400ms chỉ để chờ. Nạp
     * trọn ngay từ đầu, song song với projects: cùng dữ liệu, chỉ khác thời điểm.
     */
    const lookupsPromise = Promise.all([
      fetchAllPages(() => supabase.from('crm_pipeline_stages').select('id, name, order_index').order('id')),
      fetchAllPages(() => supabase.from('workshop_task_templates').select('id, name, workshop_area, order_index, production_stage_id').order('id')),
      fetchAllPages(() => supabase.from('companies').select('id, name, short_name').order('id')),
      fetchAllPages(() => supabase.from('company_regions').select('id, company_id, name, code').order('id')),
    ]);

    const PROJECT_OVERVIEW_PROJECT_SELECT = `
          id, status, company_id, sx_kanban_column_id, vc_kanban_column_id, logistics_company_id,
          project_manager_id, sales_person_id, responsible_person_id,
          production_person_id, logistics_person_id, installer_person_id, installation_person_id,
          deadline, production_deadline, production_finish_date, sx_kanban_deadline_at,
          delivery_date, install_date, sx_reception_date, created_at, sx_schedule_slip_days, workshop_type_id, code, name
        `;
    let activeProjects;
    if (requestedProjectId) {
      const access = await assertProjectAccessible(req, res, requestedProjectId, {
        operation: 'READ',
        mode: 'company',
      });
      if (!access) return;
      const { data: one, error: oneErr } = await supabase
        .from('projects')
        .select(PROJECT_OVERVIEW_PROJECT_SELECT)
        .eq('id', requestedProjectId)
        .maybeSingle();
      if (oneErr) throw oneErr;
      activeProjects = one ? [one] : [];
    } else {
      const projects = await fetchAllPages(() => {
        let q = supabase
          .from('projects')
          .select(PROJECT_OVERVIEW_PROJECT_SELECT)
          .order('id');
        if (effectiveCompany) q = q.eq('company_id', effectiveCompany);
        else q = applyCompanyTenantScope(q, req);
        return q;
      });
      activeProjects = (projects || []).filter((project) => (
        !['completed', 'cancelled', 'canceled'].includes(String(project.status || '').toLowerCase())
      ));
      if (requestedWorkshopType) {
        const wantNone = requestedWorkshopType.toLowerCase() === 'none';
        const wantType = requestedWorkshopType.toLowerCase();
        activeProjects = activeProjects.filter((project) => (wantNone
          ? !project.workshop_type_id
          : String(project.workshop_type_id || '').toLowerCase() === wantType));
      }
    }
    const projectIds = activeProjects.map((project) => project.id).filter(Boolean);

    const needsCrmLeads = !requestedModule || requestedModule === 'crm';
    const needsSxStages = requestedModule !== 'vc';
    const needsVcStages = !requestedModule || requestedModule === 'vc';
    const [sxStagesRes, vcStagesRes, leads] = await Promise.all([
      needsSxStages
        ? supabase.from('production_pipeline_stages').select(
          'id, name, order_index, bucket_slug, is_handover_to_logistics, counts_as_completed_revenue, counts_as_collected_revenue, deadline_group, group_key, company_id',
        )
        : Promise.resolve({ data: [], error: null }),
      needsVcStages
        ? supabase.from('logistics_pipeline_stages').select('id, name, order_index, bucket_slug')
        : Promise.resolve({ data: [], error: null }),
      projectIds.length
        ? fetchAllByIdsParallel({
          table: 'crm_leads',
          columns: `
            id, project_id, company_id, region_id, assigned_to, lead_owner_id,
            phone, kanban_deadline_at, stage_entered_at, expected_close_date, deadline_disabled_at,
            stage:crm_pipeline_stages!crm_leads_stage_id_fkey(
              id, name, canonical_slug, is_won, is_lost, counts_as_completed_revenue, sla_days, deal_report_bucket
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
    if (requestedDealCompany || requestedDealExtName) {
      // Cùng quy tắc với app (tab Công việc / Dự án / Kanban): deal có `company_id`, `external_company_id` hoặc tên khách khớp.
      // Trước đây chỉ so `company_id` của deal nên bỏ sót dự án đặt hàng qua `external_company_id` (vd. VPT đặt tại HCB).
      const dealProjectIds = await dealCompanyProjectIdSet({
        req,
        effectiveCompany,
        dealCompanyQ: requestedDealCompany,
        dealExtName: requestedDealExtName,
        candidateProjectIds: activeProjects.map((project) => project.id),
      });
      if (dealProjectIds) {
        activeProjects = activeProjects.filter((project) => dealProjectIds.has(String(project.id)));
      }
    }
    const projectById = new Map(activeProjects.map((project) => [String(project.id), project]));
    const leadById = new Map((leads || []).map((lead) => [String(lead.id), lead]));
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
      if (!requestedProjectId && effectiveCompany) q = q.eq('company_id', effectiveCompany);
      // Trang dự án đang mở: lấy đủ cụm của hồ sơ. Trang quản lý nhiệm vụ: vẫn lọc NV.
      if (!requestedProjectId && !isManagerLike(req.user)) q = applyEmployeeScope(q, req.user.userId);
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

    const sxCrmSyncPromise = (!requestedModule || requestedModule === 'sx') && (leads || []).length
      ? fetchAllByIdsParallel({
        table: 'crm_tasks',
        columns: 'id, lead_id, title, status, stage_slug, production_pipeline_stage_id, assignee_id, deadline',
        key: 'lead_id',
        ids: (leads || []).map((lead) => lead.id).filter(Boolean),
        tune: (q) => q.or('stage_slug.like.sx_%,production_pipeline_stage_id.not.is.null').order('id'),
        idChunk: 40,
        chunkConcurrency: 12,
      }).catch((syncErr) => {
        console.warn('[work-tasks] sx crm sync:', syncErr.message);
        return [];
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
    const installEventsPromise = (!requestedModule || requestedModule === 'vc') && activeProjects.length
      ? attachInstallEventDatesToProjects(activeProjects).catch((e) => {
        console.warn('[work-tasks] attach install events:', e.message);
        return activeProjects;
      })
      : Promise.resolve(activeProjects);

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

    const [crmTasks, productionTasks, logisticsTasks, productionStaffRows, projectsWithInstall, sxCrmRows] = await Promise.all([
      crmTasksPromise, productionTasksPromise, logisticsTasksPromise, productionStaffPromise, installEventsPromise, sxCrmSyncPromise,
    ]);
    if (Array.isArray(projectsWithInstall) && projectsWithInstall.length) {
      projectsWithInstall.forEach((project) => {
        if (project?.id) projectById.set(String(project.id), project);
      });
    }

    // Kanban / Hạn của trang Sản xuất: việc con từ `crm_task` (xem `buildCrmSxOverviewChildren`). Lỗi → giữ cách cũ (bảng `tasks`)
    // + log, KHÔNG làm hỏng cả endpoint.
    let productionRows = productionTasks;
    let crmSxDetails = null;
    let crmSxProjects = new Set();
    if (crmSxMode) {
      try {
        const productionProjectIdSet = new Set(productionProjectIds.map(String));
        const crmLeadProject = new Map(
          (leads || []).filter((lead) => lead?.id && lead?.project_id).map((lead) => [String(lead.id), String(lead.project_id)]),
        );
        const detailLeadsForOverview = await loadDetailLeadsByProject([...productionProjectIdSet]);
        const blockingList = await loadBlockingTasks(effectiveCompany, null);
        const built = buildCrmSxOverviewChildren({
          tasksRows: productionTasks,
          sxCrmRows,
          leadProjectById: crmLeadProject,
          detailLeads: detailLeadsForOverview,
          projectById: new Map(
            activeProjects.filter((p) => productionProjectIdSet.has(String(p.id))).map((p) => [String(p.id), p]),
          ),
          blockingTaskIds: new Set(blockingList.map((b) => b.id)),
        });
        productionRows = built.children;
        crmSxDetails = built.crmDetails;
        crmSxProjects = built.projectsWithCrmSx;
      } catch (crmSxErr) {
        console.warn('[work-tasks] project-overview: dùng nguồn crm_task lỗi, quay về bảng tasks —', crmSxErr?.message || crmSxErr);
        productionRows = productionTasks;
        crmSxDetails = null;
      }
    }

    const merged = new Map();
    [...crmTasks, ...productionRows, ...logisticsTasks].forEach((task) => {
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
      leads,
      productionStaff: productionStaffRows,
    });

    // Đã bắt đầu đọc từ lúc từng nguồn nhiệm vụ xong (xem trên) — ở đây chỉ chờ kết quả.
    const [projectTaskDetails, crmTaskDetails] = await Promise.all([
      projectTaskDetailsPromise, crmTaskDetailsPromise,
    ]);
    const projectDetailById = new Map(projectTaskDetails.map((row) => [String(row.id), row]));
    const crmDetailById = new Map(crmTaskDetails.map((row) => [String(row.id), row]));
    if (crmSxDetails) crmSxDetails.forEach((detail, id) => crmDetailById.set(id, detail));
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
      // Kanban nguồn `crm_task`: việc `tasks` không có bản crm của dự án đã có việc SX ở deal → nhóm riêng (dự án chưa có việc SX ở
      // deal thì giữ danh mục theo bộ mẫu như cũ để không mất cấu trúc).
      if (crmSxDetails && task.source === 'task' && crmSxProjects.has(String(task.project_id))) {
        return { id: WORKSHOP_OWN_CATEGORY_ID, title: WORKSHOP_OWN_CATEGORY_TITLE, order: 900 };
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

    const sxStageList = [...sxStageById.values()];
    const leadProjectById = new Map(
      (leads || []).map((lead) => [String(lead.id), String(lead.project_id || '')]),
    );
    const sxCrmIndex = indexSxCrmCompletion(sxCrmRows, leadProjectById);

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

    const stampRows = [];
    const tasks = [...groupMap.values()].map((group) => {
      const childDone = (task) => (
        group.lane === 'production' && !(crmSxDetails && task.source === 'crm_task')
          ? workshopChildDone(task, sxCrmIndex)
          : terminalStatuses.has(String(task.status || '').toLowerCase())
      );
      const completedChildren = group.children.filter(childDone);
      const openChildren = group.children.filter((task) => !childDone(task));
      if (!openChildren.length) return null;
      const first = openChildren[0] || group.children[0];
      const assigned = openChildren.find((task) => task.effective_assignee_id) || null;
      const project = projectById.get(String(first.project_id || '')) || null;
      const lead = leadById.get(String(first.lead_id || '')) || null;
      let deadline = null;
      if (group.lane === 'production' && crmSxDetails) {
        // Nguồn `crm_task`: hạn THẬT = hạn sớm nhất của các việc con còn mở (như «Theo dự án» / app) — không dùng hạn kế hoạch của
        // nhóm (trước đây hầu hết thẻ cùng một mốc kế hoạch nên «Quá hạn» luôn 0). Không việc nào có hạn → «Chưa có hạn».
        const openMs = openChildren
          .map((child) => (child.deadline ? new Date(child.deadline).getTime() : NaN))
          .filter((ms) => Number.isFinite(ms));
        deadline = openMs.length ? new Date(Math.min(...openMs)).toISOString() : null;
      } else if (group.lane === 'production') {
        const col = project ? sxStageById.get(String(project.sx_kanban_column_id || '')) : null;
        deadline = (col && computeSxInstallPlanDeadline(project, col, sxStageList)?.iso) || null;
        if (!deadline && !col) {
          const planGroups = [];
          for (const child of openChildren) {
            const planGroup = deadlineGroupForWorkshopChild(child, sxCrmIndex, sxStageById);
            if (planGroup) planGroups.push(planGroup);
          }
          deadline = earliestSxPlanDeadline(project, planGroups);
        }
      } else {
        deadline = resolveOverviewGroupDeadline({
          lane: group.lane,
          project,
          lead,
          sxStage: project ? sxStageById.get(String(project.sx_kanban_column_id || '')) : null,
          vcStage: project ? vcStageById.get(String(project.vc_kanban_column_id || '')) : null,
          openChildren,
        });
        stampRows.push(...collectOpenChildDeadlineStamps(deadline, openChildren));
        // CRM không có hạn module: hiện cùng mốc lịch lắp với thẻ Sản xuất, chỉ để xếp cột.
        if (!deadline && group.lane === 'sales' && project) {
          const col = sxStageById.get(String(project.sx_kanban_column_id || ''));
          deadline = (col && computeSxInstallPlanDeadline(project, col, sxStageList)?.iso) || null;
          if (!deadline) deadline = project.install_date || project.delivery_date || null;
        }
      }
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
        deadline,
        child_completed: completedChildren.length,
        child_total: group.children.length,
        assignee_id: assigned?.effective_assignee_id || null,
        assignee_name: assigned?.effective_assignee_name || null,
        module_owner_id: first.module_owner_id || null,
        module_owner_name: first.module_owner_name || null,
        effective_assignee_id: assigned?.effective_assignee_id || first.module_owner_id || null,
        effective_assignee_name: assigned?.effective_assignee_name || first.module_owner_name || null,
        ...(includeChildren ? {
          // Việc chưa xong lên trước, rồi theo hạn gần nhất; `done` dùng đúng quy tắc đếm `child_completed` của thẻ.
          children: group.children
            .map((child) => ({
              unified_id: child.unified_id,
              source: child.source,
              source_id: child.source_id,
              title: child.title,
              status: child.status,
              deadline: child.deadline || null,
              done: childDone(child),
              assignee_name: child.effective_assignee_name || child.assignee_name || null,
            }))
            .sort((a, b) => Number(a.done) - Number(b.done)
              || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'))),
        } : {}),
      };
    }).filter(Boolean);
    if (stampRows.length) {
      try {
        const { isStampOpenTaskDeadlinesEnabled } = require('../jobs/projectDeadlineDispatch');
        if (await isStampOpenTaskDeadlinesEnabled()) {
          await stampOpenChildModuleDeadlines(stampRows);
        }
      } catch (stampErr) {
        console.warn('[work-tasks] stamp module deadline:', stampErr.message);
      }
    }
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

    /**
     * NV xem việc ĐƯỢC GIAO CHO CHÍNH MÌNH (assignee_id = mình, không chỉ định company_id): không lọc theo công ty.
     * View `unified_tasks_v` gán company_id của việc crm_tasks theo công ty của DEAL, nên dự án sản xuất cho
     * xưởng của NV nhưng deal thuộc công ty khác (vd. Vạn Phú Thành) bị mất việc. Quyền vẫn do
     * `applyEmployeeScope` (assignee/created_by = mình) giữ chặt — chỉ bỏ ràng buộc công ty.
     */
    const viewerId = String(req.user?.userId || req.user?.id || '');
    const ownTasksView = !company_id && !lead_id && !!assignee_id && !!viewerId
      && String(assignee_id) === viewerId;
    const resolveEffectiveCompany = () => (ownTasksView
      ? null
      : (company_id || (!isSystemAdmin(req.user) ? req.user?.company_id : null)));

    // opts.leadScoped = true khi đường gọi đã bám theo lead (region lead ids) —
    // khi đó KHÔNG lọc is_primary_lead, nếu không task của lead thứ 2 biến mất.
    const applyListFilters = (q, opts = {}) => {
      if (source) {
        const sources = String(source).split(',').map((s) => s.trim()).filter((s) => VALID_SOURCES.has(s));
        if (sources.length === 1) q = q.eq('source', sources[0]);
        else if (sources.length > 1) q = q.in('source', sources);
      }
      if (project_id) q = q.eq('project_id', project_id);
      const effectiveCompany = resolveEffectiveCompany();
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
      const effectiveCompany = resolveEffectiveCompany();
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

/**
 * Nhắc một nhóm việc SX khi thẻ Kanban lấy việc con từ `crm_task` (xem `buildCrmSxOverviewChildren`). Trả `true` nếu đã xử lý
 * (đã trả lời HTTP), `false` nếu nhóm này không phải nhóm `crm_task` → để luồng cũ (bảng `tasks`) xử lý.
 * Người nhận: người được giao của việc, hoặc người của bản `tasks` cùng tên (kế thừa), hoặc phụ trách module — KHÔNG ghi `assignee_id`
 * (luồng cũ tự gán phụ trách xuống bảng `tasks`; với `crm_task` không làm vậy để khỏi gán hàng loạt ngoài ý muốn).
 */
/**
 * Việc con của một danh mục khi nguồn SX là `crm_task` (Kanban nguồn mới).
 * Tách riêng để cả nút «Nhắc» lẫn nút xổ việc trên thẻ dùng chung một cách gom nhóm —
 * hai nơi tự gom sẽ lệch nhau ngay lần đổi quy tắc danh mục kế tiếp.
 */
async function loadCrmSxCategoryTasks({ projectId, categoryId }) {
  const detailLeads = await loadDetailLeadsByProject([projectId]);
  const leadIds = [...(detailLeads.get(String(projectId)) || [])];
  if (!leadIds.length) return null;
  const crmRows = await fetchAllByIdsParallel({
    table: 'crm_tasks',
    columns: 'id, lead_id, title, status, stage_slug, production_pipeline_stage_id, assignee_id',
    key: 'lead_id',
    ids: leadIds,
    tune: (q) => q.or('stage_slug.like.sx_%,production_pipeline_stage_id.not.is.null').order('id'),
  });
  const open = crmRows.filter((row) => !DONE_REMIND_STATUSES.has(String(row.status || '').toLowerCase()));
  const detailById = new Map(open.map((row) => [String(row.id), {
    id: String(row.id),
    stage_slug: row.stage_slug || null,
    production_pipeline_stage_id: row.production_pipeline_stage_id || null,
    pipeline_stage_id: null,
  }]));
  const matching = open.filter((row) => (
    projectOverviewCategoryId({ source: 'crm_task', source_id: row.id }, new Map(), detailById) === categoryId
  ));
  if (!matching.length) return null;

  const [taskRows, projectRows] = await Promise.all([
    fetchAllByIdsParallel({
      table: 'tasks',
      columns: 'id, project_id, title, assignee_id, status',
      key: 'project_id',
      ids: [projectId],
      tune: (q) => q.neq('status', 'done').order('id'),
    }),
    fetchAllByIdsParallel({
      table: 'projects', columns: 'id, code, name', key: 'id', ids: [projectId], tune: (q) => q.order('id'),
    }),
  ]);
  const normTitle = (v) => String(v || '').trim().toLowerCase();
  const inheritedByTitle = new Map();
  taskRows.forEach((row) => {
    const key = normTitle(row.title);
    if (row.assignee_id && key && !inheritedByTitle.has(key)) inheritedByTitle.set(key, row.assignee_id);
  });
  const project = projectRows[0] || {};
  const tasks = matching.map((row) => ({
    unified_id: `crm_task:${row.id}`,
    source: 'crm_task',
    source_id: String(row.id),
    project_id: projectId,
    lead_id: String(row.lead_id),
    title: row.title,
    status: row.status,
    assignee_id: row.assignee_id || inheritedByTitle.get(normTitle(row.title)) || null,
    task_kind: 'SX',
    project_code: project.code || null,
    project_name: project.name || null,
  }));
  await enrichTaskModuleOwners(tasks);
  return { tasks, project };
}

async function remindCrmSxCategory(req, res, { projectId, categoryId, categoryTitle }) {
  const found = await loadCrmSxCategoryTasks({ projectId, categoryId });
  if (!found) return false;
  const { tasks, project } = found;
  const targets = new Set();
  tasks.forEach((task) => {
    const targetId = task.assignee_id || task.module_owner_id;
    if (targetId) targets.add(String(targetId));
  });
  if (!targets.size) {
    res.status(400).json({ error: 'Dự án chưa có người chịu trách nhiệm. Vui lòng gán phụ trách dự án trước khi nhắc.' });
    return true;
  }
  const actorId = String(req.user.userId || req.user.id || '');
  const actorName = req.user.full_name || req.user.email || 'Quản lý';
  const projectCode = project.code || 'dự án';
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
      module_label: 'Sản xuất',
    },
  });
  res.json({
    ok: true, sent: result.sent, recipient_count: result.recipient_count, assigned_count: 0,
  });
  return true;
}

/**
 * Việc con của một danh mục trên thẻ «Quản lý nhiệm vụ dự án» (nguồn `tasks` / `crm_task` cũ).
 * Dùng chung cho nút «Nhắc» và nút xổ việc trên thẻ — xem `loadCrmSxCategoryTasks` cho nguồn SX mới.
 */
async function loadProjectOverviewGroupTasks({ projectId, categoryId, lane }) {
  const source = lane === 'sales' ? 'crm_task' : 'task';
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
  // Nhóm «Việc xưởng riêng» của Kanban nguồn `crm_task`: việc ở bảng `tasks` KHÔNG có bản `crm_task` cùng tên.
  const isOwnGroup = lane === 'production' && categoryId === WORKSHOP_OWN_CATEGORY_ID;
  let tasks;
  if (isOwnGroup) {
    const detailLeadsOwn = await loadDetailLeadsByProject([projectId]);
    const ownLeadIds = [...(detailLeadsOwn.get(String(projectId)) || [])];
    const crmTitleRows = ownLeadIds.length
      ? await fetchAllByIdsParallel({
        table: 'crm_tasks',
        columns: 'id, lead_id, title, stage_slug, production_pipeline_stage_id',
        key: 'lead_id',
        ids: ownLeadIds,
        tune: (q) => q.or('stage_slug.like.sx_%,production_pipeline_stage_id.not.is.null').order('id'),
      })
      : [];
    const crmTitles = new Set(crmTitleRows.map((row) => String(row.title || '').trim().toLowerCase()));
    tasks = candidateTasks.filter((task) => (
      taskOwnerLane(task) === lane && !crmTitles.has(String(task.title || '').trim().toLowerCase())
    ));
  } else {
    tasks = candidateTasks.filter((task) => (
      taskOwnerLane(task) === lane
      && projectOverviewCategoryId(task, projectDetailById, crmDetailById) === categoryId
    ));
  }
  return tasks;
}

// GET /api/work-tasks/project-overview/children — việc con của một thẻ danh mục trên Kanban nhiệm vụ dự án
r.get('/project-overview/children', async (req, res) => {
  try {
    const projectId = String(req.query.project_id || '').trim();
    const categoryId = String(req.query.category_id || '').trim();
    const lane = String(req.query.owner_lane || '').trim();
    if (!projectId || !categoryId || !['sales', 'production', 'logistics'].includes(lane)) {
      return res.status(400).json({ error: 'Thiếu dự án hoặc danh mục nhiệm vụ' });
    }
    const access = await assertProjectAccessible(req, res, projectId, { operation: 'READ', mode: 'company' });
    if (!access) return;

    // Nguồn SX mới gom theo `crm_task`; không khớp thì rơi về nguồn cũ (`tasks`).
    if (lane === 'production') {
      const found = await loadCrmSxCategoryTasks({ projectId, categoryId });
      if (found?.tasks?.length) return res.json({ tasks: found.tasks });
    }
    const tasks = await loadProjectOverviewGroupTasks({ projectId, categoryId, lane });
    await enrichTaskModuleOwners(tasks);
    res.json({ tasks });
  } catch (e) {
    console.error('[work-tasks] project-overview/children:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
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
    const categoryTitle = String(req.body?.title || 'Nhiệm vụ dự án').trim().slice(0, 160);
    if (!projectId || !categoryId || !['sales', 'production', 'logistics'].includes(lane)) {
      return res.status(400).json({ error: 'Thiếu dự án hoặc danh mục nhiệm vụ cần nhắc' });
    }
    const access = await assertProjectAccessible(req, res, projectId, { operation: 'WRITE', mode: 'company' });
    if (!access) return;

    // Nhóm việc SX lấy từ `crm_task` (Kanban nguồn mới) → nhắc theo `crm_task`; không phải nhóm đó thì rơi xuống luồng cũ (`tasks`).
    if (lane === 'production' && await remindCrmSxCategory(req, res, { projectId, categoryId, categoryTitle })) return;

    const tasks = await loadProjectOverviewGroupTasks({ projectId, categoryId, lane });
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
      // Nhóm «Việc xưởng riêng» chỉ NHẮC, không tự gán phụ trách xuống bảng `tasks` (tránh gán hàng loạt ngoài ý muốn).
      if (!task.assignee_id && !isOwnGroup) {
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
