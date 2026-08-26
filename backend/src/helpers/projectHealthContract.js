const PROJECT_HEALTH_VERSION = 'project_health_v1';

const PROJECT_MACRO_PHASES = [
  { key: 'design', label: 'Thiết kế' },
  { key: 'procurement', label: 'Thu mua' },
  { key: 'production', label: 'Sản xuất' },
  { key: 'quality', label: 'KCS' },
  { key: 'packing', label: 'Kho/Đóng gói' },
  { key: 'delivery', label: 'Giao nhận' },
  { key: 'installation', label: 'Lắp đặt' },
  { key: 'acceptance', label: 'Nghiệm thu' },
];

const DONE_TASK_STATUSES = new Set(['done', 'completed', 'cancelled']);
const MATERIAL_READY_STATUSES = new Set(['received', 'qc_pass', 'done']);
const PRODUCTION_PAST_STATUSES = new Set(['shipping', 'installing', 'completed']);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

function clampPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function isPast(value, now) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < now.getTime();
}

function isFinanceProductionStage(stage) {
  const text = normalizeText(`${stage?.bucket_slug || ''} ${stage?.name || ''}`);
  return stage?.counts_as_collected_revenue === true
    || ['cong no', 'thu tien', 'da thu', 'hoa don', 'thanh toan', 'payment', 'invoice', 'receivable']
      .some((keyword) => text.includes(keyword));
}

function classifyProductionStage(stage) {
  if (!stage) return null;
  if (isFinanceProductionStage(stage)) return 'finance';
  const text = normalizeText(`${stage.bucket_slug || ''} ${stage.deadline_group || ''} ${stage.name || ''}`);
  if (stage.is_packaging_done === true
    || ['dong goi', 'packing', 'xuat kho', 'cho giao', 'san sang giao'].some((keyword) => text.includes(keyword))) {
    return 'packing';
  }
  if (['kcs', 'qc', 'quality', 'kiem chat', 'kiem tra chat luong'].some((keyword) => text.includes(keyword))) {
    return 'quality';
  }
  return 'production';
}

function classifyLogisticsStage(stage) {
  if (!stage) return null;
  const text = normalizeText(`${stage.bucket_slug || ''} ${stage.crm_sync_type || ''} ${stage.name || ''}`);
  if (['completed', 'install_completed', 'hoan thien', 'hoan tat'].some((keyword) => text.includes(keyword))) {
    return { key: 'acceptance', completed: true };
  }
  if (['acceptance', 'install_acceptance', 'nghiem thu', 'ban giao'].some((keyword) => text.includes(keyword))) {
    return { key: 'acceptance', completed: false };
  }
  if (['installation', 'install_in_progress', 'lap dat'].some((keyword) => text.includes(keyword))) {
    return { key: 'installation', completed: false };
  }
  return { key: 'delivery', completed: text.includes('delivered') || text.includes('da giao') };
}

function progressWithinGroup(stages, currentStage, classifier, key) {
  if (!currentStage) return 0;
  const group = (stages || [])
    .filter((stage) => classifier(stage) === key)
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));
  const index = group.findIndex((stage) => String(stage.id) === String(currentStage.id));
  if (index >= 0) return Math.round(((index + 1) / group.length) * 100);
  return clampPct(currentStage.progress_percent) ?? 50;
}

function resolveEffectiveProductionStage(stages, currentStage) {
  if (!currentStage) return null;
  if (!isFinanceProductionStage(currentStage)) return currentStage;
  const currentOrder = Number(currentStage.order_index || Number.POSITIVE_INFINITY);
  return (stages || [])
    .filter((stage) => !isFinanceProductionStage(stage) && Number(stage.order_index || 0) <= currentOrder)
    .sort((a, b) => Number(b.order_index || 0) - Number(a.order_index || 0))[0] || null;
}

function makePhase(definition, progress, currentKey, owner, deadline) {
  const pct = clampPct(progress);
  let state = 'pending';
  if (pct === 100) state = 'completed';
  else if (definition.key === currentKey) state = 'current';
  else if (pct == null) state = 'unknown';
  return {
    ...definition,
    state,
    progress_pct: pct,
    owner: owner || null,
    deadline: deadline || null,
    missing_requirements: [],
    blockers: [],
    risk: { level: 'none', reasons: [] },
  };
}

function addUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function phaseByKey(phases, key) {
  return phases.find((phase) => phase.key === key);
}

function taskPhase(task, currentKey, productionKey, logisticsKey) {
  const kind = normalizeText(task?.task_kind);
  if (kind.includes('crm')) return 'design';
  if (kind === 'sx' || kind === 'du an') return productionKey || 'production';
  if (kind === 'vc') return logisticsKey || 'delivery';
  return currentKey;
}

