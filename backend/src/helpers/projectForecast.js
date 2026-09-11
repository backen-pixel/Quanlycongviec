/**
 * Tiến độ hạn cam kết trên tổng quan dự án (Work Unified / chi tiết).
 * GCCK (Cánh kính) đã sang cột SX «Hoàn thành» không còn tính trễ theo ngày lắp.
 */

function foldVi(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function startOfDayMs(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function isGcckProject(project) {
  if (!project) return false;
  const wt = foldVi(project.workshop_type?.name || project.workshop_type_name || '');
  if (wt.includes('canh kinh')) return true;
  return /^gcck(\b|[\s_-])/i.test(String(project.name || '').trim());
}

function isGcckSxCompleted(sxStage) {
  if (!sxStage) return false;
  const n = foldVi(sxStage.name);
  return n.includes('hoan thanh') || n.includes('da giao') || n.includes('giao xong');
}

function shouldSkipGcckInstallOverdue(project, sxStage) {
  return isGcckProject(project)
    && isGcckSxCompleted(sxStage || project?.sx_pipeline_stage || project?.sx_kanban_column);
}

/** on_track | at_risk | late | unknown */
function classifyProjectForecast(commitmentDate, opts = {}) {
  if (!commitmentDate) return { forecast: 'unknown', days_remaining: null, delay_days: 0 };
  const daysRemaining = Math.round((startOfDayMs(commitmentDate) - startOfDayMs(new Date())) / 86400000);
  if (daysRemaining < 0) {
    if (shouldSkipGcckInstallOverdue(opts.project, opts.sxStage)) {
      return { forecast: 'on_track', days_remaining: 0, delay_days: 0 };
    }
    return { forecast: 'late', days_remaining: daysRemaining, delay_days: Math.abs(daysRemaining) };
  }
  if (daysRemaining <= 3) return { forecast: 'at_risk', days_remaining: daysRemaining, delay_days: 2 };
  return { forecast: 'on_track', days_remaining: daysRemaining, delay_days: 0 };
}

module.exports = {
  classifyProjectForecast,
  isGcckProject,
  isGcckSxCompleted,
  shouldSkipGcckInstallOverdue,
};
