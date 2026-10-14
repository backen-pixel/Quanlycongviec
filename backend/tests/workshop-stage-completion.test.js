const test = require('node:test');
const assert = require('node:assert/strict');
// The existing slug module imports workshop helpers. Isolate its DB dependency:
// no credentials, health checker, server, or external requests in these tests.
const configPath = require.resolve('../src/config/supabase');
require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: { supabase: {} } };
const { isRequiredOpen, completionState, loadRequiredStageTasks, blockersForStage, completionConflict } = require('../src/helpers/workshopStageCompletion');

function dbFor(tables, failTable = null) {
  const writes = [];
  return { writes, from(table) {
    const filters = [];
    let payload = null;
    let single = false;
    const result = () => {
      if (table === failTable) return { error: new Error('source unavailable') };
      const data = (tables[table] || []).filter((row) => filters.every((f) => f(row)));
      if (payload) { writes.push({ table, payload }); return { data: payload }; }
      return { data: single ? data[0] || null : data };
    };
    const q = {
      select() { return q; },
      order() { return q; },
      eq(key, value) { filters.push((row) => row[key] === value); return q; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return q; },
      maybeSingle() { single = true; return q; },
      update(row) { payload = row; return q; },
      insert(row) { payload = row; return q; },
      upsert(row) { payload = row; return q; },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      async range(start, end) {
        if (table === failTable) return { error: new Error('source unavailable') };
        return { data: (tables[table] || []).filter((row) => filters.every((f) => f(row))).slice(start, end + 1) };
      },
    };
    return q;
  } };
}

const stage = { id: 'stage-one', bucket_slug: 'kiem_tra', name: 'Kiểm tra chéo' };

test('mandatory open work blocks; optional and terminal work do not', () => {
  for (const status of ['pending', 'todo', 'in_progress', null]) {
    assert.equal(isRequiredOpen({ blocks_stage_advance: true, status }), true);
  }
  for (const status of ['done', 'completed', 'cancelled', 'canceled']) {
    assert.equal(isRequiredOpen({ blocks_stage_advance: true, status }), false);
  }
  assert.equal(isRequiredOpen({ blocks_stage_advance: false, status: 'pending' }), false);
});

// Execute the actual route registrations in a sandbox, excluding unrelated
// production routes and their application startup side effects.
function routeHandlers(db, accessible = true) {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const code = fs.readFileSync(require.resolve('../src/routes/production'), 'utf8');
  const start = code.indexOf('const PSS_TRANG_THAI');
  const end = code.indexOf('// Danh sách công ty bên ngoài', start);
  const handlers = {};
  vm.runInNewContext(code.slice(start, end), {
    supabase: db,
    console: { error() {} },
    requirePermission: () => () => {},
    requireProductionKanbanEdit: () => () => {},
    r: {
      get(path, ...functions) { handlers.get = functions.at(-1); },
      put(path, ...functions) { handlers.put = functions.at(-1); },
    },
    require(name) {
      if (name.endsWith('/workshopStageCompletion')) return require('../src/helpers/workshopStageCompletion');
      if (name.endsWith('/projectAccessScope')) return {
        async assertProjectAccessible(req, res) {
          if (!accessible) res.status(403).json({ error: 'Access denied' });
          return accessible;
        },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return handlers;
}

async function invoke(handler, request) {
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ query: {}, body: {}, user: { userId: 'operator' }, ...request }, response);
  return response;
}

function routeTables(status = 'pending') {
  return {
    production_pipeline_stages: [{ ...stage, company_id: 'co' }],
    projects: [{ id: 'p1', company_id: 'co' }],
    project_substage_status: [{ id: 'saved', project_id: 'p1', stage_id: stage.id, trang_thai: 'xong', xong_luc: '2026-10-13' }],
    tasks: [{ id: 'required', title: 'Kiểm tra chất lượng', project_id: 'p1', production_stage_id: stage.id, blocks_stage_advance: true, status }],
  };
}

test('PUT rejects incomplete completion before writing; accepts completed required work', async () => {
  const tables = routeTables();
  const db = dbFor(tables);
  const { put } = routeHandlers(db);
  const body = { project_id: 'p1', stage_id: stage.id, trang_thai: 'xong' };
  const blocked = await invoke(put, { body });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.body.code, 'SX_STAGE_REQUIRED_TASKS_INCOMPLETE');
  assert.equal(db.writes.length, 0);
  tables.tasks[0].status = 'done';
  const allowed = await invoke(put, { body });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body.row.trang_thai, 'xong');
  assert.equal(db.writes.length, 1);
});

