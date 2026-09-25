/**
 * Tiến độ hạn cam kết trên tổng quan dự án (Work Unified / chi tiết).
 * GCCK (Cánh kính) đã sang cột SX «Hoàn thành» không còn tính trễ theo ngày lắp.
 * Các loại khác: hạn bàn giao = deadline VC/LĐ đang chạy (buổi lắp còn lại).
 */

const { isHucabiCompany } = require('./companyDeadlineClock');

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
  return n.includes('hoan thanh') || n.includes('hoan thien') || n.includes('da giao') || n.includes('giao xong');
}

/** HCB + phân loại Cánh kính (hoặc mã GCCK-). */
function isHcbCanhKinhProject(project) {
  if (!isGcckProject(project)) return false;
  return isHucabiCompany(project.company_id || project.company);
}

/**
 * Cột SX «Hoàn thành» / Đã thu — không gồm «Đợi thanh toán» (Đã công)
 * hay «Chờ giao hàng».
 */
function isSxHoanThanhColumn(col) {
  if (!col) return false;
  if (col.counts_as_collected_revenue) return true;
  const n = foldVi(col.name);
  return n === 'hoan thanh' || n.startsWith('hoan thanh ');
}

function shouldSkipGcckInstallOverdue(project, sxStage) {
  return isGcckProject(project)
    && isGcckSxCompleted(sxStage || project?.sx_pipeline_stage || project?.sx_kanban_column);
}

/** Trễ / nguy cơ lấy đúng hạn module (CRM, SX, VC/LĐ), không thêm điều kiện riêng. */
function forecastFromModuleDeadline(resolved) {
  if (!resolved?.deadlineAt || resolved.state === 'none') {
    return { forecast: 'unknown', days_remaining: null, delay_days: 0 };
  }
  const daysRemaining = Math.round((Number(resolved.remainingMs) || 0) / 86400000);
  if (resolved.state === 'overdue') {
    return { forecast: 'late', days_remaining: daysRemaining, delay_days: Math.abs(daysRemaining) };
  }
  if (daysRemaining <= 3) return { forecast: 'at_risk', days_remaining: daysRemaining, delay_days: 2 };
  return { forecast: 'on_track', days_remaining: daysRemaining, delay_days: 0 };
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
  forecastFromModuleDeadline,
  isGcckProject,
  isGcckSxCompleted,
  isHcbCanhKinhProject,
  isSxHoanThanhColumn,
  shouldSkipGcckInstallOverdue,
};
