/**
 * Unit tests: CRM cross-company / region transfer helper.
 * Chạy: node tests/crm-lead-company-transfer.js
 */
const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
const stubs = {
  '../config/supabase': { supabase: createFakeSupabase() },
  './adminRole': {
    isAdminLike: (u) => ['admin', 'sales_admin', 'platform_admin'].includes(String(u?.role || '')),
    isSystemAdmin: (u) => u?.role === 'admin' && !u?.company_id,
    isPlatformAdmin: (u) => u?.role === 'platform_admin',
  },
  './tenantScope': {
    companyInTenantContext: (req, companyId) => {
      if (!req?.tenantContext?.enforced) return true;
      return (req.tenantCompanyIds || []).map(String).includes(String(companyId));
    },
    intersectCompanyIdsWithTenant: (req, ids) => {
      if (!req?.tenantContext?.enforced) return ids || [];
      const allowed = new Set((req.tenantCompanyIds || []).map(String));
      return (ids || []).filter((id) => allowed.has(String(id)));
    },
  },
  './crmModuleCompanies': {
    listCrmModuleCompanyIds: async () => ['co-a', 'co-b', 'co-c'],
  },
  './crmRegionScope': {
    assertRegionBelongsToCompany: async (_sb, companyId, regionId) => {
      const ok = String(regionId).startsWith(`reg-${companyId}`);
      return ok ? { ok: true } : { ok: false, error: 'Khu vực không thuộc công ty đã chọn' };
    },
    assertUserCanAssignCrmRegion: () => ({ ok: true }),
  },
  './ecosystemModuleScope': {
    getRestrictedDivisionIdsForModule: async () => null,
  },
  './crmTaxonomyCache': {
    getPipelineIdForCompanyRegion: async (companyId) => `pipe-${companyId}`,
    getStagesByPipelineId: async () => ([
      { id: 'stage-1', canonical_slug: 'moi', order_index: 0 },
      { id: 'stage-2', canonical_slug: 'bao_gia', order_index: 1 },
    ]),
    getCompanyRegionsList: async ({ allowedIds }) => (allowedIds || []).map((id) => ({
      id: `reg-${id}-1`,
      company_id: id,
      name: `KV ${id}`,
      is_active: true,
    })),
  },
  './ensureDefaultCrmPipeline': {
    ensureDefaultCrmPipelineForCompany: async (companyId) => `pipe-${companyId}`,
  },
};

let db = null;

function createFakeSupabase() {
  const api = {
    from(table) {
      return createQuery(table);
    },
  };
  return api;
}

function createQuery(table) {
  const state = {
    table,
    filters: [],
    payload: null,
    op: 'select',
    selectCols: '*',
    single: false,
    maybeSingle: false,
    head: false,
    inIds: null,
  };

  const builder = {
    select(cols, opts) {
      state.selectCols = cols;
      state.head = !!(opts && opts.head);
      if (state.op === 'update' || state.op === 'insert') return builder;
      state.op = 'select';
      return builder;
    },
    insert(payload) {
      state.op = 'insert';
      state.payload = payload;
      return builder;
    },
    update(payload) {
      state.op = 'update';
      state.payload = payload;
      return builder;
    },
    eq(col, val) { state.filters.push({ type: 'eq', col, val }); return builder; },
    in(col, vals) { state.inIds = { col, vals }; state.filters.push({ type: 'in', col, vals }); return builder; },
    or() { return builder; },
    ilike(col, val) { state.filters.push({ type: 'ilike', col, val }); return builder; },
    limit() { return builder; },
    order() { return builder; },
    single() { state.single = true; return builder; },
    maybeSingle() { state.maybeSingle = true; return builder; },
    then(resolve, reject) {
      return Promise.resolve(runQuery(state)).then(resolve, reject);
    },
  };
  // Make awaitable
  builder[Symbol.toStringTag] = 'Promise';
  return builder;
}

function rowsOf(table) {
  return db[table] || [];
}

function matchRow(row, filters) {
  return filters.every((f) => {
    if (f.type === 'eq') return String(row[f.col] ?? '') === String(f.val ?? '');
    if (f.type === 'in') return (f.vals || []).map(String).includes(String(row[f.col]));
    if (f.type === 'ilike') {
      const needle = String(f.val || '').replace(/%/g, '').toLowerCase();
      return String(row[f.col] || '').toLowerCase() === needle;
    }
    return true;
  });
}

