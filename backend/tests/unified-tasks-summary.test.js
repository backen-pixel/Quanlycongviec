'use strict';

// Offline response-contract regressions. Evaluate the real helper with two
// explicit fakes; never load application config, credentials, SDKs or a server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '../src/helpers/unifiedTasksQuery.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const ADMIN = { id: 'admin-a', role: 'system_admin' };
const EMPLOYEE = { id: 'employee-a', role: 'employee', company_id: 'company-a' };
const MANAGER = { id: 'manager-a', role: 'manager', company_id: 'company-a' };
const makeTask = (id, fields = {}) => ({
  unified_id: `task:${id}`, task_kind: 'Dự án', source: 'task', status: 'pending',
  deadline: null, company_id: 'company-a', assignee_id: null, created_by_id: null,
  lead_id: null, title: `Task ${id}`, ...fields,
});
const makeLead = (id, fields = {}) => ({
  id, company_id: 'company-a', assigned_to: 'employee-a', lead_owner_id: null, ...fields,
});

function matchesOr(row, expression) {
  return expression.split(/,(?![^()]*\))/).some((part) => {
    const match = /^([^.]*)\.(eq|in)\.(.*)$/.exec(part);
    if (!match) throw new Error(`Unsupported fake filter: ${part}`);
    const [, field, operator, value] = match;
    return operator === 'eq'
      ? String(row[field]) === value
      : value.slice(1, -1).split(',').includes(String(row[field]));
  });
}

function harness({ tasks = [], leads = [], taskCap = Infinity, leadCap = Infinity,
  omitTaskCount = false, taskCountOverride, taskError = null, leadError = null } = {}) {
  const queries = [];
  const db = { from(table) {
    assert.ok(['unified_tasks_v', 'crm_leads'].includes(table), `Unexpected table: ${table}`);
    const record = { table, operations: [], selection: null, selectionOptions: undefined };
    queries.push(record);
    const predicates = [];
    let limit = Infinity;
    const query = {
      select(fields, options) {
        record.selection = fields; record.selectionOptions = options; return query;
      },
      eq(field, value) {
        record.operations.push(['eq', field, value]);
        predicates.push((row) => row[field] === value); return query;
      },
      or(expression) {
        record.operations.push(['or', expression]);
        predicates.push((row) => matchesOr(row, expression)); return query;
      },
      not(field, operator, value) {
        record.operations.push(['not', field, operator, value]);
        if (operator === 'in') {
          const values = value.slice(1, -1).split(',');
          predicates.push((row) => row[field] != null && !values.includes(String(row[field])));
        } else if (operator === 'is' && value === null) {
          predicates.push((row) => row[field] != null);
        } else throw new Error(`Unsupported fake not filter: ${operator}`);
        return query;
      },
      ilike(field, value) {
        assert.ok(value.startsWith('%') && value.endsWith('%'));
        predicates.push((row) => String(row[field] || '').toLowerCase().includes(value.slice(1, -1).toLowerCase()));
        return query;
      },
      gte(field, value) { predicates.push((row) => row[field] != null && row[field] >= value); return query; },
      lte(field, value) { predicates.push((row) => row[field] != null && row[field] <= value); return query; },
      lt(field, value) { predicates.push((row) => row[field] != null && row[field] < value); return query; },
      order() { return query; },
      limit(value) { limit = value; return query; },
      then(resolve, reject) {
        const isTasks = table === 'unified_tasks_v';
        const matching = (isTasks ? tasks : leads).filter((row) => predicates.every((predicate) => predicate(row)));
        const options = record.selectionOptions || {};
        const count = options.count !== 'exact' || (isTasks && omitTaskCount) ? null
          : isTasks && taskCountOverride !== undefined ? taskCountOverride : matching.length;
        return Promise.resolve({
          data: options.head ? null : matching.slice(0, Math.min(limit, isTasks ? taskCap : leadCap)),
          count, error: isTasks ? taskError : leadError,
        }).then(resolve, reject);
      },
    };
    return query;
  } };
  const fakeRequire = (name) => {
    if (name === '../config/supabase') return { supabase: db };
    if (name === './adminRole') return {
      isAdminLike: (user) => ['admin', 'system_admin'].includes(user.role),
      isSystemAdmin: (user) => user.role === 'system_admin',
    };
    throw new Error(`Unexpected source import: ${name}`);
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: fakeRequire }, {
    timeout: 1000, filename: sourcePath,
  });
  return { api: module.exports, queries,
    summary: (user = ADMIN, opts = {}) => module.exports.fetchUnifiedTasksSummary(user, opts) };
}

