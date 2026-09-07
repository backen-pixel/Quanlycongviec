'use strict';

/**
 * Pure, source-qualified logistics projection for the offline journey only.
 * Inputs MUST already be row-, field-, company- and edge-authorized. No source
 * reader, route, credential, write operation or permission fallback lives here.
 *
 * Source contracts:
 * - database/19_crm_sales.sql:175,194-198: planned order delivery and status events.
 * - database/99_project_orders_fulfillment.sql:8-18: order -> logistics project.
 * - frontend/src/components/LogisticsViews.jsx:190-195,225-228,391-400:
 *   install-date/legacy-install-date deadline view, day-past, completed hidden.
 * - backend/src/helpers/autoDealWonProject.js:14-44: production deadline is NOT
 *   an installation deadline; projects.delivery_date is a legacy install date.
 * - backend/src/helpers/autoFlow.js:218-239,289-290: delivered_at can be a
 *   project/installation state transition, not proof of customer receipt.
 */
const LOGISTICS_FIELDS = Object.freeze(['delivery_date', 'install_date', 'pickup_at',
  'shipped_at', 'delivered_at', 'logistics_company_id', 'logistics_person_id',
  'installer_person_id', 'vc_stage_slug', 'vc_temp_staged']);
const CONTRACT_KEY = 'JOURNEY_LOGISTICS_SOURCE_V1';
const FLAGS = ['SHIPPING', 'INSTALLING', 'INSTALL_DEADLINE_PAST', 'INCIDENT'];
const COMPLETED_STAGES = new Set(['completed', 'done', 'install_completed']);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const exact = (coverage, name) => coverage?.[name] === 'EXACT';
const refValid = (ref) => typeof ref === 'string' && /^[a-z][a-z0-9_]*:[A-Za-z0-9_-]{1,100}$/.test(ref);
const scalar = (value) => value === null || typeof value === 'string' || typeof value === 'boolean'
  || (typeof value === 'number' && Number.isFinite(value));
const select = (fields, names) => Object.fromEntries(names.filter((name) => has(fields, name)
  && scalar(fields[name])).map((name) => [name, fields[name]]));

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Same date-level predicate as the source deadline view, with its local clock
// made explicit as the journey's VN clock. Never assign midnight to an unknown
// timestamp or substitute production_deadline, deadline, or task due_at.
function vnDateKey(value) {
  if (validDate(value)) return value;
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    || !validDate(value.slice(0, 10))) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;
}

