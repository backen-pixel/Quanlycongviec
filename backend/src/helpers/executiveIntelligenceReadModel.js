const EXECUTIVE_INTELLIGENCE_VERSION = 'executive_intelligence_v1';

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum(rows, pick) {
  return (rows || []).reduce((total, row) => total + number(pick(row)), 0);
}

function financeEntries(financeByProject) {
  if (financeByProject instanceof Map) return [...financeByProject.entries()];
  return Object.entries(financeByProject || {});
}

function severityFromReasons(reasons = []) {
  return reasons.some((reason) => /quá hạn|trễ|đang chặn/i.test(String(reason))) ? 'high' : 'medium';
}

function sortRisks(rows) {
  return [...rows].sort((a, b) => {
    const severity = (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
    if (severity) return severity;
    return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
  });
}

function buildExecutiveIntelligence({
  companyId = null,
  overview = {},
  operations = {},
  financeByProject = {},
  generatedAt = new Date(),
} = {}) {
  const operationItems = operations?.queues?.all || [];
  const operationAttention = operations?.queues?.attention || [];
  const finances = financeEntries(financeByProject).map(([projectId, contract]) => ({
    project_id: projectId,
    contract,
  }));
  const completeFinance = finances.filter(({ contract }) => contract?.status === 'complete'
    && contract?.profitability?.forecast_complete === true);
  const partialFinance = finances.filter(({ contract }) => contract?.status !== 'complete'
    || contract?.profitability?.forecast_complete !== true);

  const risks = [];
  for (const project of operationAttention) {
    const reasons = project.attention_reasons || [];
    risks.push({
      id: `operation:${project.project_id}`,
      domain: 'operations',
      severity: severityFromReasons(reasons),
      project_id: project.project_id,
      project_code: project.code || null,
      title: project.name || project.code || 'Project chưa đặt tên',
      reason: reasons.join(' · ') || 'Project cần quản lý kiểm tra',
      owner: project.production_person || project.logistics_person || project.installation_person || null,
      deadline: project.deadline || null,
      href: `/business-os/operations/projects/${project.project_id}`,
      evidence: [
        { source: 'operations_kpi_v1', field: 'attention_reasons', value: reasons },
        { source: 'projects', field: 'project_id', value: project.project_id },
      ],
    });
  }

  for (const { project_id: projectId, contract } of finances) {
    const project = operationItems.find((item) => String(item.project_id) === String(projectId));
    for (const warning of contract?.warnings || []) {
      risks.push({
        id: `finance:${projectId}:${warning.key}`,
        domain: 'finance',
        severity: warning.severity === 'high' ? 'high' : 'medium',
        project_id: projectId,
        project_code: project?.code || null,
        title: project?.name || project?.code || 'Project chưa đặt tên',
        reason: warning.message,
        owner: null,
        deadline: null,
        href: `/business-os/operations/projects/${projectId}?tab=finance`,
        evidence: [
          { source: contract.version || 'project_finance_v1', field: warning.key, value: warning.count },
          { source: 'projects', field: 'project_id', value: projectId },
        ],
      });
    }
  }

  const aggregateRisks = [
    {
      id: 'sales:deal-overdue',
      count: overview?.urgent?.crm_deal_overdue,
      domain: 'sales',
      title: 'Deal CRM quá hạn',
      reason: `${number(overview?.urgent?.crm_deal_overdue)} Deal quá hạn cần chốt hành động tiếp theo`,
      href: '/business-os/sales',
      source: 'management_overview_v1',
    },
    {
      id: 'work:overdue',
      count: overview?.urgent?.overdue_tasks,
      domain: 'work',
      title: 'Công việc quá hạn',
      reason: `${number(overview?.urgent?.overdue_tasks)} công việc quá hạn trong phạm vi công ty`,
      href: '/business-os/work',
      source: 'work_kpi_v1',
    },
  ];
  for (const item of aggregateRisks) {
    if (number(item.count) <= 0) continue;
    risks.push({
      id: item.id,
      domain: item.domain,
      severity: 'high',
      project_id: null,
      project_code: null,
      title: item.title,
      reason: item.reason,
      owner: null,
      deadline: null,
      href: item.href,
      evidence: [{ source: item.source, field: 'count', value: number(item.count) }],
    });
  }

  const rankedRisks = sortRisks(risks);
  const financeComplete = finances.length > 0 && partialFinance.length === 0;
  const recommendations = rankedRisks.slice(0, 30).map((risk) => ({
    id: `recommend:${risk.id}`,
    mode: 'read_recommend',
    severity: risk.severity,
    domain: risk.domain,
    project_id: risk.project_id,
    title: risk.project_id ? `Kiểm tra ${risk.project_code || risk.title}` : risk.title,
    recommendation: risk.project_id
      ? `Mở Project, xác nhận nguyên nhân “${risk.reason}”, owner và hành động có deadline.`
      : `Mở danh sách nguồn và phân công người xử lý ${risk.reason.toLowerCase()}.`,
    reason: risk.reason,
    confidence: 'rule_based',
    requires_human_review: true,
    href: risk.href,
    evidence: risk.evidence,
  }));

  return {
    version: EXECUTIVE_INTELLIGENCE_VERSION,
    company_id: companyId,
    generated_at: generatedAt.toISOString(),
    mode: 'read_recommend',
    metrics: {
      sales_pipeline_value: number(overview?.kpis?.pipeline_value),
      crm_leads: number(overview?.kpis?.crm_leads),
      crm_deals: number(overview?.kpis?.crm_deals),
      crm_won: number(overview?.kpis?.crm_won),
      active_projects: number(operations?.stats?.unique_projects),
      attention_projects: number(operations?.stats?.attention),
      production_overdue: number(operations?.stats?.production_overdue),
      delivery_overdue: number(operations?.stats?.delivery_overdue),
      installation_overdue: number(operations?.stats?.installation_overdue),
      open_tasks: number(overview?.kpis?.open_tasks),
      overdue_tasks: number(overview?.kpis?.overdue_tasks),
      forecast_revenue: sum(finances, ({ contract }) => contract?.revenue?.forecast),
      receivables_outstanding: sum(finances, ({ contract }) => contract?.receivables?.outstanding),
      payables_outstanding: sum(finances, ({ contract }) => contract?.payables?.outstanding),
      forecast_cost: financeComplete
        ? sum(finances, ({ contract }) => contract?.cost?.forecast)
        : null,
      forecast_profit: financeComplete
        ? sum(finances, ({ contract }) => contract?.profitability?.forecast_profit)
        : null,
    },
    coverage: {
      operations: operations?.metric_contract?.version || null,
      finance_total_projects: finances.length,
      finance_complete_projects: completeFinance.length,
      finance_partial_projects: partialFinance.length,
      finance_portfolio_complete: financeComplete,
      finance_note: financeComplete
        ? 'Dự báo lợi nhuận toàn danh mục có đủ nguồn chi phí.'
        : 'Không công bố lợi nhuận toàn danh mục khi còn Project thiếu nguồn chi phí.',
    },
    risk_summary: {
      total: rankedRisks.length,
      critical: rankedRisks.filter((risk) => risk.severity === 'critical').length,
      high: rankedRisks.filter((risk) => risk.severity === 'high').length,
      medium: rankedRisks.filter((risk) => risk.severity === 'medium').length,
      by_domain: rankedRisks.reduce((result, risk) => ({
        ...result,
        [risk.domain]: number(result[risk.domain]) + 1,
      }), {}),
    },
    risks: rankedRisks,
    recommendations,
    sources: [
      overview?.metric_contract?.version || 'management_overview_v1',
      operations?.metric_contract?.version || 'operations_kpi_v1',
      'project_finance_v1',
      'projects',
      'unified_tasks_v',
    ],
    guardrails: {
      write_enabled: false,
      external_send_enabled: false,
      sensitive_actions_require_approval: true,
      every_recommendation_requires_evidence: true,
    },
  };
}

module.exports = {
  EXECUTIVE_INTELLIGENCE_VERSION,
  buildExecutiveIntelligence,
};
