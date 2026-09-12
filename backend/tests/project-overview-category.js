const assert = require('assert');
const {
  projectOverviewCategoryId,
  projectOverviewSharedCategoryTitle,
  sharedWorkspaceStageSlug,
  firstVisibleOwnerId,
  isHiddenOverviewOwner,
  productionOwnerCandidateIds,
} = require('../src/helpers/projectOverviewCategory');

const sxStageId = '654738d6-568a-411c-9733-931b119bc844';
const psTaskId = '47518519-cbae-4b6c-9761-e5c80eb3e566';
const templateTaskId = '7676fd7e-c8c0-40fb-89b2-3c4bc46ec671';

const crmDetailById = new Map([
  [psTaskId, {
    pipeline_stage_id: sxStageId,
    stage_slug: 'shared_workspace',
  }],
  [templateTaskId, {
    pipeline_stage_id: sxStageId,
    stage_slug: 'pl_san_xuat_654738d6',
  }],
]);

const psTask = { source: 'crm_task', source_id: psTaskId };
const templateTask = { source: 'crm_task', source_id: templateTaskId };

assert.strictEqual(sharedWorkspaceStageSlug(crmDetailById.get(psTaskId)), 'shared_workspace');
assert.strictEqual(sharedWorkspaceStageSlug(crmDetailById.get(templateTaskId)), '');
assert.strictEqual(projectOverviewSharedCategoryTitle(crmDetailById.get(psTaskId)), 'Không gian chung');
assert.strictEqual(projectOverviewSharedCategoryTitle(crmDetailById.get(templateTaskId)), '');

const psCategory = projectOverviewCategoryId(psTask, new Map(), crmDetailById);
const templateCategory = projectOverviewCategoryId(templateTask, new Map(), crmDetailById);

assert.strictEqual(psCategory, 'shared:shared_workspace');
assert.strictEqual(templateCategory, sxStageId);
assert.notStrictEqual(
  psCategory,
  templateCategory,
  'việc Không gian chung không được gom vào cột Sản xuất.',
);

assert.strictEqual(
  projectOverviewCategoryId(
    { source: 'crm_task', source_id: 'sx-shared' },
    new Map(),
    new Map([['sx-shared', { stage_slug: 'sx_shared', pipeline_stage_id: sxStageId }]]),
  ),
  'shared:sx_shared',
);

const thanh = { id: '646e364e-504d-4362-af1a-4f4694b0d05d', role: 'admin', company_id: null };
const sang = { id: 'baae8329-c0a0-4893-a858-f4918323d7da', role: 'production', company_id: 'co-a' };
const userById = new Map([
  [thanh.id, thanh],
  [sang.id, sang],
]);
assert.strictEqual(isHiddenOverviewOwner(thanh), true);
assert.strictEqual(isHiddenOverviewOwner(sang), false);
assert.strictEqual(firstVisibleOwnerId([thanh.id, sang.id], userById), sang.id);
assert.strictEqual(firstVisibleOwnerId([thanh.id], userById), null);

const minh = { id: 'a9e1da57-9b5e-4443-b967-70d281fcf918', role: 'crm_production_staff', company_id: 'co-pd' };
userById.set(minh.id, minh);
const handoverByCompany = new Map([['co-pd', minh.id]]);
assert.deepStrictEqual(
  productionOwnerCandidateIds({ company_id: 'co-pd', production_person_id: null }, null, handoverByCompany),
  [null, null, minh.id],
);
assert.strictEqual(
  firstVisibleOwnerId(
    productionOwnerCandidateIds({ company_id: 'co-pd', production_person_id: null }, thanh.id, handoverByCompany),
    userById,
  ),
  minh.id,
);

console.log('project-overview-category: OK');