function buildProjectHealthContract({
  project = {},
  productionStages = [],
  productionStage = null,
  logisticsStages = [],
  logisticsStage = null,
  materials = [],
  tasks = [],
  externalBlockers = [],
  owners = {},
  now = new Date(),
} = {}) {
  const completedProject = String(project.status || '').toLowerCase() === 'completed' || !!project.completed_date;
  const logisticsInfo = classifyLogisticsStage(logisticsStage);
  const pastProduction = completedProject
    || !!logisticsStage
    || !!project.production_finish_date
    || PRODUCTION_PAST_STATUSES.has(String(project.status || '').toLowerCase());
  const effectiveProductionStage = resolveEffectiveProductionStage(productionStages, productionStage);
  const productionKey = classifyProductionStage(effectiveProductionStage);
  const logisticsKey = logisticsInfo?.key || null;
  const designPassed = pastProduction || !!productionStage || !!project.production_start_date || !!project.sx_reception_date;

  let currentKey = 'design';
  if (logisticsKey === 'delivery' && logisticsInfo?.completed) currentKey = 'installation';
  else if (logisticsKey) currentKey = logisticsKey;
  else if (productionKey) currentKey = productionKey;
  else if (project.production_start_date || project.sx_reception_date) currentKey = 'production';
  else if (materials.length) currentKey = 'procurement';

  const stageSlug = normalizeText(project.current_stage?.slug || project.current_stage_slug);
  let designProgress = designPassed ? 100 : 0;
  if (!designPassed && stageSlug) {
    if (stageSlug.includes('design')) designProgress = 50;
    else if (stageSlug.includes('approve') || stageSlug.includes('measure')) designProgress = 80;
    else if (['production', 'materials', 'delivery', 'installation', 'acceptance'].some((key) => stageSlug.includes(key))) designProgress = 100;
  }

  const readyMaterials = materials.filter((item) => MATERIAL_READY_STATUSES.has(String(item.status || '').toLowerCase()));
  const procurementProgress = materials.length ? Math.round((readyMaterials.length / materials.length) * 100) : null;

  const productionOrder = ['production', 'quality', 'packing'];
  const productionProgress = { production: 0, quality: 0, packing: 0 };
  if (pastProduction) {
    productionOrder.forEach((key) => { productionProgress[key] = 100; });
  } else if (productionKey && productionKey !== 'finance') {
    const currentIndex = productionOrder.indexOf(productionKey);
    productionOrder.forEach((key, index) => {
      if (index < currentIndex) productionProgress[key] = 100;
      else if (index === currentIndex) {
        productionProgress[key] = effectiveProductionStage?.is_packaging_done === true && key === 'packing'
          ? 100
          : progressWithinGroup(productionStages, effectiveProductionStage, classifyProductionStage, key);
      }
    });
  }

  const logisticsOrder = ['delivery', 'installation', 'acceptance'];
  const logisticsProgress = { delivery: 0, installation: 0, acceptance: 0 };
  if (completedProject) {
    logisticsOrder.forEach((key) => { logisticsProgress[key] = 100; });
  } else if (logisticsInfo) {
    const currentIndex = logisticsOrder.indexOf(logisticsInfo.key);
    logisticsOrder.forEach((key, index) => {
      if (index < currentIndex) logisticsProgress[key] = 100;
      else if (index === currentIndex) {
        logisticsProgress[key] = logisticsInfo.completed
          ? 100
          : progressWithinGroup(logisticsStages, logisticsStage, (stage) => classifyLogisticsStage(stage)?.key, key);
      }
    });
  }

  const deadlines = {
    design: project.design_deadline,
    procurement: materials
      .map((item) => item.supplier_committed_date || item.requested_date)
      .filter(Boolean)
      .sort()[0] || null,
    production: project.production_deadline || project.deadline,
    quality: project.production_deadline || project.deadline,
    packing: project.production_deadline || project.deadline,
    delivery: project.delivery_date,
    installation: project.install_date,
    acceptance: project.deadline,
  };

  const progress = {
    design: designProgress,
    procurement: completedProject ? 100 : procurementProgress,
    ...productionProgress,
    ...logisticsProgress,
  };
  const phases = PROJECT_MACRO_PHASES.map((definition) => makePhase(
    definition,
    progress[definition.key],
    currentKey,
    owners[definition.key],
    deadlines[definition.key],
  ));

  const currentPhase = phaseByKey(phases, currentKey);
  if (currentPhase && currentPhase.progress_pct !== 100 && !currentPhase.owner) {
    addUnique(currentPhase.missing_requirements, 'Chưa xác định người chịu trách nhiệm');
  }
  if (currentPhase && currentPhase.progress_pct !== 100 && !currentPhase.deadline) {
    addUnique(currentPhase.missing_requirements, 'Chưa đặt deadline cho chặng hiện tại');
  }

  const design = phaseByKey(phases, 'design');
  if (design.progress_pct !== 100 && !project.design_deadline) addUnique(design.missing_requirements, 'Chưa có hạn hoàn thành thiết kế');

  const procurement = phaseByKey(phases, 'procurement');
  if (!materials.length && !completedProject) {
    addUnique(procurement.missing_requirements, 'Chưa có dữ liệu yêu cầu mua hàng để xác nhận mức sẵn sàng');
  } else {
    const notReady = materials.length - readyMaterials.length;
    if (notReady > 0) addUnique(procurement.missing_requirements, `${notReady} dòng vật tư chưa sẵn sàng`);
    const qcFailed = materials.filter((item) => String(item.status || '').toLowerCase() === 'qc_fail'
      || String(item.qc_status || '').toLowerCase() === 'fail').length;
    if (qcFailed > 0) addUnique(procurement.blockers, `${qcFailed} dòng vật tư không đạt KCS`);
    const lateMaterials = materials.filter((item) => !MATERIAL_READY_STATUSES.has(String(item.status || '').toLowerCase())
      && isPast(item.supplier_committed_date, now)).length;
    if (lateMaterials > 0) addUnique(procurement.blockers, `${lateMaterials} dòng vật tư trễ ngày nhà cung cấp cam kết`);
    const awaitingAction = materials.filter((item) => ['draft', 'requested'].includes(String(item.status || '').toLowerCase())).length;
    if (awaitingAction > 0 && PROJECT_MACRO_PHASES.findIndex((phase) => phase.key === currentKey) >= 1) {
      addUnique(procurement.blockers, `${awaitingAction} yêu cầu mua hàng chưa được xử lý`);
    }
  }

  const production = phaseByKey(phases, 'production');
  if (!productionStage && currentKey === 'production') addUnique(production.blockers, 'Project chưa được tiếp nhận vào pipeline sản xuất');
  if (productionStage && isFinanceProductionStage(productionStage)) {
    addUnique(production.blockers, `Công đoạn “${productionStage.name || 'tài chính'}” thuộc Finance, không được tính vào tiến độ sản xuất`);
  }

  for (const task of tasks) {
    if (DONE_TASK_STATUSES.has(String(task.status || '').toLowerCase()) || !isPast(task.deadline, now)) continue;
    const key = taskPhase(task, currentKey, productionKey, logisticsKey === 'delivery' && logisticsInfo?.completed ? 'installation' : logisticsKey);
    const phase = phaseByKey(phases, key) || currentPhase;
    addUnique(phase.blockers, `Công việc quá hạn: ${task.title || task.unified_id || 'chưa đặt tên'}`);
  }

  for (const blocker of externalBlockers) {
    const phase = phaseByKey(phases, blocker?.phase_key) || currentPhase;
    addUnique(phase?.blockers || [], typeof blocker === 'string' ? blocker : blocker?.reason);
  }

  for (const phase of phases) {
    if (phase.progress_pct !== 100 && isPast(phase.deadline, now)) {
      addUnique(phase.blockers, `Chặng ${phase.label} đã quá deadline`);
    }
    const reasons = [...phase.blockers, ...phase.missing_requirements];
    phase.risk = {
      level: phase.blockers.length ? 'high'
        : phase.missing_requirements.length && (phase.key === currentKey || phase.progress_pct == null) ? 'medium'
          : phase.state === 'current' ? 'low' : 'none',
      reasons,
    };
    if (phase.blockers.length) phase.state = 'blocked';
    else if (phase.risk.level === 'medium' && phase.state !== 'completed') phase.state = 'at_risk';
  }

  const knownProgress = phases.map((phase) => phase.progress_pct).filter((value) => value != null);
  const blockerCount = phases.reduce((sum, phase) => sum + phase.blockers.length, 0);
  const atRiskCount = phases.filter((phase) => ['high', 'medium'].includes(phase.risk.level)).length;
  const overallProgress = knownProgress.length
    ? Math.round(knownProgress.reduce((sum, value) => sum + value, 0) / knownProgress.length)
    : null;
  const healthStatus = completedProject ? 'completed' : blockerCount ? 'blocked' : atRiskCount ? 'at_risk' : 'on_track';

  return {
    version: PROJECT_HEALTH_VERSION,
    source: 'projects + purchase_requests + production_pipeline_stages + logistics_pipeline_stages + unified_tasks_v + project_changes_v1',
    current_phase_key: currentKey,
    current_phase_label: phaseByKey(phases, currentKey)?.label || null,
    overall_progress_pct: overallProgress,
    health_status: healthStatus,
    blocker_count: blockerCount,
    at_risk_phase_count: atRiskCount,
    risk_causes: phases
      .filter((phase) => ['high', 'medium'].includes(phase.risk.level))
      .map((phase) => ({ phase_key: phase.key, phase_label: phase.label, level: phase.risk.level, reasons: phase.risk.reasons })),
    phases,
  };
}

module.exports = {
  PROJECT_HEALTH_VERSION,
  PROJECT_MACRO_PHASES,
  buildProjectHealthContract,
  classifyLogisticsStage,
  classifyProductionStage,
  isFinanceProductionStage,
};
