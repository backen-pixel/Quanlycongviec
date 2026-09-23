'use strict';

// Exercises the real registered /summary callback and the real query helper.
// Express/auth/admin-role and database transport are explicit test doubles.
// No HTTP server, application boot, config, credentials, SDK or network is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const routePath = path.join(__dirname, '../src/routes/workTasks.js');
const helperPath = path.join(__dirname, '../src/helpers/unifiedTasksQuery.js');
const plain = (value) => JSON.parse(JSON.stringify(value));
const employee = { userId: 'employee-fixture', role: 'employee', company_id: 'company-fixture' };
const manager = { userId: 'manager-fixture', role: 'manager', company_id: 'company-fixture' };
const row = (status, extra = {}) => ({ status, source: 'task', task_kind: 'SX', deadline: null, ...extra });

function harness(responses) {
  const pending = responses.slice();
  const reads = [];
  const forbidden = [];
  const loggedErrors = [];
  const registrations = [];
  const middleware = [];
  let authCalls = 0;
  const deny = (name) => (...args) => {
    forbidden.push(name);
    throw new Error(`Unexpected side effect or unrelated dependency: ${name}`);
  };
  const deniedExports = (names) => Object.fromEntries(names.map((name) => [name, deny(name)]));
  const supabase = {
    from(table) {
      const response = pending.shift();
      assert.ok(response, `Unexpected read: ${table}`);
      assert.equal(table, response.table);
      const record = { table, calls: [] };
      reads.push(record);
      let maximum = Infinity;
      const query = {};
      for (const method of ['select', 'eq', 'or', 'not', 'ilike', 'gte', 'lte', 'lt', 'order', 'in']) {
        query[method] = (...args) => { record.calls.push([method, ...plain(args)]); return query; };
      }
      query.limit = (limit) => { maximum = limit; record.calls.push(['limit', limit]); return query; };
      for (const method of ['insert', 'update', 'delete', 'upsert', 'rpc']) query[method] = deny(`DB.${method}`);
      query.then = (resolve, reject) => Promise.resolve({
        data: response.data == null ? response.data : response.data.slice(0, maximum),
        count: response.count,
        error: response.error,
      }).then(resolve, reject);
      return query;
    },
    rpc: deny('DB.rpc'),
  };
  const adminRole = {
    isSystemAdmin: (user) => user?.role === 'system_admin',
    isAdminLike: (user) => user?.role === 'system_admin' || user?.role === 'admin',
  };
  function load(filename, imports) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module,
      exports: module.exports,
      require(name) {
        assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
      },
      console: { error: (...args) => loggedErrors.push(args) },
    }, { filename, timeout: 1000 });
    return module.exports;
  }
  const helper = load(helperPath, {
    '../config/supabase': { supabase },
    './adminRole': adminRole,
  });
  const router = { use: (fn) => { middleware.push(fn); return router; } };
  for (const method of ['get', 'post', 'patch', 'delete']) {
    router[method] = (route, ...handlers) => { registrations.push({ method, route, handlers }); return router; };
  }
  const auth = (req, res, next) => { authCalls += 1; next(); };
  const exported = load(routePath, {
    express: { Router: () => router },
    '../middleware/auth': { auth },
    '../config/supabase': { supabase },
    '../helpers/adminRole': adminRole,
    '../helpers/projectTaskMutations': deniedExports(['createProjectTask', 'updateProjectTask', 'deleteProjectTask', 'addProjectTaskComment', 'toggleProjectTaskChecklist']),
    '../helpers/crmLeadTaskMutations': deniedExports(['createCrmLeadTask', 'updateCrmLeadTask', 'deleteCrmLeadTask', 'getCrmTaskLeadId']),
    '../helpers/crmAssignmentMutations': deniedExports(['createCrmAssignment', 'updateCrmAssignment', 'deleteCrmAssignment', 'addCrmAssignmentComment']),
    '../helpers/crmTaskLeadAccess': deniedExports(['assertCrmTaskLeadAccess', 'loadLeadForTaskAccess']),
    '../helpers/notifications': deniedExports(['createNotification']),
    '../helpers/crmKanbanDeadlineHistory': deniedExports(['mergeDeadlineHistoryIntoUnified']),
    '../helpers/crmTaskAttachmentCounts': deniedExports(['enrichUnifiedCrmTasks']),
    '../helpers/unifiedTasksQuery': helper,
  });
  assert.equal(exported, router);
  assert.deepEqual(middleware, [auth], 'The exported router must register auth');
  const matches = registrations.filter((entry) => entry.method === 'get' && entry.route === '/summary');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].handlers.length, 1);
  return {
    reads,
    loggedErrors,
    async request(query = {}, user = manager, tenantContext = null) {
      const req = { query, user, tenantContext };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = plain(value); return this; },
      };
      let nextCalls = 0;
      auth(req, res, () => { nextCalls += 1; });
      assert.equal(nextCalls, 1);
      await matches[0].handlers[0](req, res);
      assert.equal(authCalls, 1);
      assert.deepEqual(forbidden, [], 'Summary may not invoke a mutation, notification or unrelated helper');
      assert.equal(pending.length, 0, 'Every planned synthetic read must be consumed');
      return res;
    },
  };
}

