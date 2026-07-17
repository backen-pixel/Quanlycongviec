/**
 * 50 test cases B (51–100) — phủ endpoint / cạnh biên khác bộ A.
 *
 * Usage:
 *   npm run test:crm-split:b
 *   CRM_TEST_TOKEN=<jwt> npm run test:crm-split:b
 *   node tests/crm-split-50-cases-b.js --token <jwt>
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CRM_DIR = path.join(ROOT, 'src', 'routes', 'crm');
const BASE = process.env.CRM_TEST_BASE || 'http://localhost:4000';

const FEATURE_MODULES = [
  'dashboard',
  'reports',
  'pipelines',
  'taxonomy',
  'leadDuplicates',
  'leadsList',
  'customers',
  'commercialDocs',
  'taskTemplates',
  'crmTasks',
  'followupPlanner',
  'leadComments',
  'membersChat',
  'leadLifecycle',
];

function parseArgs() {
  const a = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--token') out.token = a[++i];
    else if (a[i] === '--email') out.email = a[++i];
    else if (a[i] === '--password') out.password = a[++i];
  }
  return out;
}

function routeKey(r) {
  return `${r.method} ${r.path}`;
}

function collectLiveRoutes(router) {
  const out = [];
  for (const layer of router.stack || []) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        out.push({ method: method.toUpperCase(), path: layer.route.path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      out.push(...collectLiveRoutes(layer.handle));
    }
  }
  return out;
}

function request(method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body != null ? JSON.stringify(body) : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, json, raw: raw.slice(0, 500) });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

function pickRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const k of ['data', 'leads', 'items', 'rows', 'results', 'quotations']) {
    if (Array.isArray(payload[k]) && payload[k].length) return payload[k];
  }
  for (const v of Object.values(payload)) {
    if (Array.isArray(v) && v[0]?.id) return v;
  }
  return [];
}

function okStatus(r, allowed) {
  if (!allowed.includes(r.status)) {
    throw new Error(`status=${r.status} body=${r.raw}`);
  }
}

function createRunner() {
  const cases = [];
  const ctx = {
    crm: null,
    helpers: null,
    token: null,
    sampleLead: null,
    sampleLeadType: null,
    companyId: null,
    pipelineId: null,
    quotationId: null,
    taskId: null,
    manifest: null,
  };

  function test(id, name, fn) {
    cases.push({ id, name, fn });
  }

  // ─── 51–65: cấu trúc / shadowing / manifest chi tiết (khác bộ A) ─────────
  test(51, 'Mỗi feature file dùng IIFE helpersBundle (không mất closure)', () => {
    for (const m of FEATURE_MODULES) {
      const src = fs.readFileSync(path.join(CRM_DIR, 'routes', `${m}.js`), 'utf8');
      if (!src.includes("require('../shared/helpersBundle')")) {
        throw new Error(`${m}: thiếu helpersBundle`);
      }
      if (!/\(function\s*\(/.test(src)) throw new Error(`${m}: thiếu IIFE wrapper`);
    }
  });

  test(52, 'Manifest by_file khớp số route thực trong từng module', () => {
    ctx.manifest = JSON.parse(fs.readFileSync(path.join(CRM_DIR, 'route-manifest.json'), 'utf8'));
    for (const m of FEATURE_MODULES) {
      const file = `routes/${m}.js`;
      const expected = ctx.manifest.by_file[file];
      const actual = collectLiveRoutes(require(path.join(CRM_DIR, 'routes', `${m}.js`))).length;
      if (expected !== actual) throw new Error(`${m}: manifest=${expected} live=${actual}`);
    }
  });

  test(53, 'Không trùng method+path giữa các feature modules', () => {
    const seen = new Map();
    for (const m of FEATURE_MODULES) {
      for (const r of collectLiveRoutes(require(path.join(CRM_DIR, 'routes', `${m}.js`)))) {
        const k = routeKey(r);
        if (seen.has(k)) throw new Error(`Duplicate ${k} in ${seen.get(k)} & ${m}`);
        seen.set(k, m);
      }
    }
  });

  test(54, 'Static /leads/* paths không nằm trong leadLifecycle', () => {
    const life = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/leadLifecycle.js'))).map(routeKey);
    const forbidden = [
      'GET /leads/picker',
      'GET /leads/scan-duplicates',
      'POST /leads/merge-duplicates',
      'POST /leads/bulk-assign',
      'GET /leads',
      'POST /leads/stage-history-summary',
    ];
    for (const k of forbidden) {
      if (life.includes(k)) throw new Error(`${k} nằm nhầm trong leadLifecycle`);
    }
  });

  test(55, 'leadDuplicates chỉ chứa cụm merge/scan/bulk', () => {
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/leadDuplicates.js'))).map(routeKey);
    if (keys.length !== 5) throw new Error(`expected 5, got ${keys.length}`);
    for (const k of keys) {
      if (!/scan-duplicates|merge-|bulk-assign|cleanup-duplicates/.test(k)) {
        throw new Error(`Unexpected route in leadDuplicates: ${k}`);
      }
    }
  });

  test(56, 'commercialDocs chứa quotations/orders/invoices/products', () => {
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/commercialDocs.js'))).map(routeKey);
    for (const need of ['GET /quotations', 'GET /orders', 'GET /invoices', 'GET /products-list']) {
      if (!keys.includes(need)) throw new Error(`Thiếu ${need}`);
    }
  });

  test(57, 'taxonomy chứa lead-types / sources / zalo-notify-settings', () => {
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/taxonomy.js'))).map(routeKey);
    for (const need of ['GET /lead-types', 'GET /sources', 'GET /zalo-notify-settings']) {
      if (!keys.includes(need)) throw new Error(`Thiếu ${need}`);
    }
  });

  test(58, 'reports chứa org-overview + staff-lead-deal + SLA admin', () => {
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/reports.js'))).map(routeKey);
    for (const need of [
      'GET /reports/org-overview',
      'GET /reports/staff-lead-deal',
      'GET /admin/sla-at-risk',
    ]) {
      if (!keys.includes(need)) throw new Error(`Thiếu ${need}`);
    }
  });

  test(59, 'followupPlanner chứa care-mark / pin / deadline-config / planner', () => {
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/followupPlanner.js'))).map(routeKey);
    const needles = ['care-mark', '/pin', 'deadline-config', '/planner/'];
    for (const n of needles) {
      if (!keys.some((k) => k.includes(n))) throw new Error(`Thiếu pattern ${n}`);
    }
  });

  test(60, 'index.js không đăng ký route handler trực tiếp (chỉ middleware + use)', () => {
    const src = fs.readFileSync(path.join(CRM_DIR, 'index.js'), 'utf8');
    if (/\br\.(get|post|put|patch|delete)\(/.test(src)) {
      throw new Error('index.js vẫn còn r.get/post — nên chỉ mount sub-routers');
    }
  });

  test(61, 'helpersBundle require depth ../../../ (từ shared/)', () => {
    const src = fs.readFileSync(path.join(CRM_DIR, 'shared/helpersBundle.js'), 'utf8');
    if (!src.includes("require('../../../middleware/auth')") && !src.includes('require("../../../middleware/auth")')) {
      throw new Error('helpersBundle auth require path sai');
    }
    if (/require\(['"]\.\.\/middleware\//.test(src)) {
      throw new Error('Còn require ../middleware (sai depth)');
    }
  });

  test(62, 'Feature routes require depth ../../../ cho helpers động', () => {
    const life = fs.readFileSync(path.join(CRM_DIR, 'routes/leadLifecycle.js'), 'utf8');
    // may contain ../../../helpers inside IIFE
    if (/require\(['"]\.\.\/helpers\//.test(life)) {
      throw new Error('leadLifecycle còn require ../helpers (sai depth)');
    }
  });

  test(63, 'Load CRM + helpersBundle OK', () => {
    ctx.crm = require(path.join(ROOT, 'src/routes/crm'));
    ctx.helpers = require(path.join(CRM_DIR, 'shared/helpersBundle.js'));
    if (typeof ctx.crm.handle !== 'function') throw new Error('no handle');
  });

  test(64, 'helpers: emitCrmDashboardChanged + unifyCrmLeadResponsibleFields', () => {
    if (typeof ctx.helpers.emitCrmDashboardChanged !== 'function') throw new Error('emit');
    if (typeof ctx.helpers.unifyCrmLeadResponsibleFields !== 'function') throw new Error('unify');
  });

  test(65, 'helpers: countOpenOverdueCrmTasksForLeadIds + fetchCrmLeadsForDashboardBatched', () => {
    if (typeof ctx.helpers.countOpenOverdueCrmTasksForLeadIds !== 'function') throw new Error('overdue');
    if (typeof ctx.helpers.fetchCrmLeadsForDashboardBatched !== 'function') throw new Error('dashboard batch');
  });

  // ─── 66–100: HTTP endpoints khác bộ A ────────────────────────────────────
  test(66, 'Có JWT', async () => {
    const args = parseArgs();
    let token = args.token || process.env.CRM_TEST_TOKEN || '';
    if (!token && (args.email || process.env.CRM_TEST_EMAIL)) {
      const login = await request('POST', '/api/auth/login', {
        body: {
          email: args.email || process.env.CRM_TEST_EMAIL,
          password: args.password || process.env.CRM_TEST_PASSWORD,
        },
      });
      if (login.status !== 200 || !login.json?.token) throw new Error(`login ${login.status}`);
      token = login.json.token;
    }
    if (!token) throw new Error('Thiếu JWT — CRM_TEST_TOKEN hoặc --token');
    ctx.token = token;
  });

  test(67, 'GET /api/crm/referrers → 200 (taxonomy)', async () => {
    okStatus(await request('GET', '/api/crm/referrers', { token: ctx.token }), [200]);
  });

  test(68, 'GET /api/crm/source-categories → 200', async () => {
    okStatus(await request('GET', '/api/crm/source-categories', { token: ctx.token }), [200]);
  });

  test(69, 'GET /api/crm/zalo-notify-settings → 200', async () => {
    okStatus(await request('GET', '/api/crm/zalo-notify-settings', { token: ctx.token }), [200, 403]);
  });

  test(70, 'GET /api/crm/employees-by-company → 200/400', async () => {
    okStatus(await request('GET', '/api/crm/employees-by-company', { token: ctx.token }), [200, 400]);
  });

  test(71, 'GET /api/crm/alerts/follow-ups → 200/400', async () => {
    okStatus(await request('GET', '/api/crm/alerts/follow-ups', { token: ctx.token }), [200, 400]);
  });

  test(72, 'GET /api/crm/admin/sla-at-risk → 200/403', async () => {
    okStatus(await request('GET', '/api/crm/admin/sla-at-risk', { token: ctx.token }), [200, 403, 400]);
  });

  test(73, 'GET /api/crm/kanban-rows → 200/400', async () => {
    okStatus(await request('GET', '/api/crm/kanban-rows', { token: ctx.token }), [200, 400]);
  });

  test(74, 'GET /api/crm/contract-signed-revenue → 200/400', async () => {
    okStatus(await request('GET', '/api/crm/contract-signed-revenue', { token: ctx.token }), [200, 400]);
  });

  test(75, 'GET /api/crm/ledger-net-by-leads → 200/400', async () => {
    okStatus(await request('GET', '/api/crm/ledger-net-by-leads', { token: ctx.token }), [200, 400]);
  });

  test(76, 'GET /api/crm/stage-counts → 200/400 (leadsList)', async () => {
    okStatus(await request('GET', '/api/crm/stage-counts?type=deal', { token: ctx.token }), [200, 400]);
  });

  test(77, 'GET /api/crm/leads-deadlines → 200/400', async () => {
    okStatus(await request('GET', '/api/crm/leads-deadlines', { token: ctx.token }), [200, 400]);
  });

  test(78, 'GET /api/crm/leads-by-fb-page → 200/400', async () => {
    okStatus(await request('GET', '/api/crm/leads-by-fb-page', { token: ctx.token }), [200, 400]);
  });

  test(79, 'GET /api/crm/leads?type=lead&limit=3 + lưu sample lead', async () => {
    const r = await request('GET', '/api/crm/leads?type=lead&limit=3', { token: ctx.token });
    okStatus(r, [200]);
    let rows = pickRows(r.json);
    if (!rows.length) {
      const d = await request('GET', '/api/crm/leads?type=deal&limit=3', { token: ctx.token });
      okStatus(d, [200]);
      rows = pickRows(d.json);
      ctx.sampleLeadType = 'deal';
    } else {
      ctx.sampleLeadType = 'lead';
    }
    if (!rows.length) throw new Error('Không có lead/deal mẫu');
    ctx.sampleLead = rows[0];
    ctx.companyId = rows[0].company_id || null;
  });

  test(80, 'POST /api/crm/leads/stage-history-summary → 200/400', async () => {
    const r = await request('POST', '/api/crm/leads/stage-history-summary', {
      token: ctx.token,
      body: { lead_ids: [ctx.sampleLead.id] },
    });
    okStatus(r, [200, 400]);
  });

  test(81, 'GET /api/crm/leads/:id/documents → 200/403', async () => {
    okStatus(
      await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/documents`, { token: ctx.token }),
      [200, 403],
    );
  });

  test(82, 'GET /api/crm/leads/:id/task-documents → 200/403', async () => {
    okStatus(
      await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/task-documents`, { token: ctx.token }),
      [200, 403],
    );
  });

  test(83, 'GET /api/crm/leads/:id/activities → 200/403', async () => {
    okStatus(
      await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/activities`, { token: ctx.token }),
      [200, 403],
    );
  });

  test(84, 'GET /api/crm/leads/:id/assignments → 200/403', async () => {
    okStatus(
      await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/assignments`, { token: ctx.token }),
      [200, 403],
    );
  });

  test(85, 'GET /api/crm/leads/:id/deadline-history → 200/403/400', async () => {
    okStatus(
      await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/deadline-history`, { token: ctx.token }),
      [200, 403, 400],
    );
  });

  test(86, 'GET /api/crm/leads/:id/badge → 200/403', async () => {
    okStatus(
      await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/badge`, { token: ctx.token }),
      [200, 403],
    );
  });

  test(87, 'GET /api/crm/leads/:id/task-attachments → 200/403', async () => {
    okStatus(
      await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/task-attachments`, { token: ctx.token }),
      [200, 403],
    );
  });

  test(88, 'GET tasks list + optional task attachments route', async () => {
    const r = await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/tasks`, { token: ctx.token });
    okStatus(r, [200, 403]);
    const tasks = pickRows(r.json);
    if (tasks[0]?.id) {
      ctx.taskId = tasks[0].id;
      const a = await request(
        'GET',
        `/api/crm/leads/${ctx.sampleLead.id}/tasks/${ctx.taskId}/attachments`,
        { token: ctx.token },
      );
      okStatus(a, [200, 403, 404]);
    }
  });

  test(89, 'GET /api/crm/leads/:id/comments/read-receipts → 200/403', async () => {
    okStatus(
      await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/comments/read-receipts`, {
        token: ctx.token,
      }),
      [200, 403],
    );
  });

  test(90, 'GET /api/crm/lead-comments/index → 200', async () => {
    okStatus(await request('GET', '/api/crm/lead-comments/index', { token: ctx.token }), [200]);
  });

  test(91, 'GET /api/crm/lead-care-marks → 200/400', async () => {
    okStatus(await request('GET', '/api/crm/lead-care-marks', { token: ctx.token }), [200, 400]);
  });

  test(92, 'GET /api/crm/settings/deadline-config → 200/403', async () => {
    okStatus(await request('GET', '/api/crm/settings/deadline-config', { token: ctx.token }), [200, 403]);
  });

  test(93, 'GET /api/crm/settings/deal-stage-report-buckets → 200/400', async () => {
    okStatus(
      await request('GET', '/api/crm/settings/deal-stage-report-buckets', { token: ctx.token }),
      [200, 400, 403],
    );
  });

  test(94, 'GET /api/crm/auto-lead-blocked-phones → 200/403', async () => {
    okStatus(await request('GET', '/api/crm/auto-lead-blocked-phones', { token: ctx.token }), [200, 403]);
  });

  test(95, 'GET /api/crm/auto-project-config → 200/403', async () => {
    okStatus(await request('GET', '/api/crm/auto-project-config', { token: ctx.token }), [200, 403]);
  });

  test(96, 'GET /api/crm/customers-overview → 200/400', async () => {
    okStatus(await request('GET', '/api/crm/customers-overview', { token: ctx.token }), [200, 400]);
  });

  test(97, 'GET /api/crm/products-list + pipelines/:id nếu có', async () => {
    okStatus(await request('GET', '/api/crm/products-list', { token: ctx.token }), [200]);
    const pipes = await request('GET', '/api/crm/pipelines', { token: ctx.token });
    okStatus(pipes, [200]);
    const rows = pickRows(pipes.json);
    if (rows[0]?.id) {
      ctx.pipelineId = rows[0].id;
      okStatus(await request('GET', `/api/crm/pipelines/${ctx.pipelineId}`, { token: ctx.token }), [200, 404]);
    }
  });

  test(98, 'GET quotations/:id nếu có mẫu (commercialDocs)', async () => {
    const list = await request('GET', '/api/crm/quotations?limit=3', { token: ctx.token });
    okStatus(list, [200, 400]);
    const rows = pickRows(list.json);
    if (rows[0]?.id) {
      ctx.quotationId = rows[0].id;
      okStatus(
        await request('GET', `/api/crm/quotations/${ctx.quotationId}`, { token: ctx.token }),
        [200, 403, 404],
      );
      okStatus(
        await request('GET', `/api/crm/quotations/${ctx.quotationId}/history`, { token: ctx.token }),
        [200, 403, 404],
      );
    }
  });

  test(99, 'GET /api/crm/tasks/planner + reports/org-activity-feed', async () => {
    okStatus(await request('GET', '/api/crm/tasks/planner', { token: ctx.token }), [200, 400]);
    okStatus(
      await request('GET', '/api/crm/reports/org-activity-feed', { token: ctx.token }),
      [200, 400, 403],
    );
  });

  test(100, 'Shadow check: /leads/scan-duplicates & /leads/picker vẫn 200 (không :id)', async () => {
    const a = await request('GET', '/api/crm/leads/scan-duplicates', { token: ctx.token });
    const b = await request('GET', '/api/crm/leads/picker?type=deal&limit=3', { token: ctx.token });
    okStatus(a, [200, 400]);
    okStatus(b, [200]);
    // Nếu bị :id nuốt thường trả 404 kiểu không tìm thấy lead uuid "picker"
    if (b.status === 404 && /picker|không tìm thấy/i.test(b.raw || '')) {
      throw new Error('picker bị shadow bởi /leads/:id');
    }
  });

  return { cases, ctx };
}

async function main() {
  const { cases } = createRunner();
  if (cases.length !== 50) {
    console.error(`Expected 50 cases, got ${cases.length}`);
    process.exit(2);
  }

  console.log(`CRM split — 50 test cases B #51–100 (base=${BASE})\n`);
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const c of cases) {
    const label = `${c.id}. ${c.name}`;
    try {
      await c.fn();
      pass += 1;
      console.log(`  ✓ ${label}`);
    } catch (e) {
      fail += 1;
      failures.push({ id: c.id, name: c.name, error: e.message || String(e) });
      console.log(`  ✗ ${label}`);
      console.log(`      → ${e.message || e}`);
    }
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`PASS: ${pass}/50`);
  console.log(`FAIL: ${fail}/50`);
  if (failures.length) {
    console.log('\nFailed:');
    for (const f of failures) console.log(`  ${f.id}. ${f.name}: ${f.error}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
