const {
  PROCESS_STAGES,
  SALES_PROCESS_KEY,
  SALES_PROCESS_NAME,
  buildQualificationRequirements,
} = require('./salesQualificationPilot');
const {
  DEFAULT_SLA_WARNING_MINUTES,
  buildQualificationFunnelKpi,
} = require('./businessOsQualificationAutomation');
const { buildDealWorkflowFunnelKpi } = require('./businessOsDealWorkflow');

const STAGE_KEYS = PROCESS_STAGES.map((stage) => stage.key);

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function latestAuditStateMap(audits = []) {
  const map = new Map();
  for (const row of audits) {
    const leadId = String(row?.entity_id || '');
    if (!leadId || map.has(leadId)) continue;
    const after = safeObject(row.after);
    if (after.process_key && after.process_key !== SALES_PROCESS_KEY) continue;
    map.set(leadId, after);
  }
  return map;
}

function instanceStateMap(instances = []) {
  return new Map((instances || []).map((row) => [String(row.record_id), row]));
}

function logicalStage(record, instance, auditState) {
  const candidate = instance?.current_stage_key
    || auditState?.stage_key
    || auditState?.to_stage_key
    || (record?.type === 'deal' ? 'deal' : 'lead');
  return STAGE_KEYS.includes(candidate) ? candidate : (record?.type === 'deal' ? 'deal' : 'lead');
}

function processState(instance, auditState) {
  const source = instance || auditState || {};
  return {
    status: source.status || null,
    stage_entered_at: source.stage_entered_at || null,
    sla_started_at: source.sla_started_at || null,
    sla_due_at: source.sla_due_at || null,
    qualified_at: source.qualified_at || null,
    converted_at: source.converted_at || null,
  };
}

function slaStatus(stageKey, dueAt, nowMs, warningMinutes = DEFAULT_SLA_WARNING_MINUTES) {
  if (!['qualification', 'survey', 'design', 'design_review'].includes(stageKey) || !dueAt) return 'none';
  const dueMs = new Date(dueAt).getTime();
  if (!Number.isFinite(dueMs)) return 'none';
  if (dueMs < nowMs) return 'overdue';
  if (warningMinutes > 0 && dueMs - nowMs <= warningMinutes * 60 * 1000) return 'at_risk';
  return 'on_track';
}

function operationalStatus({ stageKey, sla, ready, blockingTaskCount }) {
  if (stageKey === 'design_completed') return 'completed';
  if (sla === 'overdue') return 'sla_overdue';
  if (sla === 'at_risk') return 'sla_at_risk';
  if (blockingTaskCount > 0) return 'task_blocked';
  if (stageKey === 'qualified') return 'waiting_conversion';
  if (stageKey === 'deal') return 'waiting_route_selection';
  if (stageKey === 'qualification' && ready) return 'ready';
  if (!ready) return 'missing_information';
  return 'active';
}