function projectState(project, todayDate, clockBasis) {
  const fields = project.fields || {};
  const gaps = [];
  const statusKnown = typeof fields.status === 'string' && fields.status.length > 0;
  const stageKnown = has(fields, 'vc_stage_slug') && (fields.vc_stage_slug === null
    || typeof fields.vc_stage_slug === 'string');
  const stage = typeof fields.vc_stage_slug === 'string' ? fields.vc_stage_slug.toLowerCase() : null;
  const completed = fields.status === 'completed' || COMPLETED_STAGES.has(stage);
  const tempKnown = has(fields, 'vc_temp_staged') && (typeof fields.vc_temp_staged === 'boolean'
    || fields.vc_temp_staged === null);
  const temporary = fields.vc_temp_staged === true;
  if (!statusKnown || !stageKnown) gaps.push('LOGISTICS_STATUS_OR_STAGE_UNKNOWN');
  if (!tempKnown || temporary) gaps.push('LOGISTICS_HANDOVER_TEMP_OR_UNKNOWN');
  const activity = (status, stageSlug) => {
    if (!tempKnown || temporary) return 'UNKNOWN';
    if (fields.status === status || stage === stageSlug) return 'YES';
    return statusKnown && stageKnown ? 'NO' : 'UNKNOWN';
  };
  const flagStates = { SHIPPING: activity('shipping', 'delivery'),
    INSTALLING: activity('installing', 'installation'), INSTALL_DEADLINE_PAST: 'UNKNOWN' };
  const sourceFields = select(fields, ['pickup_at', 'logistics_company_id', 'logistics_person_id',
    'installer_person_id', 'status', 'vc_stage_slug', 'vc_temp_staged']);
  let deadline;
  let deadlineSource;
  // Undefined means unavailable/denied, not permission to consult a fallback.
  if (has(fields, 'install_date') && fields.install_date) {
    deadline = fields.install_date; deadlineSource = 'projects.install_date';
  } else if (has(fields, 'install_date') && has(fields, 'delivery_date') && fields.delivery_date) {
    deadline = fields.delivery_date; deadlineSource = 'projects.delivery_date_legacy_install_date';
  }
  if (deadline !== undefined && scalar(deadline)) {
    sourceFields.install_deadline = deadline;
    sourceFields.install_deadline_source = deadlineSource;
  }
  if (completed) flagStates.INSTALL_DEADLINE_PAST = 'NO';
  else if (clockBasis !== 'Asia/Ho_Chi_Minh' || !validDate(todayDate)) gaps.push('INSTALL_CLOCK_BASIS_UNKNOWN');
  else if (!statusKnown || !stageKnown || !tempKnown || temporary) {
    // No conclusive negative when a completion/temporary field is unavailable.
  } else {
    const day = vnDateKey(deadline);
    if (day) flagStates.INSTALL_DEADLINE_PAST = day < todayDate ? 'YES' : 'NO';
    else gaps.push('INSTALL_DEADLINE_MISSING_OR_INVALID');
  }
  if (!has(fields, 'install_date')) gaps.push('INSTALL_FIELD_UNAVAILABLE_NO_FALLBACK');
  return { source_ref: project.ref, fields: sourceFields, flag_states: flagStates,
    install_deadline_state: flagStates.INSTALL_DEADLINE_PAST, gaps };
}

/**
 * @param {object} order Authorized projected order row.
 * @param {object} input records: Map(ref, authorized row); edges: authorized typed
 * source edges only; todayDate YYYY-MM-DD; clockBasis Asia/Ho_Chi_Minh.
 * coverage uses independent keys project, incident, logistics_project,
 * incident_project, each EXACT/PARTIAL/UNKNOWN. Missing is UNKNOWN.
 * edgePermissions is the trusted actor's granted edge-kind array.
 * Identifier fields (including logistics_company_id) must be scope-filtered by
 * the caller, just as executor_company_id is, before becoming projected fields.
 */
