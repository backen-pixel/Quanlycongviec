/**
 * Test tạo cặp crm_tasks ↔ crm_assignments từ Không gian chung.
 * Fake supabase + stub modules — KHÔNG chạm DB thật.
 * Chạy: node tests/shared-workspace-assignment-create.js
 */
process.env.REDIS_DISABLED = '1';

const assert = require('assert');

function createFakeSupabase(getHandlers, log = []) {
  function makeBuilder(table) {
    const state = {
      table, op: 'select', filters: [], payload: null, order: null, limit: null, inFilters: [],
    };
    const resolve = () => {
      const handlers = getHandlers() || {};
      const h = handlers[table] || {};
      log.push({
        table, op: state.op, filters: state.filters.slice(),
        inFilters: state.inFilters.slice(), payload: state.payload,
      });
      if (typeof h.respond === 'function') return h.respond(state);
      if (state.op === 'insert') {
        if (h.insertError) return { data: null, error: h.insertError };
        const row = Array.isArray(state.payload) ? state.payload[0] : state.payload;
        const id = h.insertId || `${table}-${Date.now()}`;
        return { data: { id, ...row }, error: null };
      }
      if (state.op === 'delete') return { data: null, error: h.deleteError || null };
      if (state.op === 'update') {
        if (h.updateError) return { data: null, error: h.updateError };
        const rows = (h.rows || []).filter(
          (r) => state.filters.every(([c, v]) => String(r[c]) === String(v)),
        );
        const base = rows[0] || { id: state.filters.find(([c]) => c === 'id')?.[1] };
        return { data: { ...base, ...(state.payload || {}) }, error: null };
      }
      let rows = [...(h.rows || [])];
      rows = rows.filter((r) => state.filters.every(([c, v]) => String(r[c]) === String(v)));
      for (const [c, vals] of state.inFilters) {
        const set = new Set(vals.map(String));
        rows = rows.filter((r) => set.has(String(r[c])));
      }
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
        if (prop === 'select') return () => proxy;
        if (prop === 'eq') return (c, v) => { state.filters.push([c, v]); return proxy; };
        if (prop === 'in') return (c, vals) => { state.inFilters.push([c, vals]); return proxy; };
        if (prop === 'neq') return () => proxy;
        if (prop === 'not') return () => proxy;
        if (prop === 'is') return () => proxy;
        if (prop === 'order') return () => proxy;
        if (prop === 'limit') return () => proxy;
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
require.cache[CONFIG_PATH] = {
  id: CONFIG_PATH, filename: CONFIG_PATH, loaded: true,
  exports: { supabase: injectedSupabase },
};

const SIDE = { syncCalls: [], notify: 0, assignee: 0 };
function resetSide() {
  SIDE.syncCalls = [];
  SIDE.notify = 0;
  SIDE.assignee = 0;
}

function inject(rel, exports) {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

inject('../src/helpers/crmTaskAssignmentSync.js', {
  syncAssignmentFromCrmTask: async (req, task, ids, opts = {}) => {
    SIDE.syncCalls.push({ taskId: task?.id, ids, opts });
    return { assignmentId: 'assign-linked-1' };
  },
  syncCrmTaskFromAssignment: async () => {},
  resolveAssignmentModuleForCrmTask: (task, explicit) => {
    const e = String(explicit || '').toLowerCase();
    if (e === 'production' || e === 'crm' || e === 'logistics') return e;
    const slug = String(task?.stage_slug || '');
    if (slug.startsWith('sx_')) return 'production';
    if (slug.startsWith('vc_')) return 'logistics';
    return 'crm';
  },
  attachAssignmentIdsToCrmTasks: async (list) => list,
  attachCrmTaskMetaToAssignments: async (list) => list,
  applyAssignmentStatusColumn: async (u) => u,
  columnIdForTaskStatus: () => 'col-1',
});
inject('../src/helpers/crmAssignmentNotifications.js', {
  notifyNewCrmAssignmentAssignees: async () => { SIDE.notify += 1; },
  resolveAssignmentIdForTask: async () => 'assign-linked-1',
  persistAssignmentNotification: async () => null,
  buildAssignmentNotificationInsert: (uid, p) => ({ user_id: uid, ...p }),
});
inject('../src/helpers/notifications.js', {
  createNotification: async () => { SIDE.notify += 1; },
});
inject('../src/helpers/crmTaskAssignees.js', {
  attachAssigneesToCrmTasks: async (arr) => arr.map((t) => ({
    ...t,
    assignees: (t.assignee_id ? [{ id: t.assignee_id }] : []),
  })),
  replaceCrmTaskAssignees: async (_tid, ids) => {
    SIDE.assignee += 1;
    return ids;
  },
});
inject('../src/helpers/crmSequentialAssignment.js', {
  ensureActiveAssignmentForLead: async () => ({ assignmentId: 'seq-should-not-run' }),
  promoteNextAssignmentAfterComplete: async () => ({}),
});
inject('../src/helpers/tenantQuotas.js', {
  assertTenantQuota: async () => ({ ok: true }),
  resolveTenantIdForQuota: async () => 't1',
  invalidateTenantUsageCache: () => {},
});
inject('../src/helpers/adminRole.js', {
  isAdminLike: () => true,
  isSystemAdmin: () => true,
});
inject('../src/helpers/crmTaskOutbox.js', {
  createCrmTaskOutbox: () => ({
    enqueue() { return this; },
    async drain() { return { done: [], failed: [], skipped: [] }; },
  }),
});

const {
  resolveTaskSourceFields,
  stageSlugForAssignModule,
  normalizeAssignModule,
} = require('../src/helpers/sharedWorkspaceTaskSource');
const {
  resolveAssignmentModuleForCrmTask,
} = require('../src/helpers/crmTaskAssignmentSync');
const {
  createSharedWorkspaceLinkedAssignment,
} = require('../src/helpers/sharedWorkspaceAssignmentCreate');

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
  id: 'lead-1',
  company_id: 'c1',
  code: 'D-1',
  title: 'Deal test',
  type: 'deal',
  stage_id: 'stg-1',
  use_order_tasks: false,
  parent_lead_id: null,
};
const req = { user: { userId: 'u-creator', role: 'admin', company_id: 'c1' }, app: { get: () => null } };

function baseHandlers(extra = {}) {
  return {
    crm_leads: { rows: [leadRow] },
    lead_members: {
      rows: [
        { user_id: 'u-a1', lead_id: 'lead-1' },
        { user_id: 'u-a2', lead_id: 'lead-1' },
        { user_id: 'u-a3', lead_id: 'lead-1' },
      ],
    },
    crm_tasks: {
      insertId: 'task-sw-1',
      rows: [{
        id: 'task-sw-1', lead_id: 'lead-1', title: 'CV chung',
        status: 'pending', stage_slug: 'shared_workspace',
      }],
    },
    crm_assignments: {
      insertId: 'assign-linked-1',
      rows: [{
        id: 'assign-linked-1',
        lead_id: 'lead-1',
        crm_task_id: 'task-sw-1',
        title: 'CV chung',
        assignment_module: 'crm',
        task_source_type: 'customer_request',
        employee_error_module: null,
        assignee_id: 'u-a1',
      }],
    },
    crm_assignment_assignees: { rows: [] },
    crm_task_assignees: { rows: [] },
    ...extra,
  };
}

async function run() {
  console.log('\n== sharedWorkspaceTaskSource helpers ==');

  await test('validate: customer_request ok, clear error module', async () => {
    const r = resolveTaskSourceFields({ task_source_type: 'customer_request' }, { required: true });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.task_source_type, 'customer_request');
    assert.strictEqual(r.employee_error_module, null);
  });

  await test('validate: employee_error bắt buộc chọn khối', async () => {
    const r = resolveTaskSourceFields({ task_source_type: 'employee_error' }, { required: true });
    assert.strictEqual(r.ok, false);
    assert.ok(/khối phát sinh/i.test(r.error));
  });

  await test('validate: employee_error + logistics ok', async () => {
    const r = resolveTaskSourceFields({
      task_source_type: 'employee_error',
      employee_error_module: 'logistics',
    }, { required: true });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.employee_error_module, 'logistics');
  });

  await test('stageSlug map theo khối người nhận', async () => {
    assert.strictEqual(stageSlugForAssignModule('production'), 'sx_shared');
    assert.strictEqual(stageSlugForAssignModule('logistics'), 'vc_shared');
    assert.strictEqual(stageSlugForAssignModule('crm'), 'shared_workspace');
  });

  await test('resolveAssignmentModule: vc_* → logistics, sx_* → production', async () => {
    assert.strictEqual(resolveAssignmentModuleForCrmTask({ stage_slug: 'vc_shared' }), 'logistics');
    assert.strictEqual(resolveAssignmentModuleForCrmTask({ stage_slug: 'sx_cut' }), 'production');
    assert.strictEqual(resolveAssignmentModuleForCrmTask({ stage_slug: 'consulting' }), 'crm');
    assert.strictEqual(
      resolveAssignmentModuleForCrmTask({ stage_slug: 'sx_x' }, 'logistics'),
      'logistics',
    );
  });

  console.log('\n== createSharedWorkspaceLinkedAssignment ==');

  await test('tạo cặp task–assignment, nhiều assignee, customer_request', async () => {
    globalHandlers = baseHandlers();
    const r = await createSharedWorkspaceLinkedAssignment(req, 'lead-1', {
      title: 'CV chung',
      assignee_ids: ['u-a1', 'u-a2'],
      assignment_module: 'crm',
      task_source_type: 'customer_request',
      column_id: 'col-1',
    });
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.assignment?.id);
    assert.deepStrictEqual(r.data.assignee_ids, ['u-a1', 'u-a2']);
    assert.strictEqual(SIDE.syncCalls.length, 1);
    assert.strictEqual(SIDE.syncCalls[0].opts.assignmentModule, 'crm');
    assert.strictEqual(SIDE.syncCalls[0].opts.taskSourceType, 'customer_request');
    assert.strictEqual(SIDE.syncCalls[0].opts.forceDirect, true);
    assert.deepStrictEqual(SIDE.syncCalls[0].ids, ['u-a1', 'u-a2']);
    // Không chạy sequential (stub ensureActive không được gọi qua createCrmLeadTask direct)
    assert.ok(r.data.task?.id);
  });

  await test('map logistics + lỗi NV từ CRM (nguồn ≠ người nhận)', async () => {
    globalHandlers = baseHandlers();
    const r = await createSharedWorkspaceLinkedAssignment(req, 'lead-1', {
      title: 'Sửa lỗi VC',
      assignee_ids: ['u-a1'],
      assignment_module: 'logistics',
      task_source_type: 'employee_error',
      employee_error_module: 'crm',
    });
    assert.ok(!r.error, r.error);
    assert.strictEqual(SIDE.syncCalls[0].opts.assignmentModule, 'logistics');
    assert.strictEqual(SIDE.syncCalls[0].opts.employeeErrorModule, 'crm');
    assert.strictEqual(normalizeAssignModule('logistics'), 'logistics');
  });

  await test('map production + lỗi từ xưởng', async () => {
    globalHandlers = baseHandlers();
    const r = await createSharedWorkspaceLinkedAssignment(req, 'lead-1', {
      title: 'Lỗi cắt',
      assignee_ids: ['u-a2', 'u-a3'],
      assignment_module: 'production',
      task_source_type: 'employee_error',
      employee_error_module: 'production',
    });
    assert.ok(!r.error, r.error);
    assert.strictEqual(SIDE.syncCalls[0].opts.assignmentModule, 'production');
    assert.deepStrictEqual(SIDE.syncCalls[0].ids, ['u-a2', 'u-a3']);
  });

  await test('reject khi thiếu loại nhiệm vụ', async () => {
    globalHandlers = baseHandlers();
    const r = await createSharedWorkspaceLinkedAssignment(req, 'lead-1', {
      title: 'No type',
      assignee_ids: ['u-a1'],
      assignment_module: 'crm',
    });
    assert.ok(r.error);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(SIDE.syncCalls.length, 0);
  });

  await test('tự thêm NV chưa thuộc lead_members khi giao việc', async () => {
    globalHandlers = baseHandlers();
    const r = await createSharedWorkspaceLinkedAssignment(req, 'lead-1', {
      title: 'Giao người ngoài deal',
      assignee_ids: ['u-outsider'],
      assignment_module: 'crm',
      task_source_type: 'customer_request',
    });
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.assignment?.id);
    const added = globalLog.some((x) => x.table === 'lead_members' && x.op === 'insert');
    assert.ok(added, 'phải upsert lead_members cho NV chưa tham gia deal');
    assert.strictEqual(SIDE.syncCalls.length, 1);
    assert.deepStrictEqual(SIDE.syncCalls[0].ids, ['u-outsider']);
  });

  await test('reject employee_error thiếu khối phát sinh', async () => {
    globalHandlers = baseHandlers();
    const r = await createSharedWorkspaceLinkedAssignment(req, 'lead-1', {
      title: 'Lỗi thiếu khối',
      assignee_ids: ['u-a1'],
      assignment_module: 'crm',
      task_source_type: 'employee_error',
    });
    assert.ok(r.error);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(SIDE.syncCalls.length, 0);
  });

  await test('assignee_roles: primary được đưa sang sync', async () => {
    globalHandlers = baseHandlers();
    resetSide();
    const r = await createSharedWorkspaceLinkedAssignment(req, 'lead-1', {
      title: 'Lỗi NV',
      assignee_ids: ['u-a1', 'u-a2'],
      assignment_module: 'crm',
      task_source_type: 'employee_error',
      employee_error_module: 'crm',
      assignee_roles: { 'u-a1': 'primary', 'u-a2': 'executor' },
    });
    assert.ok(!r.error, r.error);
    const opts = SIDE.syncCalls[0]?.opts || {};
    assert.strictEqual(opts.assigneeRoles['u-a1'], 'primary');
    assert.strictEqual(opts.assigneeRoles['u-a2'], 'executor');
  });

  console.log(`\nKết quả: ${passed} pass, ${failed} fail`);
  if (failed) failures.forEach((f) => console.error(`FAIL: ${f.name} — ${f.error}`));
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error('Test runner lỗi:', e);
  process.exit(1);
});
