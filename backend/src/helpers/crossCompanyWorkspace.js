const { supabase } = require('../config/supabase');

function isSxTaskSlug(stageSlug) {
  return String(stageSlug || '').startsWith('sx_');
}

/**
 * Công ty thực hiện: từ mẫu hoặc NULL (= chủ dự án).
 */
function resolveExecutorCompanyId(templateItem, ownerCompanyId) {
  const exec = templateItem?.executor_company_id;
  if (exec) return String(exec);
  return ownerCompanyId ? String(ownerCompanyId) : null;
}

/** Nhiệm vụ giao cho công ty khác chủ deal/dự án (executor_company_id khác owner). */
function isCrossCompanyDelegatedTask(task, ownerCompanyId) {
  const exec = task?.executor_company_id || null;
  if (!exec) return false;
  if (!ownerCompanyId) return true;
  return String(exec) !== String(ownerCompanyId);
}

/** Mục checklist giao cho công ty khác chủ dự án. */
function filterDelegatedChecklistItems(task, ownerCompanyId) {
  const list = Array.isArray(task?.checklist) ? task.checklist : [];
  return list.filter((ck) => {
    if (!ck || typeof ck !== 'object') return false;
    const exec = ck.executor_company_id || null;
    if (!exec) return false;
    if (!ownerCompanyId) return true;
    return String(exec) !== String(ownerCompanyId);
  });
}

function checklistHasCrossCompanyExecutor(task, ownerCompanyId) {
  return filterDelegatedChecklistItems(task, ownerCompanyId).length > 0;
}

/** Nhiệm vụ hoặc mục checklist được giao ngoài công ty chủ. */
function hasCrossCompanyDelegation(task, ownerCompanyId) {
  return isCrossCompanyDelegatedTask(task, ownerCompanyId)
    || checklistHasCrossCompanyExecutor(task, ownerCompanyId);
}

/**
 * Lọc nhiệm vụ theo phạm vi công ty:
 * - own + chủ dự án: toàn bộ nhiệm vụ SX + checklist (tab Công việc / Nhiệm vụ)
 * - own + đối tác: chỉ nhiệm vụ giao trực tiếp (executor = công ty user)
 * - shared: chỉ nhiệm vụ / checklist giao chéo (không gian chung)
 * ownerCompanyId: công ty chủ dự án/xưởng (ưu tiên hơn lead.company_id CRM)
 */
function filterCrmTasksByCompanyScope(tasks, {
  scope, userCompanyId, leadCompanyId, ownerCompanyId, executorScopedOnly = false,
}) {
  const list = Array.isArray(tasks) ? tasks : [];
  // Grant executor-scope (không phải chủ dự án / owner / participant / admin):
  // chỉ được thấy đúng task giao đích danh công ty mình — kể cả task non-SX.
  // Chống rò task thương mại / task công ty khác qua một grant lead-wide.
  if (executorScopedOnly) {
    if (!userCompanyId) return [];
    return list.filter((t) => String(t.executor_company_id || '') === String(userCompanyId));
  }
  const mode = String(scope || 'own').toLowerCase();
  const ownerId = ownerCompanyId || leadCompanyId || null;
  if (mode === 'shared') {
    return list.filter((t) => hasCrossCompanyDelegation(t, ownerId));
  }
  if (mode === 'all') return list;
  if (!userCompanyId) return list;

  const isOwnerUser = ownerId && String(userCompanyId) === String(ownerId);

  return list.filter((t) => {
    if (!isSxTaskSlug(t.stage_slug)) return true;
    // Chủ dự án — tab Công việc: thấy hết (kể cả NV giao cho đối tác + checklist nội bộ)
    if (isOwnerUser) return true;
    // Đối tác — tab Công việc: chỉ nhiệm vụ giao cả task (checklist-only → không gian chung)
    const exec = t.executor_company_id || null;
    return exec && String(exec) === String(userCompanyId);
  });
}

/**
 * project_id mà công ty có nhiệm vụ sx_* được giao thực hiện (không phải chủ dự án).
 */
const EXEC_IDS_PAGE = 1000;
const EXEC_IDS_HARD_CAP = 200000;
/** Số id tối đa nhét vào một `.in(...)`: URL PostgREST hỏng từ khoảng 600 UUID. */
const EXEC_IN_CHUNK = 300;

