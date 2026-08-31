'use strict';

const { deepFreeze } = require('./immutable');
const { controlPlaneError } = require('./errors');

const DIRECT_DATABASE_PATTERN = /(supabase|database|sql|table[._-]?(crud|query)?|insert|update|delete|upsert|rpc)/i;

const CP1_TOOLS = deepFreeze({
  'production.delivery_risk.assess': {
    name: 'production.delivery_risk.assess',
    domain: 'production',
    allowed_agent_domains: ['production', 'project'],
    capability: 'production.delivery_risk.assess',
    permission: 'production.delivery_risk.read',
    application_service: 'production.delivery-risk-assessment',
    allowed_decision_levels: ['READ_ONLY', 'RECOMMEND'],
    allowed_input_fields: ['project_id', 'production_order_id', 'as_of_date'],
    mode: 'READ_ONLY_RECOMMEND',
  },
});

function isYmd(value) {
  const parts = String(value || '').split('-');
  if (parts.length !== 3 || parts.some((part) => !part || !Number.isInteger(Number(part)))) return false;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2) return false;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

function resolveGovernedTool(toolName) {
  const normalized = String(toolName || '').trim();
  if (!normalized) throw controlPlaneError('FORBIDDEN_TOOL', 'A governed tool name is required.');
  if (DIRECT_DATABASE_PATTERN.test(normalized)) {
    throw controlPlaneError(
      'DIRECT_DATABASE_ACCESS_DENIED',
      'Governed Agent Path cannot invoke database, SQL, Supabase or generic CRUD tools.',
    );
  }
  const definition = CP1_TOOLS[normalized];
  if (!definition) throw controlPlaneError('FORBIDDEN_TOOL', 'Tool is not allowed by the CP1 governed registry.');
  return definition;
}

function validateToolInput(definition, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw controlPlaneError('TOOL_INPUT_INVALID', 'Tool input must be an object.');
  }
  for (const key of Object.keys(input)) {
    if (DIRECT_DATABASE_PATTERN.test(key)) {
      throw controlPlaneError('DIRECT_DATABASE_ACCESS_DENIED', 'Direct database input is forbidden.');
    }
    if (!definition.allowed_input_fields.includes(key)) {
      throw controlPlaneError('TOOL_INPUT_FIELD_FORBIDDEN', 'Unexpected input field: ' + key);
    }
  }
  const projectId = String(input.project_id || '').trim();
  if (!projectId) throw controlPlaneError('PROJECT_ID_REQUIRED', 'project_id is required.');
  const productionOrderId = input.production_order_id == null
    ? null
    : String(input.production_order_id).trim();
  if (input.production_order_id != null && !productionOrderId) {
    throw controlPlaneError('PRODUCTION_ORDER_ID_INVALID', 'production_order_id is invalid.');
  }
  const asOfDate = input.as_of_date == null ? null : String(input.as_of_date).trim();
  if (asOfDate && !isYmd(asOfDate)) {
    throw controlPlaneError('AS_OF_DATE_INVALID', 'as_of_date must use YYYY-MM-DD.');
  }
  return deepFreeze({
    project_id: projectId,
    production_order_id: productionOrderId,
    as_of_date: asOfDate,
  });
}

module.exports = {
  CP1_TOOLS,
  DIRECT_DATABASE_PATTERN,
  isYmd,
  resolveGovernedTool,
  validateToolInput,
};