function runQuery(state) {
  const table = state.table;
  if (state.op === 'select') {
    let rows = rowsOf(table).filter((r) => matchRow(r, state.filters));
    if (state.head) {
      return { data: null, count: rows.length, error: null };
    }
    if (state.single || state.maybeSingle) {
      const row = rows[0] || null;
      if (state.single && !row) return { data: null, error: { message: 'not found' } };
      return { data: row, error: null };
    }
    return { data: rows, error: null };
  }
  if (state.op === 'insert') {
    const row = { id: `new-${table}-${(db[table] || []).length + 1}`, ...state.payload };
    db[table] = db[table] || [];
    db[table].push(row);
    return { data: state.single || state.maybeSingle ? row : [row], error: null };
  }
  if (state.op === 'update') {
    let updated = [];
    db[table] = (db[table] || []).map((r) => {
      if (!matchRow(r, state.filters)) return r;
      const next = { ...r, ...state.payload };
      updated.push(next);
      return next;
    });
    if (state.single || state.maybeSingle) {
      return { data: updated[0] || null, error: updated[0] ? null : { message: 'not found' } };
    }
    return { data: updated, error: null };
  }
  return { data: null, error: null };
}

Module._load = function patched(request, parent, isMain) {
  if (stubs[request]) return stubs[request];
  return originalLoad(request, parent, isMain);
};

const {
  canCrossCompanyTransfer,
  countCommercialBlockers,
  copyOrReuseCustomerForCompany,
  executeLeadCompanyTransfer,
  getTransferOptions,
} = require('../src/helpers/crmLeadCompanyTransfer');

Module._load = originalLoad;

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

function resetDb() {
  db = {
    companies: [
      { id: 'co-a', name: 'Alpha', short_name: 'A', is_active: true },
      { id: 'co-b', name: 'Beta', short_name: 'B', is_active: true },
      { id: 'co-c', name: 'Gamma', short_name: 'C', is_active: true },
    ],
    company_regions: [
      { id: 'reg-co-a-1', company_id: 'co-a', name: 'KV A', is_active: true },
      { id: 'reg-co-b-1', company_id: 'co-b', name: 'KV B', is_active: true },
    ],
    users: [
      { id: 'u-a', full_name: 'User A', company_id: 'co-a', role: 'sales', is_active: true, department_id: null },
      { id: 'u-b', full_name: 'User B', company_id: 'co-b', role: 'sales', is_active: true, department_id: null },
      { id: 'admin', full_name: 'Admin', company_id: null, role: 'admin', is_active: true },
    ],
    user_company_regions: [
      { user_id: 'u-a', region_id: 'reg-co-a-1' },
      { user_id: 'u-b', region_id: 'reg-co-b-1' },
    ],
    customers: [
      {
        id: 'cus-1',
        full_name: 'Khách A',
        phone: '0901111222',
        company_id: 'co-a',
        email: 'a@x.com',
      },
    ],
    crm_leads: [
      {
        id: 'lead-1',
        title: 'Deal 1',
        type: 'deal',
        company_id: 'co-a',
        region_id: 'reg-co-a-1',
        pipeline_id: 'pipe-co-a',
        stage_id: 'stage-old',
        assigned_to: 'u-a',
        lead_owner_id: 'u-a',
        customer_id: 'cus-1',
        source_id: null,
        lead_type_id: null,
        project_id: 'proj-1',
      },
    ],
    crm_pipeline_stages: [
      { id: 'stage-old', canonical_slug: 'bao_gia', order_index: 1 },
    ],
    crm_sources: [],
    crm_lead_types: [],
    orders: [],
    invoices: [],
    quotations: [
      { id: 'q1', lead_id: 'lead-1', company_id: 'co-a', region_id: 'reg-co-a-1', customer_id: 'cus-1' },
    ],
    crm_assignments: [
      { id: 'as1', lead_id: 'lead-1', company_id: 'co-a' },
    ],
    departments: [],
  };
}

