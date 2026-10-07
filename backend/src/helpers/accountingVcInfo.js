const { kpiBucketForStage } = require('./vcOverviewKpis');

const VC_PHASES = {
  none: { label: 'Chưa bàn giao VC/LĐ', group: 'none' },
  waiting: { label: 'Chờ vận chuyển', group: 'active' },
  shipping: { label: 'Đang giao', group: 'active' },
  delivered: { label: 'Đã giao hàng', group: 'active' },
  installing: { label: 'Đang lắp đặt', group: 'active' },
  acceptance: { label: 'Nghiệm thu', group: 'done' },
  warranty: { label: 'Bảo hành / phát sinh', group: 'done' },
  completed: { label: 'Hoàn thiện', group: 'done' },
};

const VC_GROUP_LABELS = {
  none: 'Chưa bàn giao VC/LĐ',
  active: 'Đang VC/LĐ',
  done: 'Lắp xong',
};

const BUCKET_TO_PHASE = {
  intake: 'waiting',
  shipping: 'shipping',
  delivered: 'delivered',
  installing: 'installing',
  acceptance: 'acceptance',
  warranty: 'warranty',
  completed: 'completed',
};

function hasVcHandover(project) {
  if (!project || project.vc_deleted_at) return false;
  return Boolean(project.logistics_company_id || project.vc_kanban_column_id);
}

function resolveVcPhase(project, stage) {
  if (!hasVcHandover(project)) return 'none';
  if (stage) return BUCKET_TO_PHASE[kpiBucketForStage(stage)] || 'shipping';
  const st = String(project.status || '');
  if (st === 'completed') return 'completed';
  if (st === 'warranty') return 'warranty';
  if (st === 'installing') return 'installing';
  return 'waiting';
}

function parseCost(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Các trường VC/LĐ gắn lên dòng deal kế toán. `logistics_cost` null = chưa nhập, 0 = không phát sinh phí. */
function buildVcInfo(project, stage, companyMap) {
  const phase = resolveVcPhase(project, stage);
  const meta = VC_PHASES[phase];
  const active = phase !== 'none';
  const co = active && project?.logistics_company_id
    ? companyMap?.get(String(project.logistics_company_id))
    : null;
  return {
    vc_phase: phase,
    vc_phase_label: meta.label,
    vc_group: meta.group,
    vc_done: meta.group === 'done',
    vc_company_id: active ? project?.logistics_company_id || null : null,
    vc_company_name: co ? (co.short_name || co.name || null) : null,
    vc_stage_name: active ? stage?.name || null : null,
    vc_stage_color: active ? stage?.color || null : null,
    delivery_date: project?.delivery_date || null,
    install_date: project?.install_date || null,
    logistics_cost: parseCost(project?.logistics_cost),
  };
}

module.exports = {
  VC_PHASES,
  VC_GROUP_LABELS,
  hasVcHandover,
  resolveVcPhase,
  buildVcInfo,
};
