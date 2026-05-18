import { effectivePipelineStageSlaDays } from './crmPipelineSla';

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
  if (stage.is_won || stage.is_lost) return null;
  const slaDays = effectivePipelineStageSlaDays(stage.sla_days);
  if (slaDays == null) return null;
  return new Date(stageEnteredAt).getTime() + slaDays * 86400000;
}

/** Kanban: ưu tiên hạn NV mở mới nhất, không có thì SLA cột. */
export function resolveCrmLeadKanbanScheduleSource(item, stage) {
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
