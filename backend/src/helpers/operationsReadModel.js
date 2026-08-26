const OPERATIONS_KPI_VERSION = 'operations_kpi_v1';
const PHASE_ORDER = ['production', 'delivery', 'installation'];

function toTime(value, fallback = Number.POSITIVE_INFINITY) {
  if (!value) return fallback;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? fallback : time;
}

function isOverdue(project, phase = 'production') {
  const deadline = phase === 'production' ? (project.production_deadline || project.deadline) : project.deadline;
  return !!deadline && !['completed', 'cancelled'].includes(String(project.status || '').toLowerCase())
    && toTime(deadline) < Date.now();
}

function buildOperationsMetricContract(companyId) {
  return {
    version: OPERATIONS_KPI_VERSION,
    unit: 'project',
    source: 'projects + crm_leads + production_pipeline_stages + logistics_pipeline_stages',
    scope_company_id: companyId || null,
    phases: [...PHASE_ORDER],
    rules: {
      production: 'Project liên kết Deal thắng và thuộc góc nhìn vận hành',
      delivery: 'Project đã có công đoạn Logistics không thuộc nhóm Lắp đặt',
      installation: 'Project đã có công đoạn Logistics thuộc nhóm Lắp đặt',
      attention: 'Chờ xưởng tiếp nhận hoặc quá hạn',
    },
  };
}

function buildOperationsQueue({ production = [], delivery = [], installation = [], recordsByProject = {}, companiesById = {}, usersById = {}, companyId = null }) {
  const byProject = new Map();

  function add(project, phase) {
    if (!project?.id) return;
    const key = String(project.id);
    const current = byProject.get(key) || {
      project_id: project.id,
      code: project.code || null,
      name: project.name || null,
      status: project.status || null,
      company_id: project.company_id || null,
      logistics_company_id: project.logistics_company_id || null,
      install_address: project.install_address || null,
      deadline: project.production_deadline || project.deadline || null,
      production_deadline: project.production_deadline || null,
      delivery_date: project.delivery_date || null,
      install_date: project.install_date || null,
      updated_at: project.updated_at || null,
      phases: [],
      stages: {},
      deadlines: {},
      overdue_by_phase: {},
      attention_reasons: [],
    };
    if (!current.phases.includes(phase)) current.phases.push(phase);
    current.stages[phase] = project.stage || null;
    current.deadlines[phase] = phase === 'production' ? (project.production_deadline || project.deadline || null) : (project.deadline || null);
    if (phase === 'production' && !project.sx_kanban_column_id && !current.attention_reasons.includes('Chờ xưởng tiếp nhận')) {
      current.attention_reasons.push('Chờ xưởng tiếp nhận');
    }
    current.overdue_by_phase[phase] = isOverdue(project, phase);
    const overdueLabel = phase === 'production' ? 'Sản xuất quá hạn' : phase === 'delivery' ? 'Vận chuyển quá hạn' : 'Lắp đặt quá hạn';
    if (current.overdue_by_phase[phase] && !current.attention_reasons.includes(overdueLabel)) current.attention_reasons.push(overdueLabel);
    byProject.set(key, current);
  }

  production.forEach((project) => add(project, 'production'));
  delivery.forEach((project) => add(project, 'delivery'));
  installation.forEach((project) => add(project, 'installation'));

  const items = [...byProject.values()].map((item) => {
    const record = recordsByProject[String(item.project_id)] || null;
    const project = [...production, ...delivery, ...installation].find((row) => String(row.id) === String(item.project_id)) || {};
    item.phases.sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b));
    return {
      ...item,
      commercial_record: record,
      customer: record?.customer || null,
      commercial_company: record?.company_id ? companiesById[String(record.company_id)] || null : null,
      workshop_company: item.company_id ? companiesById[String(item.company_id)] || null : null,
      logistics_company: item.logistics_company_id ? companiesById[String(item.logistics_company_id)] || null : null,
      production_person: project.production_person_id ? usersById[String(project.production_person_id)] || null : null,
      logistics_person: project.logistics_person_id ? usersById[String(project.logistics_person_id)] || null : null,
      installation_person: (project.installation_person_id || project.installer_person_id)
        ? usersById[String(project.installation_person_id || project.installer_person_id)] || null
        : null,
      overdue: Object.values(item.overdue_by_phase).some(Boolean),
    };
  }).sort((a, b) => {
    const attention = Number(b.attention_reasons.length > 0) - Number(a.attention_reasons.length > 0);
    if (attention) return attention;
    const deadline = toTime(a.deadline) - toTime(b.deadline);
    if (deadline) return deadline;
    return toTime(b.updated_at, 0) - toTime(a.updated_at, 0);
  });

  const queues = {
    all: items,
    production: items.filter((item) => item.phases.includes('production')),
    delivery: items.filter((item) => item.phases.includes('delivery')),
    installation: items.filter((item) => item.phases.includes('installation')),
    attention: items.filter((item) => item.attention_reasons.length > 0),
  };
  const productionIntake = production.filter((project) => !project.sx_kanban_column_id).length;

  return {
    company_id: companyId,
    metric_contract: buildOperationsMetricContract(companyId),
    stats: {
      unique_projects: items.length,
      production: queues.production.length,
      production_intake: productionIntake,
      production_overdue: production.filter((project) => isOverdue(project, 'production')).length,
      delivery: queues.delivery.length,
      delivery_overdue: delivery.filter((project) => isOverdue(project, 'delivery')).length,
      installation: queues.installation.length,
      installation_overdue: installation.filter((project) => isOverdue(project, 'installation')).length,
      attention: queues.attention.length,
    },
    queues,
  };
}

module.exports = {
  OPERATIONS_KPI_VERSION,
  PHASE_ORDER,
  buildOperationsMetricContract,
  buildOperationsQueue,
  isOverdue,
};