function reconcile(result) {
  assert.equal(result.total, result.open + result.done + result.cancelled);
  assert.equal(result.closed, result.done + result.cancelled);
  assert.equal(result.total, Object.values(result.by_status).reduce((sum, count) => sum + count, 0));
  assert.equal(result.total, Object.values(result.by_module).reduce((sum, count) => sum + count, 0));
}

test('summary separates completed and cancelled; statuses and modules reconcile to observed rows', async () => {
  const tasks = [
    makeTask('done', { status: 'done', task_kind: 'CRM-Deal' }),
    makeTask('completed', { status: 'completed', task_kind: 'SX' }),
    makeTask('cancelled', { status: 'cancelled', task_kind: 'VC', deadline: '2000-01-01T00:00:00Z' }),
    makeTask('pending', { task_kind: 'Giao việc', deadline: '2000-01-01T00:00:00Z' }),
    makeTask('progress', { status: 'in_progress', task_kind: 'Cá nhân' }),
    makeTask('review', { status: 'review', task_kind: 'Unknown' }),
    makeTask('blocked', { status: 'blocked', task_kind: 'CRM-Lead' }),
    makeTask('unknown', { status: 'custom', task_kind: 'Unknown' }),
    makeTask('empty', { status: '', task_kind: 'Unknown', source: 'crm_assignment' }),
  ];
  const result = await harness({ tasks }).summary();
  assert.equal(result.done, 2); assert.equal(result.cancelled, 1);
  assert.equal(result.open, 6); assert.equal(result.overdue, 1);
  assert.deepEqual({ ...result.by_status }, { pending: 2, in_progress: 3, done: 2, cancelled: 1, other: 1 });
  assert.deepEqual({ ...result.by_module }, { crm: 2, production: 1, logistics: 1, assignment: 2, personal: 1, other: 2 });
  assert.equal(result.coverage, 'EXACT'); assert.equal(result.count_basis, 'UNIFIED_VIEW_ROWS');
  reconcile(result);
});

test('3001 source rows cannot become an exact 3000-row summary', async () => {
  const result = await harness({ tasks: Array.from({ length: 3001 }, (_, i) => makeTask(i)) }).summary();
  assert.equal(result.total, 3000); assert.equal(result.source_total_rows, 3001);
  assert.equal(result.coverage, 'PARTIAL'); assert.equal(result.count_relation, 'gte');
});

test('a lower server response cap is also partial when the source count is larger', async () => {
  const result = await harness({ tasks: Array.from({ length: 1500 }, (_, i) => makeTask(i)), taskCap: 1000 }).summary();
  assert.equal(result.total, 1000); assert.equal(result.source_total_rows, 1500);
  assert.equal(result.coverage, 'PARTIAL'); assert.equal(result.count_relation, 'gte');
});

test('exactly 3000 source rows may be exact in view-row units', async () => {
  const result = await harness({ tasks: Array.from({ length: 3000 }, (_, i) => makeTask(i)) }).summary();
  assert.equal(result.total, 3000); assert.equal(result.source_total_rows, 3000);
  assert.equal(result.coverage, 'EXACT'); assert.equal(result.count_relation, 'eq');
});

test('missing or inconsistent totals never prove completeness of a short or empty response', async () => {
  for (const options of [
    { tasks: [], omitTaskCount: true },
    { tasks: [makeTask(1)], omitTaskCount: true },
    { tasks: [makeTask(1)], taskCountOverride: 0 },
    { tasks: [makeTask(1)], taskCountOverride: 1.5 },
  ]) {
    const result = await harness(options).summary();
    assert.equal(result.coverage, 'UNKNOWN'); assert.equal(result.source_total_rows, null);
    assert.equal(result.count_relation, 'unknown');
  }
  const empty = await harness().summary();
  assert.equal(empty.total, 0); assert.equal(empty.source_total_rows, 0);
  assert.equal(empty.coverage, 'EXACT');
});

