const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Only copied source text is evaluated. All application imports are supplied
// explicitly; no app, configuration, environment, SDK or network is loaded.
function denied() { throw new Error('Unexpected application dependency use'); }
function loadSource(filename, dependencies) {
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require(id) {
      if (!Object.hasOwn(dependencies, id)) throw new Error(`Blocked import: ${id}`);
      return dependencies[id];
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/helpers', filename), 'utf8'), context, {
    filename,
    timeout: 2000,
  });
  return module.exports;
}

function loadUnified(rows = []) {
  const query = {
    select() { return this; },
    limit() { return this; },
    then(resolve, reject) {
      return Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve, reject);
    },
  };
  return loadSource('unifiedTasksQuery.js', {
    '../config/supabase': { supabase: { from(table) {
      assert.equal(table, 'unified_tasks_v');
      return query;
    } } },
    './adminRole': { isAdminLike: () => true, isSystemAdmin: () => true },
  });
}

function loadCockpit() {
  const unified = loadUnified();
  return loadSource('founderCockpitReadModel.js', {
    '../config/supabase': { supabase: { from: denied, rpc: denied } },
    './orgOverviewReportAi': { getOrgOverviewReport: denied },
    './unifiedTasksQuery': {
      DONE_STATUSES: unified.DONE_STATUSES,
      resolveModuleKey: unified.resolveModuleKey,
      buildUnifiedTasksBaseQuery: denied,
    },
    './supabaseFetchAll': { fetchAllPages: denied },
    './appModuleRegistry': { normalizeModuleRow: denied },
    './accountingDeals': { buildAccountingSummary: denied },
    './adminRole': { isAdminLike: denied },
    './founderPlatformCapabilities': { buildFounderPlatformCapabilities: denied },
  });
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const NOW = new Date('2026-09-23T00:00:00.000Z');
const { summarizeWorkRows, mergeWorkSummaries } = loadCockpit();

test('workload distinguishes completed work, cancelled work, closed work and open work', () => {
  const result = summarizeWorkRows([
    { status: 'done' }, { status: 'completed' }, { status: 'cancelled' }, { status: 'pending' },
  ], NOW);
  assert.equal(result.done, 2);
  assert.equal(result.cancelled, 1);
  assert.equal(result.closed, 3);
  assert.equal(result.open, 1);
  assert.equal(result.total, 4);
  assert.equal(result.by_status.done, 2);
  assert.equal(result.by_status.cancelled, 1);
  assert.equal(result.total, result.open + result.done + result.cancelled);
});

test('cancelled work stays excluded from open and overdue work', () => {
  const result = summarizeWorkRows([
    { status: 'cancelled', deadline: '2020-01-01' },
    { status: 'done', deadline: '2020-01-01' },
    { status: 'pending', deadline: '2020-01-01' },
    { status: 'in_progress', deadline: '2099-01-01' },
  ], NOW);
  assert.equal(result.open, 2);
  assert.equal(result.overdue, 1);
  assert.equal(result.done, 1);
  assert.equal(result.cancelled, 1);
  assert.equal(result.closed, 2);
});

test('empty available workload has real zeroes for completed, cancelled and closed', () => {
  const summary = summarizeWorkRows([], NOW);
  const merged = mergeWorkSummaries([]);
  for (const result of [summary, merged]) {
    for (const field of ['total', 'open', 'overdue', 'done', 'cancelled', 'closed']) {
      assert.equal(result[field], 0, field);
    }
  }
});

test('company summaries preserve separate totals and status buckets when merged', () => {
  const first = summarizeWorkRows([
    { status: 'done', task_kind: 'SX' },
    { status: 'cancelled', source: 'crm_task' },
  ], NOW);
  const second = summarizeWorkRows([
    { status: 'completed', task_kind: 'VC' },
    { status: 'cancelled', task_kind: 'Cá nhân' },
    { status: 'pending', task_kind: 'Giao việc' },
  ], NOW);
  const result = mergeWorkSummaries([{ value: first }, { value: second }]);
  assert.equal(result.done, 2);
  assert.equal(result.cancelled, 2);
  assert.equal(result.closed, 4);
  assert.equal(result.open, 1);
  assert.equal(result.total, 5);
  assert.equal(result.by_status.done, 2);
  assert.equal(result.by_status.cancelled, 2);
  assert.equal(result.by_module.crm, 1);
  assert.equal(result.by_module.production, 1);
  assert.equal(result.total, result.open + result.closed);
});

test('legacy reader without cancellation information leaves completion fields unknown', () => {
  const modern = summarizeWorkRows([{ status: 'completed' }, { status: 'cancelled' }], NOW);
  const legacy = { total: 3, open: 1, overdue: 0, done: 2, by_status: { done: 2 }, by_module: {} };
  const result = mergeWorkSummaries([{ value: modern }, { value: legacy }]);
  assert.equal(result.done, null);
  assert.equal(result.by_status.done, null);
  assert.equal(result.open, 1);
  assert.equal(result.overdue, 0);
  assert.equal(result.cancelled, null);
  assert.equal(result.by_status.cancelled, null);
  assert.equal(result.closed, null);
});

test('cockpit and unified API agree on shared status and module count contract', async () => {
  const statuses = ['done', 'completed', 'cancelled', 'pending', 'in_progress', 'review', 'blocked', '', 'unknown'];
  const kinds = ['CRM-Deal', 'SX', 'VC', 'Giao việc', 'Cá nhân', 'other'];
  const rows = statuses.map((status, index) => ({ status, task_kind: kinds[index % kinds.length] }));
  const cockpit = summarizeWorkRows(rows, NOW);
  const api = await loadUnified(rows).fetchUnifiedTasksSummary({ id: 'fixture-admin' });
  for (const key of ['total', 'open', 'overdue', 'done', 'cancelled', 'closed', 'by_status', 'by_module']) {
    assert.deepEqual(plain(cockpit[key]), plain(api[key]), key);
  }
});
