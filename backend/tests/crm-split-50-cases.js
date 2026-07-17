/**
 * 50 test cases — kiểm tra luồng CRM sau khi tách file còn đúng như monolith.
 *
 * Usage:
 *   npm run test:crm-split
 *   CRM_TEST_TOKEN=<jwt> npm run test:crm-split
 *   node tests/crm-split-50-cases.js --token <jwt>
 *   node tests/crm-split-50-cases.js --email x --password y
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CRM_DIR = path.join(ROOT, 'src', 'routes', 'crm');
const BAK = path.join(CRM_DIR, 'core.js.bak');
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

const SHARED_FACADES = [
  'requestScope',
  'pipelineHelpers',
  'realtimeCache',
  'reportHelpers',
  'leadsListHelpers',
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

function extractRoutesFromSource(text) {
  const re = /\br\.(get|post|put|patch|delete)\(\s*(['"])([^'"]+)\2/g;
  const routes = [];
  let m;
  while ((m = re.exec(text))) {
    routes.push({ method: m[1].toUpperCase(), path: m[3] });
  }
  return routes;
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

function parentMiddlewareNames(router) {
  return (router.stack || [])
    .filter((l) => !l.route && l.name !== 'router')
    .map((l) => l.name || l.handle?.name || 'anonymous');
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
          resolve({ status: res.statusCode, json, raw: raw.slice(0, 400) });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

function pickLeadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const k of ['data', 'leads', 'items', 'rows', 'results']) {
    if (Array.isArray(payload[k]) && payload[k][0]?.id) return payload[k];
  }
  for (const v of Object.values(payload)) {
    if (Array.isArray(v) && v[0]?.id) return v;
  }
  return [];
}

function createRunner() {
  const cases = [];
  const ctx = {
    crm: null,
    bakSet: null,
    liveSet: null,
    liveRoutes: [],
    helpers: null,
    token: null,
    sampleLead: null,
    companyId: null,
  };

  function test(id, name, fn) {
    cases.push({ id, name, fn });
  }

  // ─── 01–15: cấu trúc tách file ───────────────────────────────────────────
  test(1, 'Thin entry crm.js re-export ./crm/index.js', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/crm.js'), 'utf8');
    if (!/require\(['"]\.\/crm\/index\.js['"]\)/.test(src)) {
      throw new Error('crm.js không re-export ./crm/index.js');
    }
  });

  test(2, 'Composition root index.js tồn tại và mount feature routers', () => {
    const src = fs.readFileSync(path.join(CRM_DIR, 'index.js'), 'utf8');
    for (const m of FEATURE_MODULES) {
      if (!src.includes(`require('./routes/${m}')`)) throw new Error(`Thiếu require routes/${m}`);
      if (!src.includes(`r.use(${m})`)) throw new Error(`Thiếu r.use(${m})`);
    }
  });

  test(3, 'Đủ 14 file feature router', () => {
    for (const m of FEATURE_MODULES) {
      const p = path.join(CRM_DIR, 'routes', `${m}.js`);
      if (!fs.existsSync(p)) throw new Error(`Missing ${m}.js`);
    }
  });

  test(4, 'helpersBundle.js tồn tại và export được', () => {
    ctx.helpers = require(path.join(CRM_DIR, 'shared/helpersBundle.js'));
    if (!ctx.helpers || typeof ctx.helpers !== 'object') throw new Error('helpersBundle invalid');
  });

  test(5, '5 facade shared tồn tại', () => {
    for (const f of SHARED_FACADES) {
      const mod = require(path.join(CRM_DIR, 'shared', f));
      if (!Object.keys(mod).length) throw new Error(`Facade ${f} rỗng`);
    }
  });

  test(6, 'route-manifest.json có đúng 224 route', () => {
    const m = JSON.parse(fs.readFileSync(path.join(CRM_DIR, 'route-manifest.json'), 'utf8'));
    if (m.total_routes !== 224) throw new Error(`manifest total_routes=${m.total_routes}`);
    if (!Array.isArray(m.routes) || m.routes.length !== 224) throw new Error('manifest.routes length mismatch');
  });

  test(7, 'core.js chỉ còn stub trỏ index', () => {
    const src = fs.readFileSync(path.join(CRM_DIR, 'core.js'), 'utf8').trim();
    if (!/module\.exports\s*=\s*require\(['"]\.\/index/.test(src)) {
      throw new Error('core.js không phải stub');
    }
  });

  test(8, 'Backup core.js.bak còn để so sánh (khuyến nghị)', () => {
    if (!fs.existsSync(BAK)) throw new Error('core.js.bak không có — bỏ qua so sánh bak');
  });

  test(9, 'Load CRM router thành công (handle function)', () => {
    ctx.crm = require(path.join(ROOT, 'src/routes/crm'));
    if (typeof ctx.crm.handle !== 'function') throw new Error('crm.handle không phải function');
  });

  test(10, 'Export computeOrgOverviewReportData còn trên router', () => {
    if (typeof ctx.crm.computeOrgOverviewReportData !== 'function') {
      throw new Error('Thiếu computeOrgOverviewReportData');
    }
  });

  test(11, 'Parent middleware: auth + cache + enforceCrmDealAssigneeAccess', () => {
    const names = parentMiddlewareNames(ctx.crm);
    if (names[0] !== 'auth') throw new Error(`middleware[0]=${names[0]}`);
    if (!names.includes('enforceCrmDealAssigneeAccess')) {
      throw new Error('Thiếu enforceCrmDealAssigneeAccess');
    }
    if (names.length < 3) throw new Error(`Chỉ ${names.length} middleware cha`);
  });

  test(12, 'Đúng 14 nested feature routers trên parent stack', () => {
    const nested = (ctx.crm.stack || []).filter((l) => l.name === 'router').length;
    if (nested !== 14) throw new Error(`nested routers=${nested}`);
  });

  test(13, 'Mount order: leadsList / leadDuplicates trước leadLifecycle', () => {
    const src = fs.readFileSync(path.join(CRM_DIR, 'index.js'), 'utf8');
    const iList = src.indexOf('r.use(leadsList)');
    const iDup = src.indexOf('r.use(leadDuplicates)');
    const iLife = src.indexOf('r.use(leadLifecycle)');
    if (!(iDup < iLife && iList < iLife)) {
      throw new Error(`order dup=${iDup} list=${iList} life=${iLife}`);
    }
  });

  test(14, 'GET /leads/picker nằm ở leadsList, không ở leadLifecycle', () => {
    const list = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/leadsList.js'))).map(routeKey);
    const life = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/leadLifecycle.js'))).map(routeKey);
    if (!list.includes('GET /leads/picker')) throw new Error('picker không trong leadsList');
    if (life.includes('GET /leads/picker')) throw new Error('picker bị đặt nhầm vào lifecycle');
  });

  test(15, 'POST /leads ở leadLifecycle; GET /leads ở leadsList', () => {
    const list = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/leadsList.js'))).map(routeKey);
    const life = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/leadLifecycle.js'))).map(routeKey);
    if (!list.includes('GET /leads')) throw new Error('GET /leads không trong leadsList');
    if (!life.includes('POST /leads')) throw new Error('POST /leads không trong leadLifecycle');
    if (list.includes('POST /leads')) throw new Error('POST /leads không được ở leadsList');
  });

  // ─── 16–25: so khớp registry với bak + helpers ───────────────────────────
  test(16, 'Live router có đúng 224 endpoint', () => {
    ctx.liveRoutes = collectLiveRoutes(ctx.crm);
    ctx.liveSet = new Set(ctx.liveRoutes.map(routeKey));
    if (ctx.liveSet.size !== 224) throw new Error(`live=${ctx.liveSet.size}`);
  });

  test(17, 'Tập endpoint live ≡ bak (không thiếu)', () => {
    if (!fs.existsSync(BAK)) throw new Error('no bak');
    const bakRoutes = extractRoutesFromSource(fs.readFileSync(BAK, 'utf8'));
    ctx.bakSet = new Set(bakRoutes.map(routeKey));
    const missing = [...ctx.bakSet].filter((k) => !ctx.liveSet.has(k));
    if (missing.length) throw new Error(`Missing ${missing.length}: ${missing.slice(0, 8).join(', ')}`);
  });

  test(18, 'Tập endpoint live ≡ bak (không thừa)', () => {
    const extra = [...ctx.liveSet].filter((k) => !ctx.bakSet.has(k));
    if (extra.length) throw new Error(`Extra ${extra.length}: ${extra.slice(0, 8).join(', ')}`);
  });

  test(19, 'Các path tĩnh quan trọng còn trong live set', () => {
    const need = [
      'GET /leads/picker',
      'GET /leads/scan-duplicates',
      'POST /leads/bulk-assign',
      'GET /kanban-bootstrap',
      'GET /web-dashboard-bootstrap',
      'GET /stage-counts',
      'GET /_version',
      'GET /pipelines',
      'GET /quotations',
      'GET /task-templates',
    ];
    for (const k of need) {
      if (!ctx.liveSet.has(k)) throw new Error(`Thiếu ${k}`);
    }
  });

  test(20, 'helpersBundle: supabase / nextCode / userIsAdmin', () => {
    const h = ctx.helpers || require(path.join(CRM_DIR, 'shared/helpersBundle.js'));
    if (!h.supabase) throw new Error('supabase missing');
    if (typeof h.nextCode !== 'function') throw new Error('nextCode');
    if (typeof h.userIsAdmin !== 'function') throw new Error('userIsAdmin');
  });

  test(21, 'helpersBundle: Zalo / pipeline helpers', () => {
    const h = ctx.helpers || require(path.join(CRM_DIR, 'shared/helpersBundle.js'));
    for (const n of ['fetchPipelineWithStagesById', 'executeZaloDealStageNotify', 'maybeSendZaloOnDealStageEnter']) {
      if (typeof h[n] !== 'function') throw new Error(n);
    }
  });

  test(22, 'helpersBundle: autoFlow bindings (onLeadWon, createProjectFromLead)', () => {
    const h = ctx.helpers || require(path.join(CRM_DIR, 'shared/helpersBundle.js'));
    if (typeof h.onLeadWon !== 'function') throw new Error('onLeadWon');
    if (typeof h.createProjectFromLead !== 'function') throw new Error('createProjectFromLead');
  });

  test(23, 'helpersBundle: commercial quotation helpers', () => {
    const h = ctx.helpers || require(path.join(CRM_DIR, 'shared/helpersBundle.js'));
    for (const n of ['insertQuotationRow', 'updateQuotationRow', 'enforceCommercialDocCompanyOnWrite']) {
      if (typeof h[n] !== 'function') throw new Error(n);
    }
  });

  test(24, 'Facade requestScope / reportHelpers trỏ đúng hàm', () => {
    const scope = require(path.join(CRM_DIR, 'shared/requestScope.js'));
    const report = require(path.join(CRM_DIR, 'shared/reportHelpers.js'));
    if (typeof scope.requireUserCompanyId !== 'function') throw new Error('requireUserCompanyId');
    if (typeof report.computeOrgOverviewReportData !== 'function') throw new Error('computeOrgOverviewReportData facade');
  });

  test(25, 'Mỗi feature module đăng ký ≥1 route', () => {
    for (const m of FEATURE_MODULES) {
      const r = require(path.join(CRM_DIR, 'routes', `${m}.js`));
      const n = collectLiveRoutes(r).length;
      if (n < 1) throw new Error(`${m} có 0 route`);
    }
  });

  // ─── 26–50: HTTP live (cần JWT) ──────────────────────────────────────────
  test(26, 'Unauth GET /api/crm/_version → 401/403', async () => {
    const r = await request('GET', '/api/crm/_version');
    if (![401, 403].includes(r.status)) throw new Error(`status=${r.status}`);
  });

  test(27, 'Auth: có JWT (env/arg/login)', async () => {
    const args = parseArgs();
    let token = args.token || process.env.CRM_TEST_TOKEN || '';
    if (!token && (args.email || process.env.CRM_TEST_EMAIL)) {
      const login = await request('POST', '/api/auth/login', {
        body: {
          email: args.email || process.env.CRM_TEST_EMAIL,
          password: args.password || process.env.CRM_TEST_PASSWORD,
        },
      });
      if (login.status !== 200 || !login.json?.token) {
        throw new Error(`login ${login.status}: ${login.raw}`);
      }
      token = login.json.token;
    }
    if (!token) throw new Error('Thiếu JWT — set CRM_TEST_TOKEN hoặc --token');
    ctx.token = token;
  });

  test(28, 'GET /api/crm/_version → 200 ok', async () => {
    const r = await request('GET', '/api/crm/_version', { token: ctx.token });
    if (r.status !== 200 || r.json?.ok !== true) throw new Error(`${r.status} ${r.raw}`);
  });

  test(29, 'GET /api/crm/pipelines → 200', async () => {
    const r = await request('GET', '/api/crm/pipelines', { token: ctx.token });
    if (r.status !== 200) throw new Error(`${r.status} ${r.raw}`);
  });

  test(30, 'GET /api/crm/pipeline-stages → 200 hoặc 400', async () => {
    const r = await request('GET', '/api/crm/pipeline-stages', { token: ctx.token });
    if (![200, 400].includes(r.status)) throw new Error(`${r.status} ${r.raw}`);
  });

  test(31, 'GET /api/crm/lead-types → 200 (taxonomy)', async () => {
    const r = await request('GET', '/api/crm/lead-types', { token: ctx.token });
    if (r.status !== 200) throw new Error(`${r.status} ${r.raw}`);
  });

  test(32, 'GET /api/crm/sources → 200 (taxonomy)', async () => {
    const r = await request('GET', '/api/crm/sources', { token: ctx.token });
    if (r.status !== 200) throw new Error(`${r.status} ${r.raw}`);
  });

  test(33, 'GET /api/crm/leads/picker không bị :id nuốt', async () => {
    const r = await request('GET', '/api/crm/leads/picker?type=deal&limit=5', { token: ctx.token });
    if (r.status !== 200) throw new Error(`${r.status} ${r.raw}`);
    if (!r.json || typeof r.json !== 'object') throw new Error('body không phải object picker');
  });

  test(34, 'GET /api/crm/leads/scan-duplicates → 200 (leadDuplicates)', async () => {
    const r = await request('GET', '/api/crm/leads/scan-duplicates', { token: ctx.token });
    if (![200, 400].includes(r.status)) throw new Error(`${r.status} ${r.raw}`);
  });

  test(35, 'GET /api/crm/leads?type=deal&limit=5 → 200 + lấy sample', async () => {
    const r = await request('GET', '/api/crm/leads?type=deal&limit=5', { token: ctx.token });
    if (r.status !== 200) throw new Error(`${r.status} ${r.raw}`);
    const rows = pickLeadRows(r.json);
    if (!rows.length) throw new Error('Không có deal mẫu để test detail');
    ctx.sampleLead = rows[0];
    ctx.companyId = rows[0].company_id || null;
  });

  test(36, 'GET /api/crm/kanban-bootstrap?type=lead → 200', async () => {
    const r = await request('GET', '/api/crm/kanban-bootstrap?type=lead', { token: ctx.token });
    if (r.status !== 200) throw new Error(`${r.status} ${r.raw}`);
  });

  test(37, 'GET /api/crm/web-dashboard-bootstrap → 200', async () => {
    const r = await request('GET', '/api/crm/web-dashboard-bootstrap', { token: ctx.token });
    if (r.status !== 200) throw new Error(`${r.status} ${r.raw}`);
  });

  test(38, 'GET /api/crm/dashboard?type=lead&light=1 → 200', async () => {
    const r = await request('GET', '/api/crm/dashboard?type=lead&light=1', { token: ctx.token });
    if (r.status !== 200) throw new Error(`${r.status} ${r.raw}`);
  });

  test(39, 'GET /api/crm/live-version → 200/304', async () => {
    const r = await request('GET', '/api/crm/live-version', { token: ctx.token });
    if (![200, 304].includes(r.status)) throw new Error(`${r.status} ${r.raw}`);
  });

  test(40, 'GET /api/crm/leads/:id → 200 (lifecycle)', async () => {
    const id = ctx.sampleLead.id;
    const r = await request('GET', `/api/crm/leads/${id}`, { token: ctx.token });
    if (![200, 403].includes(r.status)) throw new Error(`${r.status} ${r.raw}`);
  });

  test(41, 'GET /api/crm/leads/:id/detail → 200', async () => {
    const r = await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/detail`, { token: ctx.token });
    if (![200, 403].includes(r.status)) throw new Error(`${r.status} ${r.raw}`);
  });

  test(42, 'GET /api/crm/leads/:id/tasks → 200 (crmTasks)', async () => {
    const r = await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/tasks`, { token: ctx.token });
    if (![200, 403].includes(r.status)) throw new Error(`${r.status} ${r.raw}`);
  });

  test(43, 'GET /api/crm/leads/:id/comments → 200 (leadComments)', async () => {
    const r = await request('GET', `/api/crm/leads/${ctx.sampleLead.id}/comments`, { token: ctx.token });
    if (![200, 403].includes(r.status)) throw new Error(`${r.status} ${r.raw}`);
  });

  test(44, 'GET /api/crm/leads/:id/members + chat (membersChat)', async () => {
    const id = ctx.sampleLead.id;
    const m = await request('GET', `/api/crm/leads/${id}/members`, { token: ctx.token });
    const c = await request('GET', `/api/crm/leads/${id}/chat`, { token: ctx.token });
    if (![200, 403].includes(m.status)) throw new Error(`members ${m.status}`);
    if (![200, 403].includes(c.status)) throw new Error(`chat ${c.status}`);
  });

  test(45, 'Commercial docs: quotations / orders / invoices → 200', async () => {
    for (const p of ['/api/crm/quotations?limit=3', '/api/crm/orders?limit=3', '/api/crm/invoices?limit=3']) {
      const r = await request('GET', p, { token: ctx.token });
      if (![200, 400].includes(r.status)) throw new Error(`${p} → ${r.status}`);
    }
  });

  test(46, 'GET /api/crm/task-templates + tasks/overview → 200', async () => {
    const a = await request('GET', '/api/crm/task-templates', { token: ctx.token });
    const b = await request('GET', '/api/crm/tasks/overview', { token: ctx.token });
    if (a.status !== 200) throw new Error(`templates ${a.status}`);
    if (![200, 400].includes(b.status)) throw new Error(`overview ${b.status}`);
  });

  test(47, 'Customers + company-regions (customers module)', async () => {
    const c = await request('GET', '/api/crm/customers?limit=5', { token: ctx.token });
    if (![200, 400].includes(c.status)) throw new Error(`customers ${c.status}`);
    if (!ctx.companyId) throw new Error('Thiếu company_id từ sample lead');
    const r = await request('GET', `/api/crm/company-regions?company_id=${ctx.companyId}`, {
      token: ctx.token,
    });
    if (r.status !== 200) throw new Error(`regions ${r.status} ${r.raw}`);
  });

  test(48, 'Follow-up / planner: notifications + planner/me → 200', async () => {
    const a = await request('GET', '/api/crm/followup-care/notifications', { token: ctx.token });
    const b = await request('GET', '/api/crm/planner/me', { token: ctx.token });
    if (![200, 400].includes(a.status)) throw new Error(`followup ${a.status}`);
    if (b.status !== 200) throw new Error(`planner ${b.status}`);
  });

  test(49, 'Reports: staff-lead-deal + org-overview → 200/403', async () => {
    const a = await request('GET', '/api/crm/reports/staff-lead-deal', { token: ctx.token });
    const b = await request('GET', '/api/crm/reports/org-overview?date_from=2026-06-01&date_to=2026-07-16', {
      token: ctx.token,
    });
    if (![200, 403, 400].includes(a.status)) throw new Error(`staff ${a.status}`);
    if (![200, 403, 400].includes(b.status)) throw new Error(`org ${b.status}`);
  });

  test(50, 'computeOrgOverviewReportData callable (AI export contract)', async () => {
    const mockReq = {
      user: { userId: '0db73a17-8ac2-4aaa-b2a8-c8f90360d77e', role: 'admin', company_id: null },
      query: { date_from: '2026-06-01', date_to: '2026-06-02' },
      headers: {},
    };
    let statusCode = 200;
    const mockRes = {
      status(c) {
        statusCode = c;
        return this;
      },
      json() {
        return this;
      },
    };
    const data = await ctx.crm.computeOrgOverviewReportData(mockReq, mockRes);
    if (!(data || [400, 403].includes(statusCode))) {
      throw new Error(`empty result status=${statusCode}`);
    }
  });

  return { cases, ctx };
}

async function main() {
  const { cases } = createRunner();
  if (cases.length !== 50) {
    console.error(`Internal error: expected 50 cases, got ${cases.length}`);
    process.exit(2);
  }

  console.log(`CRM split — 50 test cases (base=${BASE})\n`);
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const c of cases) {
    const label = `${String(c.id).padStart(2, '0')}. ${c.name}`;
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
    console.log('\nFailed cases:');
    for (const f of failures) console.log(`  ${f.id}. ${f.name}: ${f.error}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
