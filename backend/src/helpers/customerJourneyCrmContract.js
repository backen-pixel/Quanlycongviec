'use strict';

/**
 * Pure, source-qualified CRM read predicates for the isolated journey adapter.
 * Call ONLY after resource/field/edge authorization. No legacy route, config,
 * credential, database or mutation imports. These are open source records, not
 * a new canonical workflow or a replacement for the CRM stage-advance gate.
 */
const SOURCE_CONTRACTS = Object.freeze({
  survey: Object.freeze({
    key: 'crm_events_site_visit_open_v1',
    file: 'backend/src/routes/crm/shared/helpersBundle.js',
    symbol: 'SURVEY_EVENT_TYPES / SURVEY_EVENT_SELECT / normalizeOrgReportSurveyVisitRow',
    lines: '1265-1276, 1309-1314, 1337-1368',
    schema_file: 'database/22_events.sql',
    schema_lines: '20-22, 35-64',
    meaning: 'crm_events.event_type=site_visit; planned/in_progress; event ID unit',
  }),
  task: Object.freeze({
    key: 'crm_tasks_open_source_stage_v1',
    file: 'database/28_crm_tasks.sql',
    symbol: 'crm_tasks.status / crm_tasks.stage_slug / default template stage_slug',
    lines: '5-20, 48-52',
    configuration_file: 'database/214_crm_task_templates_pipeline_stage.sql',
    configuration_lines: '4-12, 37-43',
    meaning: 'crm_tasks pending/in_progress classified by explicit source stage_slug, not title',
  }),
  quotation_task: Object.freeze({
    key: 'crm_tasks_quotation_open_source_stage_v1',
    file: 'backend/src/routes/crm/routes/commercialDocs.js',
    symbol: 'quotation task stage_slug query (source semantics only; route never imported)',
    lines: '449-456',
    meaning: 'quotation and deal_quote_contract remain source task groups; not quotation document IDs',
  }),
  custom_stage_limit: Object.freeze({
    file: 'backend/src/routes/crm/routes/taskTemplates.js',
    symbol: 'effectiveStageSlug / pipeline_stage_id',
    lines: '226-250',
    meaning: 'pl_* custom stage IDs have no verified survey/design/quotation semantic mapping',
  }),
});

// Existing normalized fields status/event_type/planned_start_at are reused.
// end_time is planned_end_at, NEVER completed_at or an invented task deadline.
const CRM_FIELDS = Object.freeze(['stage_slug', 'event_type', 'planned_end_at']);
const CRM_ACTION_GROUPS = Object.freeze([
  {
    id: 'solution_surveys', system: 'solution',
    name: 'Khảo sát — lịch đang mở theo nguồn', entities: ['crm_event'],
    unit: 'crm_event', basis: 'stock', required_fields: ['event_type', 'status'],
    contract_key: SOURCE_CONTRACTS.survey.key,
  },
  {
    id: 'solution_design', system: 'solution',
    name: 'Thiết kế — nhiệm vụ đang mở theo nguồn', entities: ['task'],
    unit: 'crm_task', basis: 'stock', required_fields: ['stage_slug', 'status'],
    contract_key: SOURCE_CONTRACTS.task.key,
  },
  {
    id: 'solution_quotation_tasks', system: 'solution',
    name: 'Báo giá / Báo giá & Hợp đồng — nhiệm vụ đang mở', entities: ['task'],
    unit: 'crm_task', basis: 'stock', required_fields: ['stage_slug', 'status'],
    contract_key: SOURCE_CONTRACTS.quotation_task.key,
  },
].map((group) => Object.freeze({ ...group,
  entities: Object.freeze(group.entities), required_fields: Object.freeze(group.required_fields) })));