test('a full response at the 3000-row cap remains partial when exact source count is unavailable', async () => {
  const result = await harness({ tasks: Array.from({ length: 3001 }, (_, i) => makeTask(i)), omitTaskCount: true }).summary();
  assert.equal(result.total, 3000); assert.equal(result.coverage, 'PARTIAL');
  assert.equal(result.source_total_rows, null); assert.equal(result.count_relation, 'gte');
});

test('source errors propagate without presenting a successful empty summary', async () => {
  const taskError = new Error('synthetic task source failure');
  await assert.rejects(harness({ taskError }).summary(), (error) => error === taskError);
  const leadError = new Error('synthetic lead source failure');
  const failedScope = harness({ leadError });
  await assert.rejects(failedScope.summary(MANAGER, { assignee_id: 'employee-a' }), (error) => error === leadError);
  assert.equal(failedScope.queries.filter((query) => query.table === 'unified_tasks_v').length, 0);
});

test('500 returned lead IDs make assignee scope partial even if every queried task was returned', async () => {
  const leads = Array.from({ length: 501 }, (_, i) => makeLead(`lead-${i}`));
  const result = await harness({ leads, tasks: [makeTask(1, { lead_id: 'lead-0' })] })
    .summary(MANAGER, { assignee_id: 'employee-a' });
  assert.equal(result.total, 1); assert.equal(result.source_total_rows, 1);
  assert.equal(result.coverage, 'PARTIAL'); assert.equal(result.assignee_scope_complete, false);
  assert.equal(result.count_relation, 'gte');
});

test('lead source capped below 500 cannot falsely label the narrower task query EXACT', async () => {
  const leads = [makeLead('lead-a'), makeLead('lead-b')];
  const tasks = [makeTask('a', { lead_id: 'lead-a' }), makeTask('b', { lead_id: 'lead-b' })];
  const result = await harness({ leads, tasks, leadCap: 1 }).summary(MANAGER, { assignee_id: 'employee-a' });
  assert.equal(result.total, 1, 'The fake lead source hides lead-b before the task query is built');
  assert.equal(result.source_total_rows, 1, 'Exact task count covers only the discovered lead IDs');
  assert.equal(result.coverage, 'UNKNOWN'); assert.equal(result.count_relation, 'unknown');
  assert.equal(result.assignee_scope_complete, null);
});

test('a short or empty assignee lead response remains unknown without completeness evidence', async () => {
  for (const leads of [[], [makeLead('lead-a')]]) {
    const result = await harness({ leads, tasks: [makeTask('direct', { assignee_id: 'employee-a' })] })
      .summary(MANAGER, { assignee_id: 'employee-a' });
    assert.equal(result.total, 1); assert.equal(result.source_total_rows, 1);
    assert.equal(result.coverage, 'UNKNOWN'); assert.equal(result.assignee_scope_complete, null);
  }
});

test('known task truncation takes precedence over unresolved assignee scope', async () => {
  const tasks = [makeTask(1, { assignee_id: 'employee-a' }), makeTask(2, { assignee_id: 'employee-a' })];
  const result = await harness({ tasks, taskCap: 1 }).summary(MANAGER, { assignee_id: 'employee-a' });
  assert.equal(result.total, 1); assert.equal(result.source_total_rows, 2);
  assert.equal(result.coverage, 'PARTIAL'); assert.equal(result.count_relation, 'gte');
  assert.equal(result.assignee_scope_complete, null);
});

test('explicit lead scope bypasses assignee discovery and may have exact task coverage', async () => {
  const h = harness({
    tasks: [makeTask('included', { lead_id: 'lead-a', assignee_id: 'someone-else' }),
      makeTask('excluded', { lead_id: 'lead-b', assignee_id: 'employee-a' })],
    leadError: new Error('Must not query lead discovery for an explicit lead'),
  });
  const result = await h.summary(MANAGER, { lead_id: 'lead-a', assignee_id: 'employee-a' });
  assert.equal(result.total, 1); assert.equal(result.coverage, 'EXACT');
  assert.equal(h.queries.filter((query) => query.table === 'crm_leads').length, 0);
});