(async () => {
  console.log('\n== CRM lead company transfer ==');

  await test('admin-like được phép cross-company', () => {
    assert.strictEqual(canCrossCompanyTransfer({ role: 'admin' }), true);
    assert.strictEqual(canCrossCompanyTransfer({ role: 'sales_admin', company_id: 'co-a' }), true);
    assert.strictEqual(canCrossCompanyTransfer({ role: 'sales' }), false);
  });

  await test('chặn khi có đơn hàng/hóa đơn', async () => {
    resetDb();
    db.orders = [{ id: 'o1', lead_id: 'lead-1' }];
    const b = await countCommercialBlockers('lead-1');
    assert.strictEqual(b.blocked, true);
    assert.strictEqual(b.orders, 1);
  });

  await test('sao chép khách hàng sang công ty đích', async () => {
    resetDb();
    const r = await copyOrReuseCustomerForCompany(stubs['../config/supabase'].supabase, 'cus-1', 'co-b');
    assert.strictEqual(r.copied, true);
    assert.ok(r.customerId);
    const created = db.customers.find((c) => c.id === r.customerId);
    assert.strictEqual(created.company_id, 'co-b');
    assert.strictEqual(created.phone, '0901111222');
  });

  await test('reuse khách hàng trùng SĐT ở công ty đích', async () => {
    resetDb();
    db.customers.push({ id: 'cus-b', full_name: 'Khách B', phone: '0901111222', company_id: 'co-b' });
    const r = await copyOrReuseCustomerForCompany(stubs['../config/supabase'].supabase, 'cus-1', 'co-b');
    assert.strictEqual(r.copied, false);
    assert.strictEqual(r.reused, true);
    assert.strictEqual(r.customerId, 'cus-b');
  });

  await test('execute: chặn cross-company khi có hóa đơn', async () => {
    resetDb();
    db.invoices = [{ id: 'i1', lead_id: 'lead-1' }];
    const req = { user: { userId: 'admin', role: 'admin' }, tenantContext: { enforced: false } };
    const r = await executeLeadCompanyTransfer(req, {
      leadId: 'lead-1',
      companyId: 'co-b',
      regionId: 'reg-co-b-1',
      assignedTo: 'u-b',
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'HAS_COMMERCIAL_DOCS');
  });

  await test('execute: chuyển công ty + remap pipeline/stage + cập nhật báo giá', async () => {
    resetDb();
    const req = { user: { userId: 'admin', role: 'admin' }, tenantContext: { enforced: false } };
    const r = await executeLeadCompanyTransfer(req, {
      leadId: 'lead-1',
      companyId: 'co-b',
      regionId: 'reg-co-b-1',
      assignedTo: 'u-b',
    });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.companyChanged, true);
    assert.strictEqual(r.lead.company_id, 'co-b');
    assert.strictEqual(r.lead.region_id, 'reg-co-b-1');
    assert.strictEqual(r.lead.assigned_to, 'u-b');
    assert.strictEqual(r.lead.pipeline_id, 'pipe-co-b');
    assert.strictEqual(r.lead.stage_id, 'stage-2'); // bao_gia
    assert.strictEqual(r.lead.project_id, 'proj-1'); // giữ dự án SX
    assert.ok(r.customerResult?.copied || r.customerResult?.customerId);
    assert.strictEqual(db.quotations[0].company_id, 'co-b');
    assert.strictEqual(db.quotations[0].region_id, 'reg-co-b-1');
    assert.strictEqual(db.crm_assignments[0].company_id, 'co-b');
  });

  await test('execute: từ chối non-admin khi đổi công ty', async () => {
    resetDb();
    const req = { user: { userId: 'u-a', role: 'sales', company_id: 'co-a' }, tenantContext: { enforced: false } };
    const r = await executeLeadCompanyTransfer(req, {
      leadId: 'lead-1',
      companyId: 'co-b',
      regionId: 'reg-co-b-1',
      assignedTo: 'u-b',
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 403);
  });

  await test('execute: cùng công ty đổi khu vực', async () => {
    resetDb();
    db.company_regions.push({ id: 'reg-co-a-2', company_id: 'co-a', name: 'KV A2', is_active: true });
    db.user_company_regions.push({ user_id: 'u-a', region_id: 'reg-co-a-2' });
    // Patch assertRegionBelongsToCompany stub via region id pattern reg-co-a-*
    const req = { user: { userId: 'admin', role: 'admin' }, tenantContext: { enforced: false } };
    const r = await executeLeadCompanyTransfer(req, {
      leadId: 'lead-1',
      companyId: 'co-a',
      regionId: 'reg-co-a-2',
      assignedTo: 'u-a',
    });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.companyChanged, false);
    assert.strictEqual(r.lead.region_id, 'reg-co-a-2');
  });

  await test('getTransferOptions: lọc theo tenant', async () => {
    resetDb();
    const req = {
      user: { userId: 'admin', role: 'admin' },
      tenantContext: { enforced: true },
      tenantCompanyIds: ['co-a', 'co-b'],
    };
    const opts = await getTransferOptions(req, { companyId: 'co-a' });
    assert.ok(opts.companies.every((c) => ['co-a', 'co-b'].includes(c.id)));
    assert.ok(!opts.companies.some((c) => c.id === 'co-c'));
    assert.ok(opts.regions.length >= 1);
    assert.ok(opts.users.some((u) => u.id === 'u-a'));
  });

  console.log(`\nKết quả: ${passed} pass, ${failed} fail`);
  if (failed) {
    failures.forEach((f) => console.error(`FAIL: ${f.name} — ${f.error}`));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