function hasCall(read, expected) {
  assert.ok(read.calls.some((actual) => JSON.stringify(actual) === JSON.stringify(expected)),
    `Missing query operation ${JSON.stringify(expected)}`);
}

test('summary route returns separate done/cancelled/closed and completeness metadata', async () => {
  const h = harness([{ table: 'unified_tasks_v', data: [row('done'), row('completed'), row('cancelled'), row('pending')], count: 4 }]);
  const res = await h.request();
  assert.equal(res.statusCode, 200);
  assert.deepEqual({ total: res.body.total, done: res.body.done, cancelled: res.body.cancelled, closed: res.body.closed, open: res.body.open },
    { total: 4, done: 2, cancelled: 1, closed: 3, open: 1 });
  assert.deepEqual(res.body.by_status, { pending: 1, in_progress: 0, done: 2, cancelled: 1, other: 0 });
  assert.equal(res.body.coverage, 'EXACT');
  assert.equal(res.body.count_basis, 'UNIFIED_VIEW_ROWS');
  assert.equal(res.body.count_relation, 'eq');
  assert.equal(res.body.source_total_rows, 4);
  assert.equal(res.body.assignee_scope_complete, null);
  assert.equal(res.body.by_module.production, 4);
  hasCall(h.reads[0], ['select', 'unified_id, task_kind, source, status, deadline, assignee_id, lead_id', { count: 'exact' }]);
});

test('summary forwards supported filters and preserves actor company/employee query scope', async () => {
  const h = harness([{ table: 'unified_tasks_v', data: [], count: 0 }]);
  const res = await h.request({ status: 'pending', task_kind: 'SX', q: '  Fixture  ', date_from: '2099-01-01', date_to: '2099-02-01', open_only: 'true' }, employee);
  assert.equal(res.statusCode, 200);
  for (const operation of [
    ['eq', 'company_id', 'company-fixture'], ['eq', 'status', 'pending'], ['eq', 'task_kind', 'SX'],
    ['ilike', 'title', '%Fixture%'], ['gte', 'deadline', '2099-01-01'], ['lte', 'deadline', '2099-02-01'],
    ['not', 'status', 'in', '(done,completed,cancelled)'],
    ['or', 'assignee_id.eq.employee-fixture,created_by_id.eq.employee-fixture'],
  ]) hasCall(h.reads[0], operation);
});

test('summary preserves an explicit company filter for a system administrator', async () => {
  const h = harness([{ table: 'unified_tasks_v', data: [], count: 0 }]);
  const res = await h.request({ company_id: 'chosen-fixture-company' }, { userId: 'admin-fixture', role: 'system_admin' });
  assert.equal(res.statusCode, 200);
  hasCall(h.reads[0], ['eq', 'company_id', 'chosen-fixture-company']);
  assert.equal(h.reads[0].calls.some((call) => call[0] === 'or'), false);
});

test('summary exposes PARTIAL when 3001 source rows exceed the 3000-row limit', async () => {
  const h = harness([{ table: 'unified_tasks_v', data: Array.from({ length: 3001 }, () => row('pending')), count: 3001 }]);
  const res = await h.request();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 3000);
  assert.equal(res.body.source_total_rows, 3001);
  assert.equal(res.body.coverage, 'PARTIAL');
  assert.equal(res.body.count_relation, 'gte');
});