test('employee summary retains company and assigned-or-created visibility filters', async () => {
  const tasks = [
    makeTask('assigned', { assignee_id: 'employee-a' }),
    makeTask('created', { created_by_id: 'employee-a' }),
    makeTask('both', { assignee_id: 'employee-a', created_by_id: 'employee-a' }),
    makeTask('other-company', { company_id: 'company-b', assignee_id: 'employee-a' }),
    makeTask('unrelated', { assignee_id: 'employee-b', created_by_id: 'employee-b' }),
  ];
  const result = await harness({ tasks }).summary(EMPLOYEE);
  assert.equal(result.total, 3); assert.equal(result.source_total_rows, 3);
  assert.equal(result.coverage, 'EXACT'); reconcile(result);
});

test('manager and system-admin company behavior is retained, including explicit company selection', async () => {
  const h = harness({ tasks: [makeTask('a'), makeTask('b', { company_id: 'company-b' })] });
  assert.equal((await h.summary(MANAGER)).total, 1);
  assert.equal((await h.summary(ADMIN)).total, 2);
  assert.equal((await h.summary(ADMIN, { company_id: 'company-b' })).total, 1);
});

test('assignee scope retains direct tasks and assigned-or-owned leads within company', async () => {
  const leads = [makeLead('assigned'), makeLead('owned', { assigned_to: 'other', lead_owner_id: 'employee-a' }),
    makeLead('foreign', { company_id: 'company-b' }), makeLead('unrelated', { assigned_to: 'other' })];
  const tasks = [makeTask('direct', { assignee_id: 'employee-a' }),
    ...['assigned', 'owned', 'foreign', 'unrelated'].map((lead_id) => makeTask(lead_id, { lead_id }))];
  const result = await harness({ leads, tasks }).summary(MANAGER, { assignee_id: 'employee-a' });
  assert.equal(result.total, 3); assert.equal(result.source_total_rows, 3);
  assert.equal(result.coverage, 'UNKNOWN');
});

test('open-only filtering still excludes done, completed and cancelled for all supported true forms', async () => {
  const tasks = ['pending', 'in_progress', 'done', 'completed', 'cancelled'].map((status, i) =>
    makeTask(i, { status, deadline: '2000-01-01T00:00:00Z' }));
  for (const open_only of [true, 'true', '1']) {
    const result = await harness({ tasks }).summary(ADMIN, { open_only });
    assert.equal(result.total, 2); assert.equal(result.open, 2); assert.equal(result.overdue, 2);
    assert.equal(result.done, 0); assert.equal(result.cancelled, 0); assert.equal(result.closed, 0);
    reconcile(result);
  }
});

test('status, task kind, search text and deadline filters retain their combined scope', async () => {
  const matching = makeTask('match', { status: 'review', task_kind: 'VC', title: 'Delivery Alpha', deadline: '2030-06-15' });
  const tasks = [matching,
    { ...matching, unified_id: 'wrong-status', status: 'pending' },
    { ...matching, unified_id: 'wrong-kind', task_kind: 'Dự án' },
    { ...matching, unified_id: 'wrong-search', title: 'Delivery Beta' },
    { ...matching, unified_id: 'too-early', deadline: '2030-05-31' },
    { ...matching, unified_id: 'too-late', deadline: '2030-07-01' }];
  const result = await harness({ tasks }).summary(ADMIN, {
    status: 'review', task_kind: 'VC', q: ' alpha ', date_from: '2030-06-01', date_to: '2030-06-30',
  });
  assert.equal(result.total, 1); assert.equal(result.by_module.logistics, 1);
  assert.equal(result.by_status.in_progress, 1); assert.equal(result.coverage, 'EXACT');
});

test('badge open and overdue counters retain company, employee and closed-status boundaries', async () => {
  const past = '2000-01-01T00:00:00Z';
  const tasks = [
    makeTask('late', { assignee_id: 'employee-a', deadline: past }),
    makeTask('future', { created_by_id: 'employee-a', deadline: '2999-01-01T00:00:00Z' }),
    makeTask('no-deadline', { assignee_id: 'employee-a' }),
    ...['done', 'completed', 'cancelled'].map((status) => makeTask(status, { assignee_id: 'employee-a', status, deadline: past })),
    makeTask('other-company', { company_id: 'company-b', assignee_id: 'employee-a', deadline: past }),
    makeTask('unrelated', { assignee_id: 'employee-b', deadline: past }),
  ];
  const { api } = harness({ tasks });
  assert.equal(await api.countUnifiedOpenTasks(EMPLOYEE), 3);
  assert.equal(await api.countUnifiedOverdueTasks(EMPLOYEE), 1);
});
