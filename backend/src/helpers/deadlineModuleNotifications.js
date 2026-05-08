/**
 * Hạn nhiệm vụ theo module dự án + ecosystem (công ty/khối).
 * — CRM (crm_tasks): module `crm` hoặc `production` (stage sx_*); người nhận: assignee → lead_owner → assigned_to
 *   (chỉ người thuộc công ty có quyền module đó).
 * — tasks (bảng tasks): assignee_id; lọc theo module SX / VC / dự án.
 */

const { getRestrictedDivisionIdsForModule } = require('./ecosystemModuleScope');

/**
 * @param {string|null|undefined} projectStatus - projects.status
 * @returns {'production'|'logistics'|'project'}
 */
function deadlineModuleFromProjectStatus(projectStatus) {
  const s = projectStatus == null ? '' : String(projectStatus);
  if (s === 'producing') return 'production';
  if (s === 'shipping' || s === 'installing' || s === 'warranty') return 'logistics';
  return 'project';
}

/**
 * Nhiệm vụ CRM trên lead/deal: sx_* → module Sản xuất (xưởng), còn lại → CRM.
 */
function crmTaskDeadlineModuleKey(stageSlug) {
  const s = String(stageSlug || '');
  if (s.startsWith('sx_')) return 'production';
  return 'crm';
}

/**
 * Key dùng với `getRestrictedDivisionIdsForModule` (ecosystem_module_scopes.module_key).
 */
function ecosystemModuleKeyForCrmDeadline(moduleKey) {
  return moduleKey === 'production' ? 'production' : 'crm';
}

/**
 * Key ecosystem cho task dự án theo bucket pipeline.
 */
function ecosystemModuleKeyForProjectTaskMod(mod) {
  if (mod === 'production') return 'production';
  if (mod === 'logistics') return 'logistics';
  return 'projects';
}

/**
 * @param {'production'|'logistics'|'project'} mod
 * @param {boolean} isOverdue
 */
function taskDeadlineTypeForModule(mod, isOverdue) {
  if (mod === 'production') {
    return isOverdue ? 'production_task_deadline_overdue' : 'production_task_deadline_warning';
  }
  if (mod === 'logistics') {
    return isOverdue ? 'logistics_task_deadline_overdue' : 'logistics_task_deadline_warning';
  }
  return isOverdue ? 'project_pipeline_deadline_overdue' : 'project_pipeline_deadline_warning';
}

const MODULE_LABEL = {
  production: 'Xưởng',
  logistics: 'Vận chuyển',
  project: 'Dự án',
  crm: 'CRM',
};

/** Dự án đã kết thúc → không nhắc hạn task (tránh sai module / spam). */
const SKIP_PROJECT_STATUSES_FOR_TASK_DEADLINE = new Set(['completed', 'cancelled']);

/**
 * User có ít nhất một division_unit thuộc phạm vi module (khi ecosystem có cấu hình).
 */
function userRowMatchesCompanyModuleDivision(userRow, companyToDivisions, restrictedSet) {
  if (!userRow?.id) return false;
  if (userRow.role === 'admin') return true;
  if (restrictedSet == null) return true;
  const coId = userRow.company_id ? String(userRow.company_id) : '';
  if (!coId) return false;
  const divs = companyToDivisions.get(coId);
  if (!divs || divs.size === 0) return false;
  for (const d of divs) {
    if (restrictedSet.has(String(d))) return true;
  }
  return false;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} userIds
 */
async function loadDeadlineUserCompanyDivisionContext(supabase, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map((x) => String(x)))];
  if (!ids.length) {
    return { usersById: new Map(), companyToDivisions: new Map() };
  }
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, role, company_id')
    .in('id', ids);
  if (uErr) throw uErr;
  const usersById = new Map((users || []).map((u) => [String(u.id), u]));
  const companyIds = [...new Set((users || []).map((u) => u.company_id).filter(Boolean).map(String))];
  const companyToDivisions = new Map();
  if (!companyIds.length) return { usersById, companyToDivisions };

  const { data: companies, error: cErr } = await supabase
    .from('companies')
    .select('id, division_unit_id')
    .in('id', companyIds);
  if (cErr) throw cErr;
  for (const c of companies || []) {
    const id = String(c.id);
    if (!companyToDivisions.has(id)) companyToDivisions.set(id, new Set());
    if (c.division_unit_id) companyToDivisions.get(id).add(String(c.division_unit_id));
  }
  const { data: links, error: lErr } = await supabase
    .from('company_division_units')
    .select('company_id, division_unit_id')
    .in('company_id', companyIds);
  if (lErr) throw lErr;
  for (const row of links || []) {
    const cid = row.company_id ? String(row.company_id) : '';
    const did = row.division_unit_id ? String(row.division_unit_id) : '';
    if (!cid || !did) continue;
    if (!companyToDivisions.has(cid)) companyToDivisions.set(cid, new Set());
    companyToDivisions.get(cid).add(did);
  }
  return { usersById, companyToDivisions };
}

