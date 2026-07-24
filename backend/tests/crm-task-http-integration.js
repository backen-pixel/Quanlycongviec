/**
 * HTTP/Integration test (Phương án 3): Express THẬT + JWT THẬT + fake Supabase.
 *
 * Chứng minh tầng HTTP end-to-end cho chính sách Executor Company (P1):
 *  - 401 khi thiếu token
 *  - 403 khi executor SX-01 truy cập task của SX-02 (task_access_denied)
 *  - 403 khi executor xóa task (task_delete_forbidden)
 *  - 404 khi taskId không thuộc leadId (task_lead_mismatch)
 *  - 200 khi executor truy cập ĐÚNG task của mình
 *  - list narrowing: executor chỉ thấy task của công ty mình (ẩn SX-02 + task non-SX)
 *  - owner thấy toàn bộ task của lead
 *
 * KHÔNG chạm DB thật, KHÔNG chạm Production, KHÔNG gọi tài khoản ngoài.
 * Chạy: npm run test:crm-http
 */

// 1) ENV phải set TRƯỚC mọi require src (dotenv không override biến đã tồn tại).
process.env.JWT_SECRET = process.env.JWT_SECRET_TEST || 'crm-http-integration-test-secret';
process.env.REDIS_DISABLED = '1';
process.env.RESPONSE_CACHE_DISABLED = '1';
process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Fake Supabase — chainable, thenable, programmable theo bảng (giống rollback test)
// ---------------------------------------------------------------------------
function createFakeSupabase(getHandlers) {
  function makeBuilder(table) {
    const state = { table, op: 'select', filters: [], payload: null };
    const resolve = () => {
      const handlers = getHandlers() || {};
      const h = handlers[table] || {};
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
        return () => proxy;
      },
    });
    return proxy;
  }
  return {
    from: (table) => makeBuilder(table),
    rpc: async () => ({ data: [], error: null }),
  };
}

// 2) Inject fake vào require.cache TRƯỚC khi load router.
const CONFIG_PATH = require.resolve('../src/config/supabase.js');
let handlers = {};
const fakeSupabase = createFakeSupabase(() => handlers);
require.cache[CONFIG_PATH] = {
  id: CONFIG_PATH,
  filename: CONFIG_PATH,
  loaded: true,
  exports: { supabase: fakeSupabase },
};

const express = require('express');
const crmRouter = require('../src/routes/crm');

// ---------------------------------------------------------------------------
// Fixtures (UUID hợp lệ v4)
// ---------------------------------------------------------------------------
const LEAD = '10000000-0000-4000-8000-000000000001';
const LEAD2 = '10000000-0000-4000-8000-000000000002';
const T_A = '20000000-0000-4000-8000-00000000000a';
const T_B = '20000000-0000-4000-8000-00000000000b';
const T_C = '20000000-0000-4000-8000-00000000000c';
const T_D = '20000000-0000-4000-8000-00000000000d';
const T_X = '20000000-0000-4000-8000-00000000000e';
const SX01 = '30000000-0000-4000-8000-000000000001';
const SX02 = '30000000-0000-4000-8000-000000000002';
const TM01 = '30000000-0000-4000-8000-000000000010';
const OWNER_UID = '40000000-0000-4000-8000-000000000001';
const SX01_UID = '40000000-0000-4000-8000-000000000002';
const STRANGER_UID = '40000000-0000-4000-8000-000000000003';

const leadRow = {
  id: LEAD, type: 'deal', company_id: TM01, assigned_to: OWNER_UID,
  lead_owner_id: null, parent_lead_id: null, project_id: null, region_id: null,
  use_order_tasks: false, stage_id: null, pipeline_id: null, created_by: OWNER_UID,
};
const tasks = [
  { id: T_A, lead_id: LEAD, executor_company_id: SX01, stage_slug: 'sx_cut', order_index: 1, title: 'A', status: 'pending', checklist: [] },
  { id: T_B, lead_id: LEAD, executor_company_id: SX02, stage_slug: 'sx_asm', order_index: 2, title: 'B', status: 'pending', checklist: [] },
  { id: T_C, lead_id: LEAD, executor_company_id: null, stage_slug: 'commercial_quote', order_index: 3, title: 'C', status: 'pending', checklist: [] },
  { id: T_D, lead_id: LEAD, executor_company_id: SX01, stage_slug: 'sx_pack', order_index: 4, title: 'D', status: 'pending', checklist: [] },
  { id: T_X, lead_id: LEAD2, executor_company_id: SX01, stage_slug: 'sx_cut', order_index: 1, title: 'X', status: 'pending', checklist: [] },
];

function resetHandlers() {
  handlers = {
    crm_leads: { rows: [leadRow, { ...leadRow, id: LEAD2 }] },
    crm_tasks: { rows: tasks },
    crm_task_assignees: { rows: [] },
    crm_task_attachments: { rows: [] },
    projects: { rows: [] },
    orders: { rows: [] },
    users: { rows: [] },
    lead_members: { rows: [] },
    user_company_regions: { rows: [] },
  };
}

