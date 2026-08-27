const assert = require('node:assert/strict');
const {
  normalizeBlueprintDefinition,
  validateBlueprintDefinition,
  buildBlueprintChangePlan,
  normalizeCompanyBlueprintOverrides,
  mergeCompanyBlueprintOverrides,
  resolveCompanyBlueprintDefinition,
  isMissingBlueprintSchema,
} = require('../src/helpers/businessBlueprint');

const normalized = normalizeBlueprintDefinition({
  schema_version: 2,
  modules: [
    'crm',
    { key: 'production', enabled: false, config: { mode: 'kanban' } },
    { key: 'crm', enabled: false },
    null,
  ],
  department_templates: ['sales', 'production', 'sales', '', null],
  processes: [{ key: 'sales_v1' }],
});

assert.equal(normalized.schema_version, 2);
assert.deepEqual(normalized.modules, [
  { key: 'crm', enabled: true, config: {} },
  { key: 'production', enabled: false, config: { mode: 'kanban' } },
]);
assert.deepEqual(normalized.department_templates, ['sales', 'production']);
assert.deepEqual(normalized.processes, [{ key: 'sales_v1' }]);

const invalid = validateBlueprintDefinition({
  modules: [],
  processes: [{ key: 'sales_v1', name: '', stages: [] }],
});
assert.equal(invalid.errors.length, 3);

const valid = validateBlueprintDefinition({
  modules: ['crm'],
  processes: [{ key: 'sales_v1', name: 'Kinh doanh', stages: ['lead', 'deal'] }],
});
assert.deepEqual(valid.errors, []);

const plan = buildBlueprintChangePlan(
  {
    modules: [
      { key: 'crm', enabled: true, config: { mode: 'classic' } },
      { key: 'legacy', enabled: true },
      { key: 'production', enabled: true },
    ],
    department_templates: ['sales', 'legacy-team'],
    processes: [
      { key: 'sales', name: 'Sales', stages: ['lead', 'deal'] },
      { key: 'legacy-process', name: 'Legacy', stages: ['open'] },
    ],
  },
  {
    modules: [
      { key: 'crm', enabled: true, config: { mode: 'business-os' } },
      { key: 'production', enabled: false },
      { key: 'finance', enabled: true },
    ],
    department_templates: ['sales', 'accounting'],
    processes: [
      { key: 'sales', name: 'Sales', stages: ['lead', 'qualification', 'deal'] },
      { key: 'order', name: 'Order', stages: ['confirmed'] },
    ],
  },
);
assert.equal(plan.has_changes, true);
assert.deepEqual(plan.modules.enable, ['finance']);
assert.deepEqual(plan.modules.disable, ['production']);
assert.deepEqual(plan.modules.reconfigure, ['crm']);
assert.deepEqual(plan.modules.retained_outside_blueprint, ['legacy']);
assert.deepEqual(plan.departments.add_templates, ['accounting']);
assert.deepEqual(plan.departments.retained_outside_blueprint, ['legacy-team']);
assert.deepEqual(plan.processes.add, ['order']);
assert.deepEqual(plan.processes.update, ['sales']);
assert.deepEqual(plan.processes.retained_outside_blueprint, ['legacy-process']);
assert.deepEqual(plan.destructive_actions, []);

const companyOverrides = normalizeCompanyBlueprintOverrides({
  modules: {
    crm: { config: { intake_mode: 'referral' } },
    production: { enabled: false },
  },
  department_templates: { add: ['installation'], hidden: ['accounting'] },
  processes: {
    sales: { definition: { name: 'Sales riêng A', stages: ['lead', 'deal'] } },
  },
  operating_kernel: { ai_requires_permission: true },
});
const companyV1 = resolveCompanyBlueprintDefinition({
  schema_version: 1,
  modules: [
    { key: 'crm', enabled: true, config: { intake_mode: 'all' } },
    { key: 'production', enabled: true },
  ],
  department_templates: ['sales', 'accounting'],
  processes: [{ key: 'sales', name: 'Sales chuẩn', stages: ['lead', 'qualification', 'deal'] }],
}, companyOverrides);
assert.deepEqual(companyV1.modules, [
  { key: 'crm', enabled: true, config: { intake_mode: 'referral' } },
  { key: 'production', enabled: false, config: {} },
]);
assert.deepEqual(companyV1.department_templates, ['sales', 'installation']);
assert.deepEqual(companyV1.processes, [
  { key: 'sales', name: 'Sales riêng A', stages: ['lead', 'deal'] },
]);

// Nâng Blueprint không làm mất override của công ty.
const preservedOverrides = mergeCompanyBlueprintOverrides(companyOverrides, undefined);
const companyV2 = resolveCompanyBlueprintDefinition({
  schema_version: 2,
  modules: [
    { key: 'crm', enabled: true, config: { intake_mode: 'campaign', scoring: true } },
    { key: 'production', enabled: true },
    { key: 'accounting', enabled: true },
  ],
  department_templates: ['sales', 'accounting', 'customer-care'],
  processes: [{ key: 'sales', name: 'Sales chuẩn v2', stages: ['lead', 'qualification', 'deal', 'order'] }],
}, preservedOverrides);
assert.equal(companyV2.schema_version, 2);
assert.deepEqual(companyV2.modules.find((item) => item.key === 'crm').config, {
  intake_mode: 'referral',
  scoring: true,
});
assert.equal(companyV2.modules.find((item) => item.key === 'production').enabled, false);
assert.deepEqual(companyV2.department_templates, ['sales', 'customer-care', 'installation']);
assert.equal(companyV2.processes[0].name, 'Sales riêng A');

const clearedOverrides = mergeCompanyBlueprintOverrides(companyOverrides, {
  modules: { production: null },
  processes: { sales: null },
});
assert.equal(Object.prototype.hasOwnProperty.call(clearedOverrides.modules, 'production'), false);
assert.equal(Object.prototype.hasOwnProperty.call(clearedOverrides.processes, 'sales'), false);

// Override của công ty A không rò sang công ty B và không làm thay đổi base.
const companyB = resolveCompanyBlueprintDefinition({
  modules: [{ key: 'production', enabled: true }],
  department_templates: ['accounting'],
  processes: [{ key: 'order', name: 'Đơn hàng', stages: ['confirmed'] }],
}, {});
assert.equal(companyB.modules[0].enabled, true);
assert.deepEqual(companyB.department_templates, ['accounting']);
assert.equal(Object.prototype.hasOwnProperty.call(companyV2, 'leads'), false);
assert.equal(Object.prototype.hasOwnProperty.call(companyV2, 'projects'), false);
assert.equal(Object.prototype.hasOwnProperty.call(companyV2, 'invoices'), false);

assert.equal(isMissingBlueprintSchema({ code: '42P01', message: 'missing relation' }), true);
assert.equal(isMissingBlueprintSchema({ code: 'PGRST205', message: 'schema cache' }), true);
assert.equal(isMissingBlueprintSchema({ code: 'XX000', message: 'company_blueprint_installations missing' }), true);
assert.equal(isMissingBlueprintSchema({ code: 'XX000', message: 'network timeout' }), false);

console.log('business-blueprint.test: OK');