/**
 * Chọn một người liên quan lead/deal (giao việc → chủ lead → phụ trách) thuộc đúng phạm vi module.
 */
function pickCrmDeadlineRecipientForTaskWithModule(task, lead, moduleKey, usersById, companyToDivisions, restrictedSet) {
  const candidates = [task?.assignee_id, lead?.lead_owner_id, lead?.assigned_to].filter(Boolean);
  const seen = new Set();
  for (const uid of candidates) {
    const s = String(uid);
    if (seen.has(s)) continue;
    seen.add(s);
    const row = usersById.get(s);
    if (!row) continue;
    if (!userRowMatchesCompanyModuleDivision(row, companyToDivisions, restrictedSet)) continue;
    return s;
  }
  return null;
}

/**
 * Một thông báo hạn cho task dự án (bảng `tasks`) hoặc null nếu bỏ qua.
 */
function buildProjectTaskDeadlineNotif(t, project, isOverdue) {
  if (!t?.assignee_id) return null;
  if (!t.project_id || !project?.id) return null;
  if (String(project.id) !== String(t.project_id)) return null;
  const st = project.status != null ? String(project.status) : '';
  if (SKIP_PROJECT_STATUSES_FOR_TASK_DEADLINE.has(st)) return null;
  const mod = deadlineModuleFromProjectStatus(project.status);
  const type = taskDeadlineTypeForModule(mod, isOverdue);
  const code = project.code || project.name || '';
  const dueStr = new Date(t.due_date).toLocaleDateString('vi-VN');
  const modLabel = MODULE_LABEL[mod] || 'Dự án';
  const meta = {
    module_key: mod,
    project_id: String(t.project_id),
    ecosystem_module_key: ecosystemModuleKeyForProjectTaskMod(mod),
  };
  if (isOverdue) {
    return {
      user_id: t.assignee_id,
      type,
      title: `🚨 [${modLabel}] Quá hạn!`,
      message: `Dự án ${code}: "${t.title}" — quá hạn từ ${dueStr}`,
      entity_type: 'task',
      entity_id: t.id,
      metadata: meta,
    };
  }
  return {
    user_id: t.assignee_id,
    type,
    title: `⏰ [${modLabel}] Sắp hết hạn`,
    message: `Dự án ${code}: "${t.title}" — hạn: ${dueStr}`,
    entity_type: 'task',
    entity_id: t.id,
    metadata: meta,
  };
}

function buildCrmTaskDeadlineMetadata(task, lead, moduleKey) {
  return {
    module_key: moduleKey,
    ecosystem_module_key: ecosystemModuleKeyForCrmDeadline(moduleKey),
    lead_id: task?.lead_id ? String(task.lead_id) : null,
    stage_slug: task?.stage_slug || null,
    lead_code: lead?.code || null,
    lead_title: lead?.title || null,
  };
}

/** @deprecated Dùng pickCrmDeadlineRecipientForTaskWithModule + loadDeadlineUserCompanyDivisionContext */
function pickCrmDeadlineRecipient(task) {
  return task?.assignee_id || null;
}

module.exports = {
  deadlineModuleFromProjectStatus,
  crmTaskDeadlineModuleKey,
  ecosystemModuleKeyForCrmDeadline,
  ecosystemModuleKeyForProjectTaskMod,
  taskDeadlineTypeForModule,
  buildProjectTaskDeadlineNotif,
  pickCrmDeadlineRecipient,
  pickCrmDeadlineRecipientForTaskWithModule,
  loadDeadlineUserCompanyDivisionContext,
  userRowMatchesCompanyModuleDivision,
  buildCrmTaskDeadlineMetadata,
  MODULE_LABEL,
  SKIP_PROJECT_STATUSES_FOR_TASK_DEADLINE,
};
