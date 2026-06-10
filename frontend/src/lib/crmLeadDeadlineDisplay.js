import { effectivePipelineStageSlaDays } from './crmPipelineSla';

/** Cột pipeline Thắng — deal đã chốt, không tính/hiển thị deadline. */
export function isCrmPipelineStageWon(stage) {
  if (!stage) return false;
  if (stage.is_won) return true;
  if (stage.canonical_slug === 'won') return true;
  if (stage.deal_report_bucket === 'won') return true;
  return false;
}

/** Cột tích «doanh thu đã hoàn thành» — không tính/hiển thị deadline. */
export function isCrmPipelineStageCompletedRevenue(stage) {
  return !!stage?.counts_as_completed_revenue;
}

/** Cột không theo dõi deadline (Thắng / Thua / Hoàn thành doanh thu). */
export function isCrmPipelineStageNoDeadline(stage) {
  return isCrmPipelineStageWon(stage)
    || isCrmPipelineStageLost(stage)
    || isCrmPipelineStageCompletedRevenue(stage);
}

/**
 * Ẩn badge deadline trên thẻ Kanban khi user tick «đã tương tác»
 * hoặc thẻ đang ở cột Thắng/Thua/Hoàn thành doanh thu.
 */
export function shouldHideCrmKanbanDeadlineOnCard(item, stage) {
  if (item?.is_interacted) return true;
  const st = stage || item?.stage;
  if (isCrmPipelineStageNoDeadline(st)) return true;
  return false;
}

/** Cột pipeline Thua / Mất — không đưa vào view Deadline. */
export function isCrmPipelineStageLost(stage) {
  if (!stage) return false;
  if (stage.is_lost) return true;
  if (stage.canonical_slug === 'lost') return true;
  if (stage.deal_report_bucket === 'lost') return true;
  return false;
}

/** Nguồn hạn hiển thị trên thẻ lead/deal CRM */
export const CRM_DEADLINE_SOURCE_META = {
  task: {
    label: 'Nhiệm vụ',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  sla: {
    label: 'SLA cột',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  expected_close: {
    label: 'Ngày chốt dự kiến',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
};

export function getPipelineStageSlaDeadlineTs(stageEnteredAt, stage) {
  if (!stageEnteredAt || !stage) return null;
  if (isCrmPipelineStageNoDeadline(stage)) return null;
  const slaDays = effectivePipelineStageSlaDays(stage.sla_days);
  if (slaDays == null) return null;
  return new Date(stageEnteredAt).getTime() + slaDays * 86400000;
}

/** Kanban: ưu tiên hạn NV mở mới nhất, không có thì SLA cột. Bỏ qua cột không deadline. */
export function resolveCrmLeadKanbanScheduleSource(item, stage) {
  const st = stage || item?.stage;
  if (isCrmPipelineStageNoDeadline(st)) {
    return { source: null, deadlineTs: null };
  }
  const taskIso = item?.crm_next_open_task_deadline;
  if (taskIso != null && taskIso !== '') {
    const ts = new Date(taskIso).getTime();
    if (!Number.isNaN(ts)) return { source: 'task', deadlineTs: ts };
  }
  const slaTs = getPipelineStageSlaDeadlineTs(item?.stage_entered_at, stage);
  if (slaTs != null) return { source: 'sla', deadlineTs: slaTs };
  return { source: null, deadlineTs: null };
}

function fieldToDeadlineSource(field) {
  if (field === 'crm_next_open_task_deadline') return 'task';
  if (field === 'expected_close_date') return 'expected_close';
  return null;
}

/** Định dạng thời gian còn lại / quá hạn (ms, dương). */
export function formatCrmRemainingMs(ms) {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  const hr = h % 24;
  if (d > 0) return `${d} ngày ${hr} giờ`;
  if (h > 0) return `${h} giờ`;
  const m = Math.floor(ms / 60000);
  return m > 0 ? `${m} phút` : '< 1 phút';
}

/** Mức urgency: overdue (<0) | soon (≤24h) | warn (≤3 ngày) | ok */
export function getCrmDeadlineUrgencyFromTs(deadlineTs) {
  if (deadlineTs == null || Number.isNaN(deadlineTs)) {
    return { level: 'ok', remainingMs: null, deadlineTs: null };
  }
  const remainingMs = deadlineTs - Date.now();
  if (remainingMs < 0) return { level: 'overdue', remainingMs, deadlineTs };
  if (remainingMs <= 24 * 3600000) return { level: 'soon', remainingMs, deadlineTs };
  if (remainingMs <= 3 * 24 * 3600000) return { level: 'warn', remainingMs, deadlineTs };
  return { level: 'ok', remainingMs, deadlineTs };
}

export function getCrmDeadlineUrgencyFromIso(iso) {
  if (iso == null || iso === '') return getCrmDeadlineUrgencyFromTs(null);
  return getCrmDeadlineUrgencyFromTs(new Date(iso).getTime());
}

/** Class Tailwind cho badge Còn / Sắp / Quá hạn */
export function getCrmDeadlineUrgencyBadgeClass(level, { pulseOverdue = true } = {}) {
  switch (level) {
    case 'overdue':
      return [
        'bg-red-600 text-white border-red-700 font-bold shadow-md shadow-red-500/40',
        pulseOverdue ? 'animate-pulse ring-2 ring-red-400/60' : 'ring-1 ring-red-500/50',
      ].join(' ');
    case 'soon':
      return 'bg-orange-500 text-white border-orange-600 font-bold shadow-md shadow-orange-500/35 ring-2 ring-orange-300/50';
    case 'warn':
      return 'bg-amber-300 text-amber-950 border-amber-500 font-semibold shadow-sm';
    default:
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold';
  }
}

/** View Deadline: theo cấu hình primary / fallback công ty. */
export function pickDeadlineConfigValueWithSource(item, primary, fallback) {
  const readTs = (field) => {
    if (!field) return null;
    const v = item[field];
    if (!v) return null;
    const ts = new Date(v).getTime();
    return Number.isNaN(ts) ? null : ts;
  };
  const p = readTs(primary);
  if (p != null) return { deadlineTs: p, source: fieldToDeadlineSource(primary) };
  const f = readTs(fallback);
  if (f != null) return { deadlineTs: f, source: fieldToDeadlineSource(fallback) };
  return { deadlineTs: null, source: null };
}