test('summary exposes UNKNOWN for assignee lookup even with an exact scoped row count', async () => {
  const h = harness([
    { table: 'crm_leads', data: [{ id: 'lead-fixture' }] },
    { table: 'unified_tasks_v', data: [row('pending')], count: 1 },
  ]);
  const res = await h.request({ assignee_id: 'other-employee-fixture' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.coverage, 'UNKNOWN');
  assert.equal(res.body.count_relation, 'unknown');
  assert.equal(res.body.assignee_scope_complete, null);
  hasCall(h.reads[0], ['eq', 'company_id', 'company-fixture']);
  hasCall(h.reads[0], ['or', 'assigned_to.eq.other-employee-fixture,lead_owner_id.eq.other-employee-fixture']);
  hasCall(h.reads[1], ['or', 'assignee_id.eq.other-employee-fixture,lead_id.in.(lead-fixture)']);
});

test('explicit lead filter bypasses assignee lead lookup and preserves EXACT view-row coverage', async () => {
  const h = harness([{ table: 'unified_tasks_v', data: [row('cancelled')], count: 1 }]);
  const res = await h.request({ lead_id: 'explicit-lead-fixture', assignee_id: 'ignored-assignee-fixture' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.coverage, 'EXACT');
  assert.equal(res.body.cancelled, 1);
  assert.equal(h.reads.length, 1);
  hasCall(h.reads[0], ['eq', 'lead_id', 'explicit-lead-fixture']);
  assert.equal(h.reads[0].calls.some((call) => JSON.stringify(call).includes('ignored-assignee-fixture')), false);
});

test('summary maps a view query failure to the established 500 response', async () => {
  const h = harness([{ table: 'unified_tasks_v', data: null, error: { message: 'Synthetic view failure' } }]);
  const res = await h.request();
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Synthetic view failure' });
  assert.equal(h.loggedErrors.length, 1);
});

test('summary preserves the fallback error for an assignee lookup failure without message', async () => {
  const h = harness([{ table: 'crm_leads', data: null, error: {} }]);
  const res = await h.request({ assignee_id: 'employee-fixture' });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Lỗi tải tổng hợp' });
  assert.equal(h.reads.length, 1, 'A failed assignee lookup must not fall through to a broad view read');
});

test('summary cannot claim completeness when the transport omits its total count', async () => {
  const h = harness([{ table: 'unified_tasks_v', data: [] }]);
  const res = await h.request();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 0);
  assert.equal(res.body.coverage, 'UNKNOWN');
  assert.equal(res.body.source_total_rows, null);
  assert.equal(res.body.count_relation, 'unknown');
});


const tenantAdmin = { userId: 'tenant-admin-fixture', role: 'admin', tenant_id: 'tenant-fixture' };
const verifiedTenantContext = {
  enforced: true, tenantId: 'tenant-fixture', companyIds: ['company-fixture', 'company-second-fixture'],
};

test('summary route passes middleware tenant context separately from caller-controlled query options', async () => {
  const h = harness([{ table: 'unified_tasks_v', data: [row('done')], count: 1 }]);
  const res = await h.request({
    tenantContext: { enforced: true, tenantId: 'foreign-tenant', companyIds: ['foreign-company'] },
    companyIds: ['foreign-company'], tenant_id: 'foreign-tenant',
  }, tenantAdmin, verifiedTenantContext);
  assert.equal(res.statusCode, 200);
  hasCall(h.reads[0], ['in', 'company_id', verifiedTenantContext.companyIds]);
  assert.equal(h.reads[0].calls.some((call) => JSON.stringify(call).includes('foreign-')), false);
  assert.equal(res.body.done, 1);
});

test('summary route returns 403 with a scope error code for missing, unenforced or mismatched middleware context', async () => {
  for (const context of [null, { ...verifiedTenantContext, enforced: false },
    { ...verifiedTenantContext, tenantId: 'another-tenant' }]) {
    const h = harness([]);
    const res = await h.request({ tenantContext: verifiedTenantContext }, tenantAdmin, context);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'tenant_scope_unverified');
    assert.equal(typeof res.body.error, 'string');
    assert.ok(res.body.error.length > 0);
    assert.equal(h.reads.length, 0, 'Rejected context must not reach a database transport');
  }
});

test('summary route returns zero accessible work for an empty verified tenant without reading the source', async () => {
  const h = harness([]);
  const res = await h.request({ assignee_id: 'employee-fixture' }, tenantAdmin,
    { ...verifiedTenantContext, companyIds: [] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 0); assert.equal(res.body.source_total_rows, 0);
  assert.equal(res.body.coverage, 'EXACT');
  assert.equal(h.reads.length, 0);
});
