/**
 * Phân loại nhiệm vụ logistics (VC vs Lắp đặt) — dùng chung backend dashboard / gen stage.
 */

const DONE_STATUSES = new Set(['done', 'completed']);

/** Cột pipeline VC/LĐ theo tiêu đề nhiệm vụ (khớp workshopApplyTemplates). */
function guessLogisticsPipelineBucketFromTitle(title) {
  const t = String(title || '').toLowerCase().trim();
  if (
    t.includes('trước khi lấy')
    || t.includes('lên xe')
    || t.includes('trước khi giao')
    || t.includes('kiểm tra đơn hàng')
  ) return 'delivery_pending';
  if (
    t.includes('nghiệm thu')
    || t.includes('quy trình lắp')
    || t.includes('lắp đặt')
    || t.includes('kiểm tra và nhận')
    || t.includes('kiểm tra nhận hàng')
    || t.includes('lắp ')
  ) return 'installation';
  return 'shipping';
}

function isInstallLogisticsStageRow(stage) {
  if (!stage) return false;
  if (String(stage.crm_sync_type || '').toLowerCase() === 'installation') return true;
  const name = String(stage.name || '').toLowerCase();
  const slug = String(stage.bucket_slug || '').toLowerCase();
  return (
    slug.includes('install')
    || name.includes('lắp')
    || name.includes('lap dat')
    || name.includes('lắp đặt')
  );
}

/** Task thuộc khu logistics (không phải SX production). */
function isLogisticsWorkshopTask(task) {
  const meta = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  if (meta.workshop_area === 'production') return false;
  if (meta.workshop_area === 'logistics') return true;
  const slug = String(task?.stage?.slug || meta.guessed_stage_slug || '').toLowerCase();
  if (['shipping', 'installation', 'installing', 'delivery', 'delivery_pending'].includes(slug)) return true;
  if (meta.workshop_template_id && !meta.workshop_area) {
    const bucket = guessLogisticsPipelineBucketFromTitle(task?.title);
    return bucket === 'installation' || bucket === 'shipping' || bucket === 'delivery_pending';
  }
  return false;
}

/**
 * @param {object} task
 * @param {Map<string, object>|Set<string>|null} installStageIdSet
 */
function isInstallLogisticsTask(task, installStageIdSet = null) {
  if (!isLogisticsWorkshopTask(task)) return false;
  const meta = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const stageId = meta.logistics_pipeline_stage_id || null;
  if (stageId && installStageIdSet) {
    if (installStageIdSet instanceof Map) {
      if (installStageIdSet.has(String(stageId))) return true;
    } else if (installStageIdSet.has(String(stageId))) {
      return true;
    }
  }
  const guessed = String(meta.guessed_stage_slug || '').toLowerCase();
  const slug = String(task?.stage?.slug || '').toLowerCase();
  if (guessed.includes('install') || slug.includes('install')) return true;
  return guessLogisticsPipelineBucketFromTitle(task?.title) === 'installation';
}

function isTaskDone(task) {
  return DONE_STATUSES.has(String(task?.status || '').toLowerCase());
}

function splitLogisticsTaskStats(tasks, installStageIdSet = null) {
  const list = Array.isArray(tasks) ? tasks : [];
  const logistics = list.filter(isLogisticsWorkshopTask);
  const install = logistics.filter((t) => isInstallLogisticsTask(t, installStageIdSet));
  const vc = logistics.filter((t) => !isInstallLogisticsTask(t, installStageIdSet));
  const done = (arr) => arr.filter(isTaskDone).length;
  const task_total = logistics.length;
  const done_tasks = done(logistics);
  return {
    logistics,
    vc,
    install,
    task_total,
    done_tasks,
    task_total_vc: vc.length,
    done_tasks_vc: done(vc),
    task_total_install: install.length,
    done_tasks_install: done(install),
    progress: task_total ? Math.round((done_tasks / task_total) * 100) : 0,
  };
}

function attachSplitLogisticsTaskStats(project, installStageIdSet = null) {
  const stats = splitLogisticsTaskStats(project?.tasks, installStageIdSet);
  return {
    ...project,
    progress: stats.progress,
    task_total: stats.task_total,
    done_tasks: stats.done_tasks,
    task_total_vc: stats.task_total_vc,
    done_tasks_vc: stats.done_tasks_vc,
    task_total_install: stats.task_total_install,
    done_tasks_install: stats.done_tasks_install,
  };
}

module.exports = {
  guessLogisticsPipelineBucketFromTitle,
  isInstallLogisticsStageRow,
  isLogisticsWorkshopTask,
  isInstallLogisticsTask,
  isTaskDone,
  splitLogisticsTaskStats,
  attachSplitLogisticsTaskStats,
};
