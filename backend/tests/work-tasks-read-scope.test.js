'use strict';

// Offline boundary tests of the actual registered GET callbacks, query helper,
// and CRM enrichment module. Router/auth/admin-role and database transport are
// explicit doubles; no application startup, SDK, credentials or network is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const plain = (value) => JSON.parse(JSON.stringify(value));
const tenantAdmin = { userId: 'admin-fixture', role: 'admin', tenant_id: 'tenant-fixture' };
const tenantEmployee = {
  userId: 'employee-fixture', role: 'employee', tenant_id: 'tenant-fixture', company_id: 'company-fixture',
};
const verifiedContext = {
  enforced: true, tenantId: 'tenant-fixture', companyIds: ['company-fixture', 'second-company-fixture'],
};
const endpoints = [
  { route: '/', query: {}, params: {}, empty: (body) => {
    assert.deepEqual(body.tasks, []);
    assert.equal(body.total, 0);
    assert.equal(body.page, 2);
    assert.equal(body.page_size, 10);
  } },
  { route: '/lead-options', query: { assignee_id: 'employee-fixture' }, params: {}, empty: (body) => {
    assert.deepEqual(body, { leads: [] });
  } },
  { route: '/by-project/:projectId', query: {}, params: { projectId: 'project-fixture' }, empty: (body) => {
    assert.equal(body.project_id, 'project-fixture');
    assert.deepEqual(body.tasks, []);
    assert.equal(body.progress.completed, 0);
    assert.equal(body.progress.total, 0);
    assert.deepEqual(body.groups, { crm_deal: [], production: [], logistics: [], assignment: [], other: [] });
  } },
];

function harness(responses = []) {
  const pending = responses.slice();
  const reads = [];
  const forbidden = [];
  const errors = [];
  const registrations = [];
  const middleware = [];
  const deny = (name) => () => {
    forbidden.push(name);
    throw new Error(`Unexpected side effect or unrelated dependency: ${name}`);
  };
  const deniedExports = (names) => Object.fromEntries(names.map((name) => [name, deny(name)]));
  const supabase = {
    from(table) {
      const record = { table, calls: [], executed: false };
      reads.push(record);
      const response = pending.shift();
      assert.ok(response, `Unexpected read: ${table}`);
      assert.equal(table, response.table);
      const query = {};
      let maximum = Infinity;
      for (const method of ['select', 'eq', 'or', 'not', 'ilike', 'gte', 'lte', 'lt', 'order', 'in', 'range']) {
        query[method] = (...args) => { record.calls.push([method, ...plain(args)]); return query; };
      }
      query.limit = (limit) => { maximum = limit; record.calls.push(['limit', limit]); return query; };
      for (const method of ['insert', 'update', 'delete', 'upsert', 'rpc']) query[method] = deny(`DB.${method}`);
      query.then = (resolve, reject) => {
        record.executed = true;
        return Promise.resolve({
          data: response.data == null ? response.data : plain(response.data).slice(0, maximum),
          error: response.error,
          count: response.count,
        }).then(resolve, reject);
      };
      return query;
    },
    rpc: deny('DB.rpc'),
  };
  // Mirror the documented adminRole predicates for the roles in these fixtures.
  // HTTP smoke tests separately load the actual auth and role-policy modules.
  const roleOf = (user) => String(user?.role || '').trim().toLowerCase();
  const adminRole = {
    isSystemAdmin: (user) => roleOf(user) === 'admin' && !String(user?.company_id || '').trim(),
    isAdminLike: (user) => ['admin', 'sales_admin', 'platform_admin'].includes(roleOf(user)),
  };
  function load(relative, imports) {
    const filename = path.join(__dirname, relative);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module, exports: module.exports,
      require(name) {
        assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
      },
      console: { error: (...args) => errors.push(args) },
    }, { filename, timeout: 1000 });
    return module.exports;
  }
  const helper = load('../src/helpers/unifiedTasksQuery.js', {
    '../config/supabase': { supabase }, './adminRole': adminRole,
  });
  const enrichment = load('../src/helpers/crmTaskAttachmentCounts.js', {});
  const router = { use: (handler) => { middleware.push(handler); return router; } };
  for (const method of ['get', 'post', 'patch', 'delete']) {
    router[method] = (route, ...handlers) => { registrations.push({ method, route, handlers }); return router; };
  }
  const auth = (_req, _res, next) => next();
  assert.equal(load('../src/routes/workTasks.js', {
    express: { Router: () => router },
    '../middleware/auth': { auth }, '../config/supabase': { supabase },
    '../helpers/adminRole': adminRole,
    '../helpers/projectTaskMutations': deniedExports(['createProjectTask', 'updateProjectTask', 'deleteProjectTask', 'addProjectTaskComment', 'toggleProjectTaskChecklist']),
    '../helpers/crmLeadTaskMutations': deniedExports(['createCrmLeadTask', 'updateCrmLeadTask', 'deleteCrmLeadTask', 'getCrmTaskLeadId']),
    '../helpers/crmAssignmentMutations': deniedExports(['createCrmAssignment', 'updateCrmAssignment', 'deleteCrmAssignment', 'addCrmAssignmentComment']),
    '../helpers/crmTaskLeadAccess': deniedExports(['assertCrmTaskLeadAccess', 'loadLeadForTaskAccess']),
    '../helpers/notifications': deniedExports(['createNotification']),
    '../helpers/crmKanbanDeadlineHistory': deniedExports(['mergeDeadlineHistoryIntoUnified']),
    '../helpers/crmTaskAttachmentCounts': enrichment,
    '../helpers/unifiedTasksQuery': helper,
  }), router);
  assert.deepEqual(middleware, [auth], 'Auth must remain registered on the router');
  return {
    reads, errors,
    async request(endpoint, { query = endpoint.query, params = endpoint.params, user = tenantAdmin, tenantContext = verifiedContext } = {}) {
      const matches = registrations.filter((entry) => entry.method === 'get' && entry.route === endpoint.route);
      assert.equal(matches.length, 1);
      assert.equal(matches[0].handlers.length, 1);
      const req = { query, params, user, tenantContext };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = plain(value); return this; },
      };
      let nextCalls = 0;
      auth(req, res, () => { nextCalls += 1; });
      assert.equal(nextCalls, 1);
      await matches[0].handlers[0](req, res);
      assert.deepEqual(forbidden, [], 'Read paths must not mutate or invoke unrelated helpers');
      assert.equal(pending.length, 0, 'Every planned synthetic read must be consumed');
      return res;
    },
  };
}

