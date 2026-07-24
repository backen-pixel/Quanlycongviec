/**
 * Test quyền truy cập lead/deal (assertCrmLeadAccess / assertCrmTaskLeadAccess)
 * + rollback chuỗi mutation createCrmLeadTask (task → assignees, không transaction).
 *
 * Chạy: npm run test:crm-access
 * Không chạm DB thật — inject fake supabase vào require cache trước khi load helpers.
 */
process.env.REDIS_DISABLED = '1';

const assert = require('assert');

// ---------------------------------------------------------------------------
// Fake Supabase client — chainable, thenable, programmable theo bảng
// ---------------------------------------------------------------------------
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
        if (prop === 'insert' || prop === 'upsert') {
          return (rows) => { state.op = 'insert'; state.payload = rows; return proxy; };
        }
        if (prop === 'update') return (rows) => { state.op = 'update'; state.payload = rows; return proxy; };
        if (prop === 'delete') return () => { state.op = 'delete'; return proxy; };
        if (prop === 'eq') return (c, v) => { state.filters.push([c, v]); return proxy; };
        // select / in / or / not / order / limit / gte / lte / ilike ... — no-op chain
        return () => proxy;
      },
    });
    return proxy;
  }
  return {
    from: (table) => makeBuilder(table),
    rpc: async () => ({ data: null, error: null }),
  };
}

// Inject fake vào require cache TRƯỚC khi load bất kỳ module src nào —
// mọi `require('../config/supabase')` trong helpers sẽ nhận fake này.
const CONFIG_PATH = require.resolve('../src/config/supabase.js');
const globalLog = [];
let globalHandlers = {};
const injectedSupabase = createFakeSupabase(() => globalHandlers, globalLog);
require.cache[CONFIG_PATH] = {
  id: CONFIG_PATH,
  filename: CONFIG_PATH,
  loaded: true,
  exports: { supabase: injectedSupabase },
};

const {
  assertCrmLeadAccess,
  assertCrmTaskLeadAccess,
  assertCrmTaskBelongsToLead,
  resolveCrmTaskHttpOperation,
} = require('../src/helpers/crmTaskLeadAccess');
const { createCrmLeadTask } = require('../src/helpers/crmLeadTaskMutations');
const {
  userSeesCompanyWideCrmTasks,
  applyCrmTasksListAccessScope,
} = require('../src/helpers/crmTaskOverviewScope');
const { filterCrmTasksByCompanyScope } = require('../src/helpers/crossCompanyWorkspace');

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
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

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';

const mkReq = (user, tenantCompanyIds = null) => ({
  user,
  ...(tenantCompanyIds
    ? { tenantContext: { enforced: true, tenantId: 't1' }, tenantCompanyIds }
    : {}),
});

const admin = { userId: 'u-admin', role: 'admin', company_id: null };
const staff = (userId, over = {}) => ({ userId, role: 'staff', company_id: 'c1', ...over });