/** Nạp hết các trang; ném lỗi ra ngoài như truy vấn đơn. */
async function fetchAllPagesOrThrow(buildPage, hardCap = EXEC_IDS_HARD_CAP) {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildPage(from, from + EXEC_IDS_PAGE - 1);
    if (error) throw error;
    const chunk = data || [];
    out.push(...chunk);
    if (chunk.length < EXEC_IDS_PAGE) break;
    from += EXEC_IDS_PAGE;
    if (from >= hardCap) break;
  }
  return out;
}

async function getExecutorProjectIdsForCompany(companyId) {
  if (!companyId) return [];
  // Thiếu .range() thì PostgREST cắt im lặng ở 1000 dòng — xưởng nhiều việc sẽ mất
  // dự án đối tác mà không có lỗi nào.
  let taskRows;
  try {
    taskRows = await fetchAllPagesOrThrow((from, to) => supabase
      .from('crm_tasks')
      .select('lead_id')
      .eq('executor_company_id', companyId)
      .like('stage_slug', 'sx_%')
      .order('lead_id', { ascending: true })
      .range(from, to));
  } catch (taskErr) {
    if (String(taskErr.message || '').includes('executor_company_id')) return [];
    throw taskErr;
  }
  const leadIds = [...new Set((taskRows || []).map((r) => r.lead_id).filter(Boolean))];
  if (!leadIds.length) return [];

  // Chia lô: `.in()` với vài trăm UUID trở lên làm URL vượt giới hạn → HTTP 400.
  const chunks = [];
  for (let i = 0; i < leadIds.length; i += EXEC_IN_CHUNK) chunks.push(leadIds.slice(i, i + EXEC_IN_CHUNK));
  const parts = await Promise.all(chunks.map((slice) => fetchAllPagesOrThrow((from, to) => supabase
    .from('crm_leads')
    .select('project_id')
    .in('id', slice)
    .not('project_id', 'is', null)
    .order('project_id', { ascending: true })
    .range(from, to))));
  const out = new Set();
  for (const rows of parts) {
    for (const l of rows) if (l.project_id) out.add(l.project_id);
  }
  return [...out];
}

/**
 * Áp filter OR company_id + dự án đối tác cho query Supabase projects.
 * Đồng bộ — KHÔNG await hàm này: PostgrestFilterBuilder là thenable, await sẽ chạy query sớm.
 * @param {unknown} partnerIds — kết quả getExecutorProjectIdsForCompany (optional)
 */
function applyProductionCompanyScopeFilter(query, companyId, partnerIds = null) {
  if (!companyId) return query;
  const pids = Array.isArray(partnerIds) ? partnerIds : [];
  if (!pids.length) return query.eq('company_id', companyId);
  const orParts = [`company_id.eq.${companyId}`];
  for (const pid of pids) orParts.push(`id.eq.${pid}`);
  return query.or(orParts.join(','));
}

function isExecutorColumnError(err) {
  return String(err?.message || '').includes('executor_company_id');
}

/** Không gian chung: nhiệm vụ giao cả task → giữ nguyên; chỉ checklist giao chéo → redact bộ nhiệm vụ. */
function sanitizeTasksForSharedWorkspace(tasks, ownerCompanyId) {
  const ownerId = ownerCompanyId || null;
  const out = [];
  for (const task of tasks || []) {
    if (isCrossCompanyDelegatedTask(task, ownerId)) {
      out.push({ ...task, shared_view: 'task' });
      continue;
    }
    const delegatedCk = filterDelegatedChecklistItems(task, ownerId);
    if (!delegatedCk.length) continue;
    out.push({
      id: task.id,
      lead_id: task.lead_id,
      shared_view: 'checklist_only',
      checklist: delegatedCk,
      status: task.status,
      stage_slug: task.stage_slug,
      production_pipeline_stage_id: task.production_pipeline_stage_id,
      order_index: task.order_index,
      assignee_id: task.assignee_id,
      assignees: task.assignees,
      assignee: task.assignee,
      deadline: task.deadline,
      priority: task.priority,
      file_count: 0,
      note_count: 0,
      attachment_count: 0,
    });
  }
  return out;
}

module.exports = {
  isSxTaskSlug,
  isCrossCompanyDelegatedTask,
  checklistHasCrossCompanyExecutor,
  filterDelegatedChecklistItems,
  hasCrossCompanyDelegation,
  sanitizeTasksForSharedWorkspace,
  resolveExecutorCompanyId,
  filterCrmTasksByCompanyScope,
  getExecutorProjectIdsForCompany,
  applyProductionCompanyScopeFilter,
  isExecutorColumnError,
};