test('GET masks stale completion without rewriting historical confirmation', async () => {
  const db = dbFor(routeTables());
  const { get } = routeHandlers(db);
  const response = await invoke(get, { query: { stage_ids: stage.id, project_id: 'p1' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.rows[0].trang_thai, 'dang');
  assert.equal(response.body.rows[0].required_open_count, 1);
  assert.equal(response.body.rows[0].xong_luc, null);
  assert.equal(db.writes.length, 0);
});

test('PUT fails closed on task read failure and preserves project authorization', async () => {
  const body = { project_id: 'p1', stage_id: stage.id, trang_thai: 'xong' };
  const db = dbFor(routeTables(), 'tasks');
  assert.equal((await invoke(routeHandlers(db).put, { body })).statusCode, 500);
  assert.equal(db.writes.length, 0);
  assert.equal((await invoke(routeHandlers(db, false).put, { body })).statusCode, 403);
  assert.equal(db.writes.length, 0);
});

test('native and CRM tasks both block the same stage; other stages are isolated', async () => {
  const db = dbFor({
    crm_leads: [{ id: 'lead-one', project_id: 'p1' }, { id: 'lead-two', project_id: 'p2' }],
    tasks: [{ id: 'native', project_id: 'p1', title: 'KCS', production_stage_id: stage.id, blocks_stage_advance: true, status: 'todo' }],
    crm_tasks: [
      { id: 'crm', lead_id: 'lead-one', title: 'Đặt kính', production_pipeline_stage_id: stage.id, blocks_stage_advance: true, status: 'pending' },
      { id: 'other', lead_id: 'lead-one', production_pipeline_stage_id: 'other-stage', stage_slug: 'sx_kiem_tra', blocks_stage_advance: true, status: 'pending' },
      { id: 'outside', lead_id: 'lead-two', production_pipeline_stage_id: stage.id, blocks_stage_advance: true, status: 'pending' },
    ],
  });
  const rows = await loadRequiredStageTasks(db, ['p1', 'p2']);
  const blockers = blockersForStage(rows, stage, 'p1');
  assert.deepEqual(blockers.map((row) => row.id), ['native', 'crm']);
  assert.equal(completionState('xong', blockers), 'dang');
  assert.equal(completionConflict(blockers).remaining_tasks.length, 2);
  assert.equal(completionState('xong', []), 'xong');
  assert.equal(completionState('chua', blockers), 'chua');
});

test('legacy production slug is checked without conflating an explicit different column', () => {
  const rows = [
    { id: 'legacy', source: 'crm_task', stage_slug: 'sx_kiem_tra', blocks_stage_advance: true, status: 'pending' },
    { id: 'explicit-other', source: 'crm_task', stage_id: 'different', stage_slug: 'sx_kiem_tra', blocks_stage_advance: true, status: 'pending' },
    { id: 'sales', source: 'crm_task', stage_slug: 'deal_new', blocks_stage_advance: true, status: 'pending' },
  ];
  assert.deepEqual(blockersForStage(rows, stage).map((row) => row.id), ['legacy']);
});

test('a required task added or reopened invalidates a previously completed stage', () => {
  const task = { source: 'crm_task', stage_id: stage.id, blocks_stage_advance: true, status: 'completed' };
  assert.equal(completionState('xong', blockersForStage([task], stage)), 'xong');
  assert.equal(completionState('xong', blockersForStage([{ ...task, status: 'pending' }], stage)), 'dang');
});

test('all task pages are checked, including a blocker beyond the first page', async () => {
  const tasks = Array.from({ length: 501 }, (_, i) => ({ id: `t${i}`, project_id: 'p1', production_stage_id: stage.id, blocks_stage_advance: true, status: i === 500 ? 'todo' : 'done' }));
  const rows = await loadRequiredStageTasks(dbFor({ tasks }), 'p1');
  assert.equal(rows.length, 501);
  assert.deepEqual(blockersForStage(rows, stage).map((row) => row.id), ['t500']);
});

test('read errors fail closed for either task source or project links', async () => {
  for (const table of ['tasks', 'crm_tasks', 'crm_leads']) {
    await assert.rejects(loadRequiredStageTasks(dbFor({ crm_leads: [{ id: 'lead-one', project_id: 'p1' }] }, table), 'p1'), /source unavailable/);
  }
});