function sortRecords(records) {
  const priority = {
    sla_overdue: 0,
    sla_at_risk: 1,
    task_blocked: 2,
    waiting_conversion: 3,
    ready: 4,
    missing_information: 5,
    active: 6,
    waiting_route_selection: 7,
    completed: 8,
  };
  return [...records].sort((a, b) => {
    const statusDiff = (priority[a.operational_status] ?? 99) - (priority[b.operational_status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
  });
}

function summarizeEvents(audits = []) {
  const uniqueByAction = (action) => new Set(
    audits.filter((row) => row.action === action).map((row) => String(row.entity_id)),
  ).size;
  return {
    qualification_started: uniqueByAction('sales.qualification.started'),
    qualification_completed: uniqueByAction('sales.qualification.completed'),
    converted_to_deal: uniqueByAction('sales.lead.converted_to_deal'),
  };
}

function buildBusinessOsSnapshot({
  records = [],
  audits = [],
  instances = [],
  blockingTasksByLead = new Map(),
  qualificationContract = null,
  qualificationAutomation = null,
  stageAutomations = {},
  qualificationValuesByLead = new Map(),
  now = new Date(),
} = {}) {
  const auditMap = latestAuditStateMap(audits);
  const instanceMap = instanceStateMap(instances);
  const nowMs = new Date(now).getTime();
  const counts = Object.fromEntries(STAGE_KEYS.map((key) => [key, 0]));

  const rows = records.map((record) => {
    const key = String(record.id);
    const instance = instanceMap.get(key) || null;
    const auditState = auditMap.get(key) || null;
    const stageKey = logicalStage(record, instance, auditState);
    counts[stageKey] = Number(counts[stageKey] || 0) + 1;

    const requirements = record.type === 'deal'
      ? []
      : buildQualificationRequirements(
        record,
        qualificationContract,
        qualificationValuesByLead.get(key) || {},
      );
    const requiredRequirements = requirements.filter((item) => item.required);
    const completed = requiredRequirements.filter((item) => item.complete).length;
    const blocking = blockingTasksByLead.get(key) || [];
    const ready = record.type === 'deal'
      || (requiredRequirements.length > 0 && completed === requiredRequirements.length && blocking.length === 0);
    const state = processState(instance, auditState);
    const sla = slaStatus(
      stageKey,
      state.sla_due_at,
      nowMs,
      stageKey === 'qualification'
        ? qualificationAutomation?.sla_policy?.warning_minutes
        : stageAutomations?.[stageKey]?.sla_policy?.warning_minutes,
    );

    return {
      id: record.id,
      code: record.code || null,
      title: record.title,
      type: record.type || 'lead',
      current_stage_key: stageKey,
      current_stage_name: PROCESS_STAGES.find((stage) => stage.key === stageKey)?.name || stageKey,
      process_status: state.status || (stageKey === 'design_completed' ? 'completed' : 'active'),
      operational_status: operationalStatus({
        stageKey,
        sla,
        ready,
        blockingTaskCount: blocking.length,
      }),
      sla_status: sla,
      sla_due_at: state.sla_due_at,
      qualified_at: state.qualified_at,
      converted_at: state.converted_at,
      information_completed: completed,
      information_total: requiredRequirements.length,
      optional_information_completed: requirements.filter((item) => !item.required && item.complete).length,
      optional_information_total: requirements.filter((item) => !item.required).length,
      missing_requirement_labels: requiredRequirements.filter((item) => !item.complete).map((item) => item.label),
      blocking_task_count: blocking.length,
      blocking_tasks: blocking.slice(0, 4).map((task) => ({
        id: task.id,
        title: task.title,
        block_reason: task.block_reason,
      })),
      owner: record.assignee || record.lead_owner || null,
      customer: record.customer || null,
      updated_at: record.updated_at || record.created_at || null,
      created_at: record.created_at || null,
    };
  });

  const sorted = sortRecords(rows);
  const funnelKpi = buildQualificationFunnelKpi({ records, instances, audits, now });
  const dealWorkflowKpi = buildDealWorkflowFunnelKpi({ records, instances });
  return {
    process: {
      key: SALES_PROCESS_KEY,
      name: SALES_PROCESS_NAME,
      stages: PROCESS_STAGES,
    },
    summary: {
      total_records: rows.length,
      stage_counts: counts,
      blocked_records: rows.filter((row) => ['task_blocked', 'missing_information'].includes(row.operational_status)).length,
      sla_at_risk: rows.filter((row) => row.sla_status === 'at_risk').length,
      sla_overdue: rows.filter((row) => row.sla_status === 'overdue').length,
      waiting_conversion: rows.filter((row) => row.current_stage_key === 'qualified').length,
      event_throughput: summarizeEvents(audits),
      funnel_kpi: funnelKpi,
      deal_workflow_kpi: dealWorkflowKpi,
    },
    records: sorted,
  };
}

module.exports = {
  STAGE_KEYS,
  latestAuditStateMap,
  logicalStage,
  slaStatus,
  buildBusinessOsSnapshot,
};
