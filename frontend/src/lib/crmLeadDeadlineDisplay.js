import { effectivePipelineStageSlaDays } from './crmPipelineSla';
import { endOfVnCalendarDayAfterEntered } from './vnDate';

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

/** Có SĐT trên lead hoặc customer (khớp lọc Kanban «có số»). */
export function crmLeadHasPhone(item) {
  const cust = item?.customer?.phone;
  const own = item?.phone;
  const display = item?.display_phone;
  return !!(
    (cust && String(cust).trim())
    || (own && String(own).trim())
    || (display && String(display).trim())
  );
}

/**
 * Lead «chưa có số» để bỏ deadline/quá hạn trên thẻ.
 * Ưu tiên display_phone (cùng logic lọc Kanban); nếu không có thì xem lead.phone + customer.phone.
 * Lưu ý: chỉ cần lead.phone trống mà customer có số → vẫn coi là CÓ số (hiện SĐT trên thẻ).
 */
export function crmLeadMissingPhone(item) {
  if (item && Object.prototype.hasOwnProperty.call(item, 'display_phone')) {
    return !item.display_phone || !String(item.display_phone).trim();
  }
  return !crmLeadHasPhone(item);
}

/**
 * Ẩn badge deadline / quá hạn trên thẻ Kanban khi:
 * - lead/deal chưa có SĐT
 * - user tick «đã tương tác»
 * - cột Thắng/Thua/Hoàn thành doanh thu
 */
export function shouldHideCrmKanbanDeadlineOnCard(item, stage) {
  if (crmLeadMissingPhone(item)) return true;
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
  kanban: {
    label: 'Deadline thẻ',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
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

/**
 * Hạn SLA cột.
 * @param {string} stageEnteredAt
 * @param {object} stage
 * @param {object} [leadItem] — nếu truyền và chưa có SĐT → null (tắt SLA)
 */
export function getPipelineStageSlaDeadlineTs(stageEnteredAt, stage, leadItem) {
  if (leadItem != null && crmLeadMissingPhone(leadItem)) return null;
  if (!stageEnteredAt || !stage) return null;
  if (isCrmPipelineStageNoDeadline(stage)) return null;
  const slaDays = effectivePipelineStageSlaDays(stage.sla_days);
  if (slaDays == null) return null;
  // Khớp backend: cuối ngày lịch VN sau slaDays (không dùng entered + N*24h).
  return endOfVnCalendarDayAfterEntered(stageEnteredAt, slaDays).getTime();
}

/** Kanban: ưu tiên hạn NV mở mới nhất, không có thì SLA cột. Bỏ qua cột không deadline / chưa có SĐT. */
export function resolveCrmLeadKanbanScheduleSource(item, stage) {
  const st = stage || item?.stage;
  if (shouldHideCrmKanbanDeadlineOnCard(item, st)) {
    return { source: null, deadlineTs: null };
  }
  const taskIso = item?.crm_next_open_task_deadline;
  if (taskIso != null && taskIso !== '') {
    const ts = new Date(taskIso).getTime();
    if (!Number.isNaN(ts)) return { source: 'task', deadlineTs: ts };
  }
  const slaTs = getPipelineStageSlaDeadlineTs(item?.stage_entered_at, stage, item);
  if (slaTs != null) return { source: 'sla', deadlineTs: slaTs };
  return { source: null, deadlineTs: null };
}

function fieldToDeadlineSource(field) {
  if (field === 'kanban_deadline_at') return 'kanban';
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

/**
 * View Deadline Dashboard: thống nhất thứ tự ưu tiên với thẻ Kanban.
 * kanban_deadline_at → cấu hình primary/fallback → SLA cột.
 */
export function resolveCrmLeadDeadlineViewSource(item, stage, config) {
  const st = stage || item?._stage || item?.stage;
  if (shouldHideCrmKanbanDeadlineOnCard(item, st)) {
    return { deadlineTs: null, source: null };
  }

  const manual = item?.kanban_deadline_at;
  if (manual != null && manual !== '') {
    const ts = new Date(manual).getTime();
    if (!Number.isNaN(ts)) return { deadlineTs: ts, source: 'kanban' };
  }

  const cfg = config || {};
  const picked = pickDeadlineConfigValueWithSource(
    item,
    cfg.primary_field || 'crm_next_open_task_deadline',
    cfg.fallback_field || 'expected_close_date',
  );
  if (picked.deadlineTs != null) return picked;

  const slaTs = getPipelineStageSlaDeadlineTs(item?.stage_entered_at, st, item);
  if (slaTs != null) return { source: 'sla', deadlineTs: slaTs };

  return { deadlineTs: null, source: null };
}