async function run() {
  console.log('\n== Phần A: Ma trận quyền assertCrmLeadAccess / assertCrmTaskLeadAccess ==');

  await test('lead null → 404 fail-closed', async () => {
    const db = createFakeSupabase(() => ({}));
    const r = await assertCrmLeadAccess(db, mkReq(staff('u1')), null);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 404);
  });

  await test('tenant mismatch → 403 hệ sinh thái (kể cả admin)', async () => {
    const db = createFakeSupabase(() => ({}));
    const lead = { id: 'l1', type: 'deal', company_id: 'c1' };
    const r = await assertCrmLeadAccess(db, mkReq(admin, ['c-khac']), lead);
    assert.strictEqual(r.ok, false);
    assert.ok(/hệ sinh thái/.test(r.error), r.error);
  });

  await test('admin hệ thống → ok với lead bất kỳ trong tenant', async () => {
    const db = createFakeSupabase(() => ({}));
    const lead = { id: 'l1', type: 'lead', company_id: 'c1', assigned_to: 'ai-do' };
    const r = await assertCrmLeadAccess(db, mkReq(admin), lead);
    assert.strictEqual(r.ok, true);
  });

  await test('staff không liên quan → 403', async () => {
    const db = createFakeSupabase(() => ({}));
    const lead = { id: 'l1', type: 'lead', company_id: 'c1', assigned_to: 'nguoi-khac' };
    const r = await assertCrmLeadAccess(db, mkReq(staff('u1')), lead);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 403);
  });

  await test('staff là assigned_to trên lead → ok', async () => {
    const db = createFakeSupabase(() => ({}));
    const lead = { id: 'l1', type: 'lead', company_id: 'c1', assigned_to: 'u1' };
    const r = await assertCrmLeadAccess(db, mkReq(staff('u1')), lead);
    assert.strictEqual(r.ok, true);
  });

  await test('deal con — owner qua ancestor (parent deal assigned_to) → ok', async () => {
    const db = createFakeSupabase(() => ({
      crm_leads: { rows: [{ id: 'p1', type: 'deal', assigned_to: 'u1', lead_owner_id: null, parent_lead_id: null }] },
    }));
    const lead = { id: 'child-1', type: 'deal', company_id: 'c1', assigned_to: 'khac', parent_lead_id: 'p1' };
    const r = await assertCrmLeadAccess(db, mkReq(staff('u1')), lead);
    assert.strictEqual(r.ok, true);
  });

  await test('thành viên lead_members → ok (participant)', async () => {
    const db = createFakeSupabase(() => ({
      lead_members: { rows: [{ id: 'm1', lead_id: 'l1', user_id: 'u2' }] },
    }));
    const lead = { id: 'l1', type: 'deal', company_id: 'c1', assigned_to: 'khac', parent_lead_id: null };
    const r = await assertCrmLeadAccess(db, mkReq(staff('u2')), lead);
    assert.strictEqual(r.ok, true);
  });

  await test('assignee task: task-route ok, route thường (không task grant) → 403', async () => {
    const handlers = {
      crm_tasks: { rows: [{ id: 't9', lead_id: 'l1', assignee_id: 'u3' }] },
    };
    const db = createFakeSupabase(() => handlers);
    const lead = { id: 'l1', type: 'deal', company_id: 'c1', assigned_to: 'khac', parent_lead_id: null };
    const taskRoute = await assertCrmTaskLeadAccess(db, mkReq(staff('u3')), lead);
    assert.strictEqual(taskRoute.ok, true, 'task route phải cho phép assignee');
    const normalRoute = await assertCrmLeadAccess(db, mkReq(staff('u3')), lead);
    assert.strictEqual(normalRoute.ok, false, 'route thường không nhận task grant');
  });

  await test('lệch region nhưng là assignee task → ok (grant tường minh thắng region)', async () => {
    const db = createFakeSupabase(() => ({
      crm_tasks: { rows: [{ id: 't9', lead_id: 'l1', assignee_id: 'u4' }] },
    }));
    const lead = { id: 'l1', type: 'deal', company_id: 'c1', assigned_to: 'khac', parent_lead_id: null, region_id: R2 };
    const r = await assertCrmTaskLeadAccess(db, mkReq(staff('u4', { crm_region_ids: [R1] })), lead);
    assert.strictEqual(r.ok, true);
  });

  await test('lệch region + không grant nào → 403 khu vực', async () => {
    const db = createFakeSupabase(() => ({}));
    const lead = { id: 'l1', type: 'deal', company_id: 'c1', assigned_to: 'khac', parent_lead_id: null, region_id: R2 };
    const r = await assertCrmTaskLeadAccess(db, mkReq(staff('u5', { crm_region_ids: [R1] })), lead);
    assert.strictEqual(r.ok, false);
    assert.ok(/khu vực/.test(r.error), r.error);
  });

  await test('executor company (không taskId, list route) → ok grant executor_company_scope', async () => {
    const db = createFakeSupabase(() => ({
      crm_tasks: { rows: [{ id: 't10', lead_id: 'l1', executor_company_id: 'c2' }] },
    }));
    const lead = { id: 'l1', type: 'deal', company_id: 'c1', assigned_to: 'khac', parent_lead_id: null, project_id: null };
    const r = await assertCrmTaskLeadAccess(db, mkReq(staff('u6', { company_id: 'c2' })), lead);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.grant, 'executor_company_scope', 'list route chỉ cấp scope, không lead-wide');
  });

  await test('P1: SX-01 executor Task A truy cập ĐÚNG Task A → ok grant executor_company_task', async () => {
    const db = createFakeSupabase(() => ({
      crm_tasks: {
        rows: [
          { id: 'tA', lead_id: 'l1', executor_company_id: 'sx01' },
          { id: 'tB', lead_id: 'l1', executor_company_id: 'sx02' },
        ],
      },
    }));
    const lead = { id: 'l1', type: 'deal', company_id: 'tm01', assigned_to: 'khac', parent_lead_id: null, project_id: null };
    const r = await assertCrmTaskLeadAccess(db, mkReq(staff('u-sx01', { company_id: 'sx01' })), lead, { taskId: 'tA' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.grant, 'executor_company_task');
  });

  await test('P1: SX-01 executor Task A KHÔNG được xem Task B của SX-02 → 403', async () => {
    const db = createFakeSupabase(() => ({
      crm_tasks: {
        rows: [
          { id: 'tA', lead_id: 'l1', executor_company_id: 'sx01' },
          { id: 'tB', lead_id: 'l1', executor_company_id: 'sx02' },
        ],
      },
    }));
    const lead = { id: 'l1', type: 'deal', company_id: 'tm01', assigned_to: 'khac', parent_lead_id: null, project_id: null };
    const r = await assertCrmTaskLeadAccess(db, mkReq(staff('u-sx01', { company_id: 'sx01' })), lead, { taskId: 'tB' });
    assert.strictEqual(r.ok, false, 'không được cấp quyền cross-task theo executor');
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.reason, 'task_access_denied');
  });

  await test('P1: SX-01 KHÔNG được UPDATE Task B của SX-02 → 403', async () => {
    const db = createFakeSupabase(() => ({
      crm_tasks: {
        rows: [
          { id: 'tA', lead_id: 'l1', executor_company_id: 'sx01' },
          { id: 'tB', lead_id: 'l1', executor_company_id: 'sx02' },
        ],
      },
    }));
    const lead = { id: 'l1', type: 'deal', company_id: 'tm01', assigned_to: 'khac', parent_lead_id: null, project_id: null };
    const r = await assertCrmTaskLeadAccess(db, mkReq(staff('u-sx01', { company_id: 'sx01' })), lead, { taskId: 'tB', operation: 'UPDATE' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 403);
  });

  await test('chủ dự án (project owner company) → ok grant project_owner_company (lead-wide hợp lệ)', async () => {
    const db = createFakeSupabase(() => ({
      projects: { rows: [{ id: 'proj1', company_id: 'sx01' }] },
      crm_tasks: { rows: [{ id: 'tB', lead_id: 'l1', executor_company_id: 'sx02' }] },
    }));
    const lead = { id: 'l1', type: 'deal', company_id: 'tm01', assigned_to: 'khac', parent_lead_id: null, project_id: 'proj1' };
    const r = await assertCrmTaskLeadAccess(db, mkReq(staff('u-sx01', { company_id: 'sx01' })), lead, { taskId: 'tB' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.grant, 'project_owner_company');
  });

  await test('assignee task: READ/UPDATE ok, CREATE/DELETE bị chặn', async () => {
    const db = createFakeSupabase(() => ({
      crm_tasks: { rows: [{ id: 't9', lead_id: 'l1', assignee_id: 'u7' }] },
    }));
    const lead = { id: 'l1', type: 'deal', company_id: 'c1', assigned_to: 'khac', parent_lead_id: null };
    const req = mkReq(staff('u7'));
    assert.strictEqual((await assertCrmTaskLeadAccess(db, req, lead, { operation: 'READ' })).ok, true);
    assert.strictEqual((await assertCrmTaskLeadAccess(db, req, lead, { operation: 'UPDATE' })).ok, true);
    const createGate = await assertCrmTaskLeadAccess(db, req, lead, { operation: 'CREATE' });
    assert.strictEqual(createGate.ok, false);
    assert.ok(/tạo/i.test(createGate.error), createGate.error);
    const delGate = await assertCrmTaskLeadAccess(db, req, lead, { operation: 'DELETE' });
    assert.strictEqual(delGate.ok, false);
    assert.ok(/xóa/i.test(delGate.error), delGate.error);
  });

  await test('resolveCrmTaskHttpOperation: POST taskId → UPDATE, POST root → CREATE', () => {
    assert.strictEqual(resolveCrmTaskHttpOperation('GET', '/leads/x/tasks'), 'READ');
    assert.strictEqual(resolveCrmTaskHttpOperation('POST', '/leads/x/tasks'), 'CREATE');
    assert.strictEqual(resolveCrmTaskHttpOperation('POST', '/leads/x/tasks/from-template'), 'CREATE');
    assert.strictEqual(
      resolveCrmTaskHttpOperation('POST', '/leads/x/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/attachments'),
      'UPDATE',
    );
    assert.strictEqual(
      resolveCrmTaskHttpOperation('DELETE', '/leads/x/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      'DELETE',
    );
  });

  await test('assertCrmTaskBelongsToLead: task thuộc lead khác → 404', async () => {
    const db = createFakeSupabase(() => ({
      crm_tasks: { rows: [{ id: 't-other', lead_id: 'lead-B' }] },
    }));
    const r = await assertCrmTaskBelongsToLead(db, 'lead-A', 't-other');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 404);
    assert.ok(/không thuộc/i.test(r.error), r.error);
  });

  await test('assertCrmTaskBelongsToLead: task đúng lead → ok', async () => {
    const db = createFakeSupabase(() => ({
      crm_tasks: { rows: [{ id: 't-ok', lead_id: 'lead-A' }] },
    }));
    const r = await assertCrmTaskBelongsToLead(db, 'lead-A', 't-ok');
    assert.strictEqual(r.ok, true);
  });

  console.log('\n== Phần B: Rollback chuỗi mutation createCrmLeadTask ==');

  const leadRow = {
    id: 'lead-1',
    use_order_tasks: false,
    parent_lead_id: null,
    stage_id: 'stg-1',
    company_id: 'c1',
    code: 'L1',
    title: 'Lead 1',
    region_id: null,
  };
  const creatorReq = { user: { userId: 'u-creator', role: 'admin' }, app: { get: () => null } };

  await test('ghi assignees fail → xóa task vừa tạo (compensation), trả 500 assignee_write_failed', async () => {
    globalLog.length = 0;
    globalHandlers = {
      crm_leads: { rows: [leadRow] },
      crm_tasks: { insertId: 'task-1' },
      crm_task_assignees: { insertError: { message: 'TCP connection lost' } },
    };
    const result = await createCrmLeadTask(creatorReq, 'lead-1', {
      title: 'Nhiệm vụ test',
      assignee_ids: ['u-a1'],
    });
    assert.ok(result.error, 'phải trả error');
    assert.strictEqual(result.status, 500);
    assert.strictEqual(result.code, 'assignee_write_failed');
    const rollbackDelete = globalLog.find(
      (e) => e.table === 'crm_tasks' && e.op === 'delete'
        && e.filters.some(([c, v]) => c === 'id' && v === 'task-1'),
    );
    assert.ok(rollbackDelete, 'phải có lệnh DELETE crm_tasks id=task-1 (compensation)');
  });

  await test('ghi assignees ok → tạo task thành công 201', async () => {
    globalLog.length = 0;
    globalHandlers = {
      crm_leads: { rows: [leadRow] },
      crm_tasks: { insertId: 'task-2' },
      crm_task_assignees: {},
    };
    const result = await createCrmLeadTask(creatorReq, 'lead-1', {
      title: 'Nhiệm vụ ok',
      assignee_ids: ['u-a1'],
    });
    assert.ok(!result.error, `không được lỗi: ${result.error}`);
    assert.strictEqual(result.status, 201);
    assert.strictEqual(result.data.id, 'task-2');
    const rollbackDelete = globalLog.find((e) => e.table === 'crm_tasks' && e.op === 'delete');
    assert.ok(!rollbackDelete, 'không được xóa task khi thành công');
  });

  await test('không có assignee → tạo task, assignees rỗng', async () => {
    globalHandlers = {
      crm_leads: { rows: [leadRow] },
      crm_tasks: { insertId: 'task-3' },
    };
    const result = await createCrmLeadTask(creatorReq, 'lead-1', { title: 'Không giao ai' });
    assert.ok(!result.error, `không được lỗi: ${result.error}`);
    assert.strictEqual(result.status, 201);
    assert.deepStrictEqual(result.data.assignees, []);
  });

  await test('idempotency_key: retry trả cùng task, status 200, không insert lần 2', async () => {
    globalLog.length = 0;
    let insertCount = 0;
    globalHandlers = {
      crm_leads: { rows: [leadRow] },
      crm_tasks: {
        insertId: 'task-idem-1',
        respond(state) {
          if (state.op === 'insert') {
            insertCount += 1;
            const row = Array.isArray(state.payload) ? state.payload[0] : state.payload;
            return { data: { id: 'task-idem-1', ...row }, error: null };
          }
          // select existing for replay
          const idF = state.filters.find(([c]) => c === 'id');
          if (idF && String(idF[1]) === 'task-idem-1') {
            return {
              data: [{
                id: 'task-idem-1',
                lead_id: 'lead-1',
                title: 'Idem task',
                assignees: [],
              }],
              error: null,
              count: 1,
            };
          }
          return { data: [], error: null, count: 0 };
        },
      },
    };
    const body = { title: 'Idem task', idempotency_key: 'key-abc-001' };
    const first = await createCrmLeadTask(creatorReq, 'lead-1', body);
    assert.ok(!first.error, first.error);
    assert.strictEqual(first.status, 201);
    assert.strictEqual(first.data.id, 'task-idem-1');
    assert.strictEqual(insertCount, 1);

    const second = await createCrmLeadTask(creatorReq, 'lead-1', body);
    assert.ok(!second.error, second.error);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.idempotent, true);
    assert.strictEqual(second.data.id, 'task-idem-1');
    assert.strictEqual(insertCount, 1, 'retry không được insert thêm');
  });

  console.log('\n== Phần C: Overview scope ==');

  await test('userSeesCompanyWideCrmTasks: admin true, staff false', () => {
    assert.strictEqual(userSeesCompanyWideCrmTasks({ role: 'admin', company_id: null }), true);
    assert.strictEqual(userSeesCompanyWideCrmTasks({ role: 'staff', company_id: 'c1', userId: 'u1' }), false);
  });

  await test('list narrowing: executorScopedOnly chỉ giữ task của công ty user (kể cả non-SX)', () => {
    const tasks = [
      { id: 't1', stage_slug: 'sx_cutting', executor_company_id: 'sx01' },
      { id: 't2', stage_slug: 'sx_assembly', executor_company_id: 'sx02' },
      { id: 't3', stage_slug: 'commercial_quote', executor_company_id: null },
      { id: 't4', stage_slug: 'sales_followup', executor_company_id: 'sx01' },
    ];
    const out = filterCrmTasksByCompanyScope(tasks, {
      scope: 'own',
      userCompanyId: 'sx01',
      leadCompanyId: 'tm01',
      ownerCompanyId: 'tm01',
      executorScopedOnly: true,
    });
    const ids = out.map((t) => t.id).sort();
    assert.deepStrictEqual(ids, ['t1', 't4'], 'chỉ task executor = sx01; ẩn task SX-02 và task non-SX của owner');
  });

  await test('list narrowing: executorScopedOnly không có company → rỗng (fail-closed)', () => {
    const out = filterCrmTasksByCompanyScope(
      [{ id: 't1', executor_company_id: 'sx01' }],
      { scope: 'own', userCompanyId: null, executorScopedOnly: true },
    );
    assert.deepStrictEqual(out, []);
  });

  await test('applyCrmTasksListAccessScope staff → .or(assignee|created_by|owned leads)', async () => {
    const calls = [];
    const fakeQ = {
      or(expr) {
        calls.push(expr);
        return fakeQ;
      },
    };
    const db = createFakeSupabase(() => ({
      crm_leads: { rows: [{ id: 'lead-owned', assigned_to: 'u-staff', lead_owner_id: null, company_id: 'c1' }] },
      lead_members: { rows: [] },
      crm_task_assignees: { rows: [{ task_id: 't-multi', user_id: 'u-staff' }] },
    }));
    const req = mkReq(staff('u-staff'));
    const { q, empty } = await applyCrmTasksListAccessScope(fakeQ, db, req, { companyId: 'c1' });
    assert.strictEqual(empty, false);
    assert.strictEqual(q, fakeQ);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].includes('assignee_id.eq.u-staff'), calls[0]);
    assert.ok(calls[0].includes('created_by.eq.u-staff'), calls[0]);
    assert.ok(calls[0].includes('lead_id.in.(lead-owned)'), calls[0]);
    assert.ok(calls[0].includes('id.in.(t-multi)'), calls[0]);
  });

  console.log(`\nKết quả: ${passed} pass, ${failed} fail`);
  if (failed) {
    failures.forEach((f) => console.error(`FAIL: ${f.name} — ${f.error}`));
  }
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error('Test runner lỗi:', e);
  process.exit(1);
});