const TASK_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const EVENT_STATUSES = new Set(['planned', 'in_progress', 'completed', 'cancelled']);
// Source labels come from crmTaskLeadDocumentMeta.SLUG_LABELS:13-36. They
// distinguish a known different source category from an unclassified pl_* key.
const KNOWN_TASK_SLUGS = new Set(['consulting', 'design', 'quotation', 'contract',
  'deal_new', 'deal_quote_contract', 'deal_ordering', 'deal_schedule', 'deal_shipping', 'deal_notes',
  'sx_tiep_nhan', 'sx_thiet_ke_ke_hoach', 'sx_kiem_tra_cheo', 'sx_vat_tu',
  'sx_san_xuat_thung', 'sx_san_xuat_alu', 'sx_hoan_thien', 'sx_dong_goi', 'sx_giao_hang']);
const hasText = (value) => typeof value === 'string' && value.length > 0;

/**
 * Three-valued membership: null means unavailable/unsupported source predicate.
 * It must degrade coverage, not become an exact zero. Denied fields arrive
 * absent after projection and are handled identically to unavailable fields.
 */
function crmActionMembership(groupId, row) {
  const group = CRM_ACTION_GROUPS.find((candidate) => candidate.id === groupId);
  if (!group) return null;
  if (!row || !group.entities.includes(row.entity)) return false;
  const event = groupId === 'solution_surveys';
  if (row.source_type !== (event ? 'crm_events' : 'crm_tasks')) return false;
  const fields = row.fields || {};
  if (group.required_fields.some((field) => !hasText(fields[field]))) return null;
  if (event) {
    if (!EVENT_STATUSES.has(fields.status)) return null;
    return fields.event_type === 'site_visit'
      && ['planned', 'in_progress'].includes(fields.status);
  }
  if (!TASK_STATUSES.has(fields.status)) return null;
  if (['completed', 'cancelled'].includes(fields.status)) return false;
  if (!KNOWN_TASK_SLUGS.has(fields.stage_slug)) return null;
  return groupId === 'solution_design'
    ? fields.stage_slug === 'design'
    : ['quotation', 'deal_quote_contract'].includes(fields.stage_slug);
}

/** Presentation metadata only; never used to grant access or change membership. */
function describeCrmSource(row) {
  if (row?.entity === 'crm_event' && row.source_type === 'crm_events') {
    const member = crmActionMembership('solution_surveys', row);
    return {
      contract_key: SOURCE_CONTRACTS.survey.key, kind: 'SOURCE_EVENT',
      state: member === null ? 'UNKNOWN' : member ? 'OPEN_SITE_VISIT' : 'OUTSIDE_OPEN_SITE_VISIT',
      label: 'Lịch khảo sát nguồn; mốc lịch không phải bắt đầu/kết thúc thực tế',
      gaps: ['SURVEY_EVENT_NOT_A_TASK', 'SURVEY_PLANNED_TIMES_NOT_ACTUAL',
        ...(member === null ? ['CRM_EVENT_PREDICATE_UNKNOWN'] : [])],
    };
  }
  if (row?.entity === 'task' && row.source_type === 'crm_tasks') {
    const design = crmActionMembership('solution_design', row);
    const quotation = crmActionMembership('solution_quotation_tasks', row);
    return {
      contract_key: SOURCE_CONTRACTS.task.key, kind: 'SOURCE_TASK',
      state: design === null || quotation === null ? 'UNKNOWN'
        : design ? 'OPEN_DESIGN_TASK' : quotation ? 'OPEN_QUOTATION_OR_CONTRACT_TASK' : 'OUTSIDE_SUPPORTED_OPEN_STAGES',
      label: 'Nhiệm vụ theo stage_slug nguồn; không thay thế gate chuyển giai đoạn',
      gaps: ['OPEN_TASK_PREDICATE_NOT_STAGE_ADVANCE_GATE', 'QUOTATION_TASK_NOT_QUOTATION_DOCUMENT',
        ...(design === null || quotation === null ? ['CRM_TASK_STAGE_OR_STATUS_UNKNOWN'] : [])],
    };
  }
  return null;
}

module.exports = { CRM_FIELDS, CRM_ACTION_GROUPS, SOURCE_CONTRACTS, crmActionMembership, describeCrmSource };