function hasCall(read, expected) {
  assert.ok(read.calls.some((actual) => JSON.stringify(actual) === JSON.stringify(expected)),
    `Missing query operation ${JSON.stringify(expected)} on ${read.table}`);
}

for (const endpoint of endpoints) {
  test(`${endpoint.route}: missing verified tenant context denies before any DB read`, async () => {
    const h = harness();
    const res = await h.request(endpoint, { tenantContext: null });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'tenant_scope_unverified');
    assert.deepEqual(h.reads, []);
  });

  test(`${endpoint.route}: mismatched verified tenant context denies before any DB read`, async () => {
    const h = harness();
    const res = await h.request(endpoint, { tenantContext: { ...verifiedContext, tenantId: 'other-tenant-fixture' } });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'tenant_scope_unverified');
    assert.deepEqual(h.reads, []);
  });

  test(`${endpoint.route}: verified empty tenant returns an empty contract without DB reads`, async () => {
    const h = harness();
    const res = await h.request(endpoint, {
      query: { ...endpoint.query, page: '2', page_size: '10', assignee_id: 'employee-fixture' },
      tenantContext: { ...verifiedContext, companyIds: [] },
    });
    assert.equal(res.statusCode, 200);
    endpoint.empty(res.body);
    assert.deepEqual(h.reads, []);
  });

  test(`${endpoint.route}: caller-supplied scope cannot replace the middleware company allowlist`, async () => {
    const responses = endpoint.route === '/' ? [{ table: 'unified_tasks_v', data: [], count: 0 }]
      : endpoint.route === '/lead-options' ? [{ table: 'crm_leads', data: [] }]
        : [{ table: 'crm_leads', data: [] }, { table: 'unified_tasks_v', data: [] }];
    const h = harness(responses);
    const res = await h.request(endpoint, { query: {
      ...endpoint.query,
      tenant_id: 'spoof-tenant', companyIds: ['spoof-company'], tenantCompanyIds: ['spoof-company'],
      tenantContext: { enforced: true, tenantId: 'spoof-tenant', companyIds: ['spoof-company'] },
    } });
    assert.equal(res.statusCode, 200);
    for (const read of h.reads) {
      hasCall(read, ['in', 'company_id', verifiedContext.companyIds]);
      assert.equal(JSON.stringify(read.calls).includes('spoof-'), false);
      assert.equal(read.executed, true);
    }
  });
}