function tokenFor({ userId, role = 'staff', company_id = null }) {
  return jwt.sign(
    { userId, id: userId, role, company_id, crm_region_ids: [] },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

const ownerTok = tokenFor({ userId: OWNER_UID, company_id: TM01 });
const sx01Tok = tokenFor({ userId: SX01_UID, company_id: SX01 });
const strangerTok = tokenFor({ userId: STRANGER_UID, company_id: '30000000-0000-4000-8000-0000000000ff' });

// ---------------------------------------------------------------------------
// Server + HTTP client
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use('/api/crm', crmRouter);
let server;
let base;

function call(method, path, token, jsonBody) {
  // Dùng http.request + Connection: close (không keep-alive) để teardown sạch trên Windows.
  return new Promise((resolve, reject) => {
    const headers = { Connection: 'close' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload = null;
    if (jsonBody !== undefined) {
      payload = JSON.stringify(jsonBody);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(
      `${base}${path}`,
      { method, headers, agent: false },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let body = null;
          try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = null; }
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn) {
  resetHandlers();
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

async function run() {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  console.log('\n== HTTP/Integration — Executor Company policy (P1) ==');

  await test('401 khi thiếu token', async () => {
    const r = await call('GET', `/api/crm/leads/${LEAD}/tasks`, null);
    assert.strictEqual(r.status, 401);
  });

  await test('403 stranger (không owner/assignee/executor) → task_access_denied', async () => {
    const r = await call('GET', `/api/crm/leads/${LEAD}/tasks`, strangerTok);
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body?.reason, 'task_access_denied', JSON.stringify(r.body));
  });

  await test('P1: SX-01 truy cập Task B của SX-02 → 403 task_access_denied', async () => {
    const r = await call('GET', `/api/crm/leads/${LEAD}/tasks/${T_B}/attachments`, sx01Tok);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body?.reason, 'task_access_denied');
  });

  await test('P1: SX-01 truy cập ĐÚNG Task A của mình → 200', async () => {
    const r = await call('GET', `/api/crm/leads/${LEAD}/tasks/${T_A}/attachments`, sx01Tok);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('executor KHÔNG được xóa task → 403 task_delete_forbidden', async () => {
    const r = await call('DELETE', `/api/crm/leads/${LEAD}/tasks/${T_A}`, sx01Tok);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body?.reason, 'task_delete_forbidden');
  });

  await test('spoof: taskId thuộc lead khác → 404 task_lead_mismatch', async () => {
    const r = await call('GET', `/api/crm/leads/${LEAD}/tasks/${T_X}/attachments`, sx01Tok);
    assert.strictEqual(r.status, 404, JSON.stringify(r.body));
    assert.strictEqual(r.body?.reason, 'task_lead_mismatch');
  });

  await test('list narrowing: SX-01 chỉ thấy task của mình (ẩn SX-02 + non-SX)', async () => {
    const r = await call('GET', `/api/crm/leads/${LEAD}/tasks`, sx01Tok);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const ids = (r.body || []).map((t) => t.id).sort();
    assert.deepStrictEqual(ids, [T_A, T_D], `SX-01 phải chỉ thấy A+D, nhận: ${JSON.stringify(ids)}`);
  });

  await test('owner thấy toàn bộ task của lead', async () => {
    const r = await call('GET', `/api/crm/leads/${LEAD}/tasks`, ownerTok);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const ids = (r.body || []).map((t) => t.id).sort();
    assert.deepStrictEqual(ids, [T_A, T_B, T_C, T_D], `owner phải thấy tất cả, nhận: ${JSON.stringify(ids)}`);
  });

  console.log('\n== HTTP/Integration — Upload attachment authz (Part V) ==');

  await test('upload: SX-01 đính kèm vào Task B của SX-02 → 403 (kế thừa gate P1)', async () => {
    // POST /tasks/:taskId/attachments → operation UPDATE; executor task B ≠ SX-01 → deny.
    const r = await call('POST', `/api/crm/leads/${LEAD}/tasks/${T_B}/attachments`, sx01Tok,
      { file_url: 'https://x/f.pdf', file_name: 'f.pdf', doc_type: 'other' });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body?.reason, 'task_access_denied');
  });

  await test('upload: stranger đính kèm → 403', async () => {
    const r = await call('POST', `/api/crm/leads/${LEAD}/tasks/${T_A}/attachments`, strangerTok,
      { file_url: 'https://x/f.pdf', file_name: 'f.pdf', doc_type: 'other' });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
  });

  console.log(`\nKết quả: ${passed} pass, ${failed} fail`);
  if (failed) failures.forEach((f) => console.error(`FAIL: ${f.name} — ${f.error}`));
  // Teardown sạch: đóng kết nối còn treo + defer exit để không race handle-close (libuv Windows).
  try { server.closeAllConnections?.(); } catch (_) { /* noop */ }
  server.unref();
  setTimeout(() => process.exit(failed ? 1 : 0), 150).unref();
}

run().catch((e) => {
  console.error('Test runner lỗi:', e);
  if (server) server.close();
  process.exit(1);
});
