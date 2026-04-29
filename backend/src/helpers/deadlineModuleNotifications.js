/**
 * Hạn nhiệm vụ theo module dự án + đúng một người nhận.
 * — CRM (crm_tasks): chỉ assignee_id của nhiệm vụ (không gửi lead owner / sale để tránh nhầm người).
 * — tasks (bảng tasks): chỉ assignee_id; không gửi nếu chưa giao.
 */

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
};

/** Dự án đã kết thúc → không nhắc hạn task (tránh sai module / spam). */
const SKIP_PROJECT_STATUSES_FOR_TASK_DEADLINE = new Set(['completed', 'cancelled']);

/**
 * Một thông báo hạn cho task dự án (bảng `tasks`) hoặc null nếu bỏ qua.
 * @param {object} t - hàng task (có id, title, due_date, assignee_id, project_id)
 * @param {object} project - { id, status, code, name }
 * @param {boolean} isOverdue
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
  if (isOverdue) {
    return {
      user_id: t.assignee_id,
      type,
      title: `🚨 [${modLabel}] Quá hạn!`,
      message: `Dự án ${code}: "${t.title}" — quá hạn từ ${dueStr}`,
      entity_type: 'task',
      entity_id: t.id,
    };
  }
  return {
    user_id: t.assignee_id,
    type,
    title: `⏰ [${modLabel}] Sắp hết hạn`,
    message: `Dự án ${code}: "${t.title}" — hạn: ${dueStr}`,
    entity_type: 'task',
    entity_id: t.id,
  };
}

/**
 * Chỉ người được giao nhiệm vụ CRM (crm_tasks.assignee_id).
 */
function pickCrmDeadlineRecipient(task) {
  return task?.assignee_id || null;
}

module.exports = {
  deadlineModuleFromProjectStatus,
  taskDeadlineTypeForModule,
  buildProjectTaskDeadlineNotif,
  pickCrmDeadlineRecipient,
  MODULE_LABEL,
  SKIP_PROJECT_STATUSES_FOR_TASK_DEADLINE,
};