test('lead-options verifies tenant context even when the caller omits assignee_id', async () => {
  const h = harness();
  const res = await h.request(endpoints[1], { query: {}, tenantContext: null });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'tenant_scope_unverified');
  assert.deepEqual(h.reads, []);
});

test('by-project surfaces a lead-discovery failure and never falls through to task reads', async () => {
  const h = harness([{ table: 'crm_leads', data: null, error: { message: 'Synthetic lead discovery failure' } }]);
  const res = await h.request(endpoints[2]);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Synthetic lead discovery failure' });
  assert.deepEqual(h.reads.map((read) => read.table), ['crm_leads']);
  assert.equal(h.errors.length, 1);
});

test('by-project retains employee scope in both task branches and excludes cancelled from completed after deduplication', async () => {
  const row = (id, status, extra = {}) => ({
    unified_id: id, source: 'task', task_kind: 'SX', status, company_id: 'company-fixture',
    project_id: 'project-fixture', ...extra,
  });
  const duplicate = row('task-done', 'done');
  const h = harness([
    { table: 'crm_leads', data: [{ id: 'lead-fixture' }] },
    { table: 'unified_tasks_v', data: [duplicate, row('task-cancelled', 'cancelled'), row('task-pending', 'pending')] },
    { table: 'unified_tasks_v', data: [duplicate, row('crm-completed', 'completed', { source: 'crm_task', task_kind: 'CRM-Deal', lead_id: 'lead-fixture' })] },
  ]);
  const res = await h.request(endpoints[2], { user: tenantEmployee });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.progress.completed, 2);
  assert.equal(res.body.progress.total, 4);
  assert.equal(res.body.tasks.length, 4);
  assert.equal(res.body.tasks.filter((item) => item.status === 'cancelled').length, 1);
  assert.equal(res.body.tasks.filter((item) => item.unified_id === 'task-done').length, 1);
  for (const read of h.reads) {
    hasCall(read, ['in', 'company_id', verifiedContext.companyIds]);
    hasCall(read, ['eq', 'company_id', 'company-fixture']);
  }
  hasCall(h.reads[0], ['eq', 'project_id', 'project-fixture']);
  hasCall(h.reads[1], ['eq', 'project_id', 'project-fixture']);
  hasCall(h.reads[2], ['in', 'lead_id', ['lead-fixture']]);
  for (const read of h.reads.slice(1)) {
    hasCall(read, ['or', 'assignee_id.eq.employee-fixture,created_by_id.eq.employee-fixture']);
  }
});

const companySalesAdmin = {
  userId: 'sales-admin-fixture', role: 'sales_admin', tenant_id: 'tenant-fixture', company_id: 'company-fixture',
};
const companyScopedEndpoints = [...endpoints, { route: '/summary', query: {}, params: {} }];

for (const endpoint of companyScopedEndpoints) {
  test(`${endpoint.route}: company-bound sales admin cannot switch to another company in the same tenant`, async () => {
    const h = harness();
    const res = await h.request(endpoint, {
      query: { ...endpoint.query, company_id: 'second-company-fixture' }, user: companySalesAdmin,
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'company_scope_denied');
    assert.deepEqual(h.reads, [], 'A rejected company switch must precede discovery, view and enrichment reads');
  });

  test(`${endpoint.route}: explicit own company remains available to the company-bound sales admin`, async () => {
    const responses = endpoint.route === '/' || endpoint.route === '/summary'
      ? [{ table: 'unified_tasks_v', data: [], count: 0 }]
      : endpoint.route === '/lead-options' ? [{ table: 'crm_leads', data: [] }]
        : [{ table: 'crm_leads', data: [] }, { table: 'unified_tasks_v', data: [] }];
    const h = harness(responses);
    const res = await h.request(endpoint, {
      query: { ...endpoint.query, company_id: 'company-fixture' }, user: companySalesAdmin,
    });
    assert.equal(res.statusCode, 200);
    for (const read of h.reads) {
      hasCall(read, ['eq', 'company_id', 'company-fixture']);
      hasCall(read, ['in', 'company_id', verifiedContext.companyIds]);
      assert.equal(read.executed, true);
    }
  });
}
