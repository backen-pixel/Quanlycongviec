/**
 * Fault-injection cho chuỗi mutation createCrmLeadTask + Outbox (Part IV).
 *
 * Chứng minh transaction boundary + hành vi side-effect:
 *  - DB-core (task + assignees) fail → compensation, KHÔNG chạy side-effect, KHÔNG emit.
 *  - assignment_sync fail → core vẫn commit (201), outbox report 'failed', request không hỏng.
 *  - notify fail → core vẫn commit (201), outbox 'failed', không ảnh hưởng core.
 *  - cả sync + notify fail → 201, cả hai vào failed.
 *  - idempotent retry → không chạy side-effect lần 2 (không side-effect trùng).
 *
 * KHÔNG chạm DB thật. Inject fake supabase + stub side-effect modules vào require.cache
 * TRƯỚC khi load crmLeadTaskMutations.
 * Chạy: npm run test:crm-outbox
 */
process.env.REDIS_DISABLED = '1';
process.env.CRM_TASK_OUTBOX = '1'; // bật retry-record (Redis null → no-op an toàn)

const assert = require('assert');

// ── Fake supabase (giống rollback test) ───────────────────────────────────
function createFakeSupabase(getHandlers, log = []) {
  function makeBuilder(table) {
    const state = { table, op: 'select', filters: [], payload: null };
    const resolve = () => {
      const handlers = getHandlers() || {};
      const h = handlers[table] || {};
      log.push({ table, op: state.op, filters: state.filters.slice(), payload: state.payload });
      if (typeof h.respond === 'function') return h.respond(state);
      if (state.op === 'insert') {
        if (h.insertError) return { data: null, error: h.insertError };
        const row = Array.isArray(state.payload) ? state.payload[0] : state.payload;
        return { data: { id: h.insertId || `${table}-new`, ...(row || {}) }, error: null };
      }
      if (state.op === 'delete') return { data: null, error: h.deleteError || null };
      if (state.op === 'update') return { data: null, error: h.updateError || null };
      const rows = (h.rows || []).filter(
        (r) => state.filters.every(([c, v]) => String(r[c]) === String(v)),
      );
      return { data: rows, error: null, count: rows.length };
    };
    const single = async () => {
      const r = resolve();
      const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
      return { data: d, error: r.error };
    };
    const proxy = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (onF, onR) => Promise.resolve(resolve()).then(onF, onR);
        if (prop === 'maybeSingle' || prop === 'single') return single;
        if (prop === 'insert' || prop === 'upsert') return (rows) => { state.op = 'insert'; state.payload = rows; return proxy; };
        if (prop === 'update') return (rows) => { state.op = 'update'; state.payload = rows; return proxy; };
        if (prop === 'delete') return () => { state.op = 'delete'; return proxy; };
        if (prop === 'eq') return (c, v) => { state.filters.push([c, v]); return proxy; };
        return () => proxy;
      },
    });
    return proxy;
  }
  return { from: (t) => makeBuilder(t), rpc: async () => ({ data: [], error: null }) };
}

const globalLog = [];
let globalHandlers = {};
const injectedSupabase = createFakeSupabase(() => globalHandlers, globalLog);
const CONFIG_PATH = require.resolve('../src/config/supabase.js');
require.cache[CONFIG_PATH] = { id: CONFIG_PATH, filename: CONFIG_PATH, loaded: true, exports: { supabase: injectedSupabase } };

// ── Stub side-effect modules với counter + FAIL flags ─────────────────────
const SIDE = { sync: 0, notify: 0, assignee: 0, fail: {} };
function resetSide() { SIDE.sync = 0; SIDE.notify = 0; SIDE.assignee = 0; SIDE.fail = {}; }