function projectOrderLogistics(order, { records, edges = [], todayDate, clockBasis,
  coverage = {}, edgePermissions = [] } = {}) {
  if (!order || order.entity !== 'order' || !refValid(order.ref) || !(records instanceof Map)) {
    throw new TypeError('AUTHORIZED_ORDER_AND_RECORD_MAP_REQUIRED');
  }
  if (order.source_type !== 'orders') return {
    contract_key: CONTRACT_KEY, state: 'UNKNOWN', flags: [],
    flag_states: Object.fromEntries(FLAGS.map((flag) => [flag, 'UNKNOWN'])),
    planning: {}, project_plans: [], source_refs: [order.ref], unique_order_count: null,
    basis: 'ORDERS_ID;PROJECTS_INSTALL_DEADLINE_VIEW;SOURCE_STATUS_NOT_ACCEPTANCE',
    gaps: ['ORDER_SOURCE_CONTRACT_REQUIRED'],
  };
  const permissions = new Set(edgePermissions);
  const gaps = ['SOURCE_STATUS_TIMESTAMPS_NOT_CUSTOMER_RECEIPT', 'ACTUAL_INSTALL_OUTCOME_NOT_CONNECTED',
    'INSTALL_DEADLINE_VIEW_NOT_FULL_EVENT_CALENDAR', 'CUSTOMER_ACCEPTANCE_NOT_INFERRED',
    'INCIDENT_REPORTER_RESOLVER_NOT_REPAIR_OWNER'];
  const refs = new Set([order.ref]);
  const projectRefs = new Set();
  let projectSourceMismatch = false;
  if (permissions.has('logistics_project')) for (const edge of edges) {
    if (edge.kind !== 'logistics_project' || edge.from !== order.ref) continue;
    const project = records.get(edge.to);
    if (project?.entity === 'project' && project.source_type !== 'projects') projectSourceMismatch = true;
    if (project?.entity === 'project' && project.source_type === 'projects'
      && refValid(project.ref) && project.ref === edge.to) projectRefs.add(project.ref);
  }
  // orders.logistics_project_id is one FK. Keep contradictory authorized
  // observations visible, but never silently bless them as one exact mapping.
  const linkComplete = permissions.has('logistics_project') && exact(coverage, 'logistics_project')
    && exact(coverage, 'project') && projectRefs.size <= 1 && !projectSourceMismatch;
  if (!linkComplete) gaps.push('LOGISTICS_PROJECT_LINK_SCOPE_OR_COVERAGE_UNKNOWN');
  if (projectRefs.size > 1) gaps.push('MULTIPLE_LOGISTICS_PROJECT_LINKS_SOURCE_CONFLICT');
  if (projectSourceMismatch) gaps.push('LOGISTICS_PROJECT_SOURCE_CONTRACT_REQUIRED');
  if (!projectRefs.size) gaps.push('LOGISTICS_PROJECT_LINK_MISSING_OR_UNAVAILABLE');
  const plans = [...projectRefs].sort().map((ref) => {
    refs.add(ref);
    return projectState(records.get(ref), todayDate, clockBasis);
  });
  const flagStates = {};
  for (const flag of FLAGS.slice(0, 3)) {
    const states = plans.map((plan) => plan.flag_states[flag]);
    flagStates[flag] = states.includes('YES') ? 'YES'
      : !linkComplete || !states.length || states.includes('UNKNOWN') ? 'UNKNOWN' : 'NO';
  }
  const incidentRefs = new Set();
  let incidentSourceMismatch = false;
  if (permissions.has('incident_project')) for (const edge of edges) {
    if (edge.kind !== 'incident_project' || !projectRefs.has(edge.to)) continue;
    const incident = records.get(edge.from);
    if (incident?.entity === 'incident' && incident.source_type !== 'project_incidents') incidentSourceMismatch = true;
    if (incident?.entity === 'incident' && incident.source_type === 'project_incidents'
      && refValid(incident.ref) && incident.ref === edge.from) incidentRefs.add(incident.ref);
  }
  const incidentsComplete = linkComplete && permissions.has('incident_project')
    && exact(coverage, 'incident_project') && exact(coverage, 'incident') && !incidentSourceMismatch;
  flagStates.INCIDENT = incidentRefs.size ? 'YES' : incidentsComplete && projectRefs.size ? 'NO' : 'UNKNOWN';
  if (!incidentsComplete) gaps.push('INCIDENT_LINK_SCOPE_OR_COVERAGE_UNKNOWN');
  if (incidentSourceMismatch) gaps.push('INCIDENT_SOURCE_CONTRACT_REQUIRED');
  for (const ref of incidentRefs) refs.add(ref);
  const planning = {};
  for (const [source, target] of [['delivery_date', 'planned_delivery_date'],
    ['shipped_at', 'status_shipped_at'], ['delivered_at', 'status_delivered_at']]) {
    if (has(order.fields, source) && scalar(order.fields[source])) planning[target] = order.fields[source];
  }
  return {
    contract_key: CONTRACT_KEY,
    state: linkComplete && plans.length && Object.values(flagStates).every((state) => state !== 'UNKNOWN') ? 'LINKED' : 'UNKNOWN',
    flags: FLAGS.filter((flag) => flagStates[flag] === 'YES'), flag_states: flagStates,
    planning, project_plans: plans, source_refs: [...refs].sort(), unique_order_count: 1,
    basis: 'ORDERS_ID;PROJECTS_INSTALL_DEADLINE_VIEW;SOURCE_STATUS_NOT_ACCEPTANCE',
    gaps: [...new Set([...gaps, ...plans.flatMap((plan) => plan.gaps)])],
  };
}

module.exports = { LOGISTICS_FIELDS, projectOrderLogistics };