function inject(rel, exports) {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

inject('../src/helpers/crmTaskAssignmentSync.js', {
  syncAssignmentFromCrmTask: async () => {
    SIDE.sync += 1;
    if (SIDE.fail.sync) throw new Error('assignment sync down');
    return { assignmentId: 'assign-1' };
  },
  attachAssignmentIdsToCrmTasks: async (list) => list,
});
inject('../src/helpers/crmAssignmentNotifications.js', {
  notifyNewCrmAssignmentAssignees: async () => {
    SIDE.notify += 1;
    if (SIDE.fail.notify) throw new Error('notify down');
  },
  resolveAssignmentIdForTask: async () => 'assign-1',
});
inject('../src/helpers/notifications.js', {
  createNotification: async () => {
    SIDE.notify += 1;
    if (SIDE.fail.notify) throw new Error('notify down');
  },
});
inject('../src/helpers/crmTaskAssignees.js', {
  attachAssigneesToCrmTasks: async (arr) => arr.map((t) => ({ ...t, assignees: [] })),
  replaceCrmTaskAssignees: async () => {
    SIDE.assignee += 1;
    if (SIDE.fail.assignee) throw new Error('assignee write down');
    return ['u-a1'];
  },
});

const { createCrmLeadTask, updateCrmLeadTask } = require('../src/helpers/crmLeadTaskMutations');

// ── Harness ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn) {
  resetSide();
  globalLog.length = 0;
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    failures.push({ name, error: e.message });
    console.error(`  ✗ ${name}\n      ${e.message}`);
  }
}

const leadRow = {
  id: 'lead-1', use_order_tasks: false, parent_lead_id: null, stage_id: 'stg-1',
  company_id: 'c1', code: 'L1', title: 'Lead 1', region_id: null,
};
const req = { user: { userId: 'u-creator', role: 'admin' }, app: { get: () => null } };
const baseHandlers = () => ({ crm_leads: { rows: [leadRow] }, crm_tasks: { insertId: 'task-1' } });

async function run() {
  console.log('\n== Part IV: Transaction boundary + Outbox fault-injection ==');

  await test('assignment_sync fail → core commit 201, outbox failed=[assignment_sync], không throw', async () => {
    globalHandlers = baseHandlers();
    SIDE.fail.sync = true;
    const r = await createCrmLeadTask(req, 'lead-1', { title: 'T', assignee_ids: ['u-a1'] });
    assert.ok(!r.error, `không được lỗi request chính: ${r.error}`);
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.id, 'task-1');
    const failedNames = r.sideEffects.failed.map((f) => f.name);
    assert.ok(failedNames.includes('assignment_sync'), JSON.stringify(r.sideEffects));
    // notify vẫn chạy (độc lập) và thành công
    assert.ok(r.sideEffects.done.map((d) => d.name).includes('notify_assignees'));
    assert.strictEqual(SIDE.notify, 1);
  });

  await test('notify fail → core commit 201, outbox failed=[notify_assignees]', async () => {
    globalHandlers = baseHandlers();
    SIDE.fail.notify = true;
    const r = await createCrmLeadTask(req, 'lead-1', { title: 'T', assignee_ids: ['u-a1'] });
    assert.strictEqual(r.status, 201);
    const failedNames = r.sideEffects.failed.map((f) => f.name);
    assert.ok(failedNames.includes('notify_assignees'), JSON.stringify(r.sideEffects));
    assert.ok(r.sideEffects.done.map((d) => d.name).includes('assignment_sync'));
  });

  await test('sync + notify đều fail → 201, cả hai vào failed, request chính vẫn thành công', async () => {
    globalHandlers = baseHandlers();
    SIDE.fail.sync = true;
    SIDE.fail.notify = true;
    const r = await createCrmLeadTask(req, 'lead-1', { title: 'T', assignee_ids: ['u-a1'] });
    assert.strictEqual(r.status, 201);
    const failedNames = r.sideEffects.failed.map((f) => f.name).sort();
    assert.deepStrictEqual(failedNames, ['assignment_sync', 'notify_assignees']);
  });

  await test('DB-core: assignee write fail → compensation xóa task, KHÔNG chạy side-effect', async () => {
    globalHandlers = baseHandlers();
    SIDE.fail.assignee = true;
    const r = await createCrmLeadTask(req, 'lead-1', { title: 'T', assignee_ids: ['u-a1'] });
    assert.ok(r.error, 'phải trả error');
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.code, 'assignee_write_failed');
    // Side-effect KHÔNG được chạy khi core chưa commit
    assert.strictEqual(SIDE.sync, 0, 'assignment sync không được chạy');
    assert.strictEqual(SIDE.notify, 0, 'notify không được chạy');
    // Compensation: xóa task vừa tạo
    const del = globalLog.find((e) => e.table === 'crm_tasks' && e.op === 'delete'
      && e.filters.some(([c, v]) => c === 'id' && v === 'task-1'));
    assert.ok(del, 'phải có DELETE crm_tasks id=task-1');
  });

  await test('DB-core: task insert fail → error 500, KHÔNG side-effect, KHÔNG emit', async () => {
    globalHandlers = {
      crm_leads: { rows: [leadRow] },
      crm_tasks: { insertError: { message: 'insert down' } },
    };
    const r = await createCrmLeadTask(req, 'lead-1', { title: 'T', assignee_ids: ['u-a1'] });
    assert.ok(r.error, 'phải trả error');
    assert.strictEqual(r.status, 500);
    assert.strictEqual(SIDE.sync, 0);
    assert.strictEqual(SIDE.notify, 0);
    assert.strictEqual(SIDE.assignee, 0);
    assert.strictEqual(r.sideEffects, undefined, 'không có outbox report khi core fail');
  });

  await test('idempotent retry → không chạy side-effect lần 2 (không side-effect trùng)', async () => {
    let insertCount = 0;
    globalHandlers = {
      crm_leads: { rows: [leadRow] },
      crm_tasks: {
        respond(state) {
          if (state.op === 'insert') {
            insertCount += 1;
            const row = Array.isArray(state.payload) ? state.payload[0] : state.payload;
            return { data: { id: 'task-idem', ...row }, error: null };
          }
          const idF = state.filters.find(([c]) => c === 'id');
          if (idF && String(idF[1]) === 'task-idem') {
            return { data: [{ id: 'task-idem', lead_id: 'lead-1', title: 'Idem', assignees: [] }], error: null, count: 1 };
          }
          return { data: [], error: null, count: 0 };
        },
      },
    };
    const body = { title: 'Idem', assignee_ids: ['u-a1'], idempotency_key: 'outbox-key-1' };
    const first = await createCrmLeadTask(req, 'lead-1', body);
    assert.strictEqual(first.status, 201);
    const syncAfterFirst = SIDE.sync;
    const notifyAfterFirst = SIDE.notify;
    assert.ok(syncAfterFirst >= 1);

    const second = await createCrmLeadTask(req, 'lead-1', body);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.idempotent, true);
    assert.strictEqual(insertCount, 1, 'retry không insert task lần 2');
    assert.strictEqual(SIDE.sync, syncAfterFirst, 'retry không chạy assignment sync lần 2');
    assert.strictEqual(SIDE.notify, notifyAfterFirst, 'retry không notify lần 2');
  });

  console.log('\n== Part IV: updateCrmLeadTask + Outbox fault-injection ==');

  await test('update: assignment_sync fail → core 200, outbox failed=[assignment_sync]', async () => {
    globalHandlers = { crm_leads: { rows: [leadRow] }, crm_tasks: { rows: [], insertId: 'task-1' } };
    SIDE.fail.sync = true;
    const r = await updateCrmLeadTask(req, 'lead-1', 'task-1', { title: 'Sửa', assignee_ids: ['u-a1'] });
    assert.ok(!r.error, `không được lỗi request chính: ${r.error}`);
    assert.strictEqual(r.status, 200);
    assert.ok(r.sideEffects, 'phải có outbox report');
    assert.ok(r.sideEffects.failed.map((f) => f.name).includes('assignment_sync'), JSON.stringify(r.sideEffects));
  });

  await test('update: notify fail → core 200, outbox failed=[notify_assignees]', async () => {
    globalHandlers = { crm_leads: { rows: [leadRow] }, crm_tasks: { rows: [], insertId: 'task-1' } };
    SIDE.fail.notify = true;
    const r = await updateCrmLeadTask(req, 'lead-1', 'task-1', { title: 'Sửa', assignee_ids: ['u-a1'] });
    assert.strictEqual(r.status, 200);
    assert.ok(r.sideEffects.done.map((d) => d.name).includes('assignment_sync'));
    assert.ok(r.sideEffects.failed.map((f) => f.name).includes('notify_assignees'), JSON.stringify(r.sideEffects));
  });

  console.log(`\nKết quả: ${passed} pass, ${failed} fail`);
  if (failed) failures.forEach((f) => console.error(`FAIL: ${f.name} — ${f.error}`));
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error('Test runner lỗi:', e); process.exit(1); });
