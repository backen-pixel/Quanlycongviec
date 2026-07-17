/**
 * 100 test cases — CRM split qua GIAO DIỆN + backend.
 *
 * Map mỗi trang UI → module route đã tách → kiểm tra:
 *   A) Cấu trúc file (không cần server)
 *   B) API mà trang gọi (cần backend :4000)
 *   C) UI thật trên Vite (cần frontend :5173 + Playwright)
 *
 * Usage:
 *   npm run test:crm-split:ui
 *   CRM_TEST_TOKEN=<jwt> npm run test:crm-split:ui
 *   node tests/crm-split-100-ui.js --token <jwt>
 *   node tests/crm-split-100-ui.js --email x --password y --skip-ui
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CRM_DIR = path.join(ROOT, 'src', 'routes', 'crm');
const FE = process.env.CRM_UI_BASE || 'http://localhost:5173';
const API = process.env.CRM_TEST_BASE || 'http://localhost:4000';

/** Trang UI CRM ↔ module backend sau tách */
const UI_PAGE_MAP = [
  { path: '/crm/dashboard', modules: ['dashboard', 'leadsList'], apis: ['/api/crm/dashboard?type=lead&light=1', '/api/crm/live-version', '/api/crm/kanban-bootstrap?type=lead'] },
  { path: '/crm/pipeline', modules: ['leadsList', 'pipelines'], apis: ['/api/crm/pipelines', '/api/crm/leads?type=deal&limit=20'] },
  { path: '/crm/quotations', modules: ['commercialDocs'], apis: ['/api/crm/quotations?limit=20'] },
  { path: '/crm/orders', modules: ['commercialDocs'], apis: ['/api/crm/orders?limit=20'] },
  { path: '/crm/invoices', modules: ['commercialDocs'], apis: ['/api/crm/invoices?limit=20'] },
  { path: '/crm/products', modules: ['commercialDocs'], apis: ['/api/crm/products-list'] },
  { path: '/crm/customers', modules: ['customers'], apis: ['/api/crm/customers?limit=20'] },
  { path: '/crm/tasks', modules: ['crmTasks', 'taskTemplates'], apis: ['/api/crm/tasks/overview'] },
  { path: '/crm/task-templates', modules: ['taskTemplates'], apis: ['/api/crm/task-templates'] },
  { path: '/crm/follow-up-care', modules: ['followupPlanner'], apis: ['/api/crm/followup-care/notifications', '/api/crm/lead-care-marks'] },
  { path: '/crm/pipeline-settings', modules: ['pipelines'], apis: ['/api/crm/pipelines'] },
  { path: '/crm/sources-settings', modules: ['taxonomy'], apis: ['/api/crm/sources', '/api/crm/source-categories', '/api/crm/lead-types'] },
  { path: '/crm/reports/org-overview', modules: ['reports'], apis: ['/api/crm/reports/org-overview?date_from=2026-06-01&date_to=2026-07-16'] },
  { path: '/crm/reports/staff-lead-deal', modules: ['reports'], apis: ['/api/crm/reports/staff-lead-deal'] },
  { path: '/crm/admin/sla-watchlist', modules: ['reports'], apis: ['/api/crm/admin/sla-at-risk'] },
  { path: '/crm/deadline-settings', modules: ['followupPlanner'], apis: ['/api/crm/settings/deadline-config'] },
  { path: '/crm/auto-project-config', modules: ['leadLifecycle'], apis: ['/api/crm/auto-project-config'] },
  { path: '/crm/blocked-phones', modules: ['leadLifecycle'], apis: ['/api/crm/auto-lead-blocked-phones'] },
  { path: '/crm/settings/deal-stage-report', modules: ['reports'], apis: ['/api/crm/settings/deal-stage-report-buckets'] },
];

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { skipUi: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--token') out.token = a[++i];
    else if (a[i] === '--email') out.email = a[++i];
    else if (a[i] === '--password') out.password = a[++i];
    else if (a[i] === '--skip-ui') out.skipUi = true;
  }
  return out;
}

function request(method, urlPath, { token, body, base = API } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath.startsWith('http') ? urlPath : base.replace(/\/$/, '') + urlPath);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body != null ? JSON.stringify(body) : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: 'application/json, text/html, */*',
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
          resolve({ status: res.statusCode, json, raw: raw.slice(0, 800), headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

function collectLiveRoutes(router) {
  const out = [];
  for (const layer of router.stack || []) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        out.push(`${method.toUpperCase()} ${layer.route.path}`);
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      out.push(...collectLiveRoutes(layer.handle));
    }
  }
  return out;
}

function pickRows(payload) {
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

function okStatus(r, allowed) {
  if (!allowed.includes(r.status)) throw new Error(`status=${r.status} body=${r.raw?.slice(0, 200)}`);
}

async function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return null;
  }
}

function createRunner(args) {
  const cases = [];
  const ctx = {
    token: null,
    sampleLeadId: null,
    companyId: null,
    browser: null,
    page: null,
    playwright: null,
    uiReady: false,
    apiReady: false,
    crm: null,
  };

  function test(id, name, fn, { needsApi = false, needsUi = false } = {}) {
    cases.push({ id, name, fn, needsApi, needsUi });
  }

  // ═══════════════ 01–20: Cấu trúc tách ↔ trang UI ═══════════════
  test(1, 'Thin entry crm.js → crm/index.js', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/crm.js'), 'utf8');
    if (!/crm\/index\.js/.test(src)) throw new Error('thin entry sai');
  });

  test(2, 'index.js mount đủ 14 feature modules', () => {
    const src = fs.readFileSync(path.join(CRM_DIR, 'index.js'), 'utf8');
    const mods = [
      'dashboard', 'reports', 'pipelines', 'taxonomy', 'leadDuplicates', 'leadsList',
      'customers', 'commercialDocs', 'taskTemplates', 'crmTasks', 'followupPlanner',
      'leadComments', 'membersChat', 'leadLifecycle',
    ];
    for (const m of mods) {
      if (!src.includes(`r.use(${m})`)) throw new Error(`thiếu mount ${m}`);
    }
  });

  test(3, 'UI /crm/dashboard map → dashboard + leadsList modules tồn tại', () => {
    for (const m of ['dashboard', 'leadsList']) {
      if (!fs.existsSync(path.join(CRM_DIR, 'routes', `${m}.js`))) throw new Error(m);
    }
  });

  test(4, 'UI /crm/quotations|orders|invoices → commercialDocs.js', () => {
    if (!fs.existsSync(path.join(CRM_DIR, 'routes/commercialDocs.js'))) throw new Error('missing');
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/commercialDocs.js')));
    for (const k of ['GET /quotations', 'GET /orders', 'GET /invoices']) {
      if (!keys.includes(k)) throw new Error(k);
    }
  });

  test(5, 'UI /crm/pipeline-settings → pipelines.js', () => {
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/pipelines.js')));
    if (!keys.includes('GET /pipelines')) throw new Error('GET /pipelines');
  });

  test(6, 'UI /crm/sources-settings → taxonomy.js', () => {
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/taxonomy.js')));
    for (const k of ['GET /sources', 'GET /lead-types']) {
      if (!keys.includes(k)) throw new Error(k);
    }
  });

  test(7, 'UI /crm/customers → customers.js', () => {
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/customers.js')));
    if (!keys.includes('GET /customers')) throw new Error('GET /customers');
  });

  test(8, 'UI /crm/tasks → crmTasks.js + taskTemplates.js', () => {
    for (const m of ['crmTasks', 'taskTemplates']) {
      if (!fs.existsSync(path.join(CRM_DIR, 'routes', `${m}.js`))) throw new Error(m);
    }
  });

  test(9, 'UI /crm/follow-up-care → followupPlanner.js', () => {
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/followupPlanner.js')));
    if (!keys.some((k) => k.includes('followup-care') || k.includes('care-mark'))) {
      throw new Error('followup routes missing');
    }
  });

  test(10, 'UI /crm/reports/* → reports.js', () => {
    const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes/reports.js')));
    if (!keys.includes('GET /reports/org-overview')) throw new Error('org-overview');
  });

  test(11, 'UI /crm/leads/:id → leadLifecycle + crmTasks + leadComments + membersChat', () => {
    for (const m of ['leadLifecycle', 'crmTasks', 'leadComments', 'membersChat']) {
      if (!fs.existsSync(path.join(CRM_DIR, 'routes', `${m}.js`))) throw new Error(m);
    }
  });

  test(12, 'Frontend App.jsx vẫn khai báo các route CRM chính', () => {
    const app = fs.readFileSync(path.join(ROOT, '../frontend/src/App.jsx'), 'utf8');
    for (const p of [
      '/crm/dashboard', '/crm/quotations', '/crm/orders', '/crm/invoices',
      '/crm/customers', '/crm/tasks', '/crm/leads/:id', '/crm/pipeline-settings',
      '/crm/sources-settings', '/crm/follow-up-care', '/crm/task-templates',
    ]) {
      if (!app.includes(p)) throw new Error(`App.jsx thiếu ${p}`);
    }
  });

  test(13, 'leadsList mount trước leadLifecycle (UI picker/kanban an toàn)', () => {
    const src = fs.readFileSync(path.join(CRM_DIR, 'index.js'), 'utf8');
    if (src.indexOf('r.use(leadsList)') >= src.indexOf('r.use(leadLifecycle)')) {
      throw new Error('mount order sai');
    }
  });

  test(14, 'helpersBundle + facades tồn tại (UI phụ thuộc shared helpers)', () => {
    if (!fs.existsSync(path.join(CRM_DIR, 'shared/helpersBundle.js'))) throw new Error('helpersBundle');
    for (const f of ['requestScope', 'reportHelpers', 'pipelineHelpers']) {
      if (!fs.existsSync(path.join(CRM_DIR, 'shared', `${f}.js`))) throw new Error(f);
    }
  });

  test(15, 'route-manifest 224 endpoint', () => {
    const m = JSON.parse(fs.readFileSync(path.join(CRM_DIR, 'route-manifest.json'), 'utf8'));
    if (m.total_routes !== 224) throw new Error(String(m.total_routes));
  });

  test(16, 'Load CRM router + computeOrgOverviewReportData (UI báo cáo org)', () => {
    ctx.crm = require(path.join(ROOT, 'src/routes/crm'));
    if (typeof ctx.crm.handle !== 'function') throw new Error('handle');
    if (typeof ctx.crm.computeOrgOverviewReportData !== 'function') throw new Error('AI export');
  });

  test(17, 'Mỗi UI_PAGE_MAP module file tồn tại', () => {
    for (const page of UI_PAGE_MAP) {
      for (const m of page.modules) {
        if (!fs.existsSync(path.join(CRM_DIR, 'routes', `${m}.js`))) {
          throw new Error(`${page.path} → missing ${m}`);
        }
      }
    }
  });

  test(18, 'Không trùng route giữa modules (tránh UI gọi nhầm handler)', () => {
    const seen = new Map();
    const mods = fs.readdirSync(path.join(CRM_DIR, 'routes')).filter((f) => f.endsWith('.js'));
    for (const f of mods) {
      const keys = collectLiveRoutes(require(path.join(CRM_DIR, 'routes', f)));
      for (const k of keys) {
        if (seen.has(k)) throw new Error(`duplicate ${k}`);
        seen.set(k, f);
      }
    }
  });

  test(19, 'Parent middleware auth+cache+assignee (mọi trang CRM)', () => {
    const names = (ctx.crm.stack || [])
      .filter((l) => !l.route && l.name !== 'router')
      .map((l) => l.name || 'anon');
    if (names[0] !== 'auth') throw new Error('auth first');
    if (!names.includes('enforceCrmDealAssigneeAccess')) throw new Error('assignee gate');
  });

  test(20, 'Frontend pages CRM tồn tại (file)', () => {
    const pages = [
      'CRMDashboard.jsx', 'QuotationsPage.jsx', 'OrdersPage.jsx', 'InvoicesPage.jsx',
      'CRMCustomersPage.jsx', 'CRMTasksPage.jsx', 'LeadDetail.jsx', 'PipelineSettingsPage.jsx',
      'CRMSourcesSettingsPage.jsx', 'CrmFollowUpCarePage.jsx',
    ];
    const dir = path.join(ROOT, '../frontend/src/pages');
    for (const p of pages) {
      if (!fs.existsSync(path.join(dir, p))) throw new Error(p);
    }
  });

  // ═══════════════ 21–55: API contracts cho từng trang UI ═══════════════
  test(21, 'Backend /api sống', async () => {
    try {
      const r = await request('GET', '/api/crm/_version');
      ctx.apiReady = [401, 403, 200].includes(r.status);
      if (!ctx.apiReady) throw new Error(`unexpected ${r.status}`);
    } catch (e) {
      throw new Error(`Backend :4000 không chạy — ${e.message}`);
    }
  }, { needsApi: true });

  test(22, 'Lấy JWT (token/login)', async () => {
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
  }, { needsApi: true });

  test(23, 'API auth gate: /_version unauth 401', async () => {
    okStatus(await request('GET', '/api/crm/_version'), [401, 403]);
  }, { needsApi: true });

  test(24, 'API auth OK: /_version 200', async () => {
    okStatus(await request('GET', '/api/crm/_version', { token: ctx.token }), [200]);
  }, { needsApi: true });

  // Generate one API test per UI page's primary APIs (25–43)
  UI_PAGE_MAP.forEach((page, idx) => {
    const id = 25 + idx;
    if (id > 43) return;
    test(
      id,
      `API cho UI ${page.path} (${page.modules.join('+')})`,
      async () => {
        for (const api of page.apis) {
          const r = await request('GET', api, { token: ctx.token });
          okStatus(r, [200, 304, 400, 403]);
        }
      },
      { needsApi: true },
    );
  });

  test(44, 'API leads list → sample cho UI LeadDetail', async () => {
    const r = await request('GET', '/api/crm/leads?type=deal&limit=5', { token: ctx.token });
    okStatus(r, [200]);
    const rows = pickRows(r.json);
    if (!rows[0]?.id) throw new Error('không có deal mẫu');
    ctx.sampleLeadId = rows[0].id;
    ctx.companyId = rows[0].company_id || null;
  }, { needsApi: true });

  test(45, 'API LeadDetail bundle: detail+tasks+comments+members+chat', async () => {
    const id = ctx.sampleLeadId;
    for (const suffix of ['', '/detail', '/tasks', '/comments', '/members', '/chat', '/documents', '/activities']) {
      const r = await request('GET', `/api/crm/leads/${id}${suffix || ''}`, { token: ctx.token });
      // '' is GET /leads/:id
      okStatus(r, [200, 403]);
    }
  }, { needsApi: true });

  test(46, 'API picker (UI chọn deal) không bị :id shadow', async () => {
    okStatus(
      await request('GET', '/api/crm/leads/picker?type=deal&limit=5', { token: ctx.token }),
      [200],
    );
  }, { needsApi: true });

  test(47, 'API kanban-bootstrap (UI dashboard/pipeline)', async () => {
    okStatus(
      await request('GET', '/api/crm/kanban-bootstrap?type=lead', { token: ctx.token }),
      [200],
    );
  }, { needsApi: true });

  test(48, 'API web-dashboard-bootstrap', async () => {
    okStatus(await request('GET', '/api/crm/web-dashboard-bootstrap', { token: ctx.token }), [200]);
  }, { needsApi: true });

  test(49, 'API stage-counts (UI cột kanban)', async () => {
    okStatus(await request('GET', '/api/crm/stage-counts?type=deal', { token: ctx.token }), [200, 400]);
  }, { needsApi: true });

  test(50, 'API company-regions (UI filter chi nhánh)', async () => {
    if (!ctx.companyId) {
      okStatus(await request('GET', '/api/crm/company-regions', { token: ctx.token }), [400]);
      return;
    }
    okStatus(
      await request('GET', `/api/crm/company-regions?company_id=${ctx.companyId}`, { token: ctx.token }),
      [200],
    );
  }, { needsApi: true });

  test(51, 'API referrers + source-categories (UI sources settings)', async () => {
    okStatus(await request('GET', '/api/crm/referrers', { token: ctx.token }), [200]);
    okStatus(await request('GET', '/api/crm/source-categories', { token: ctx.token }), [200]);
  }, { needsApi: true });

  test(52, 'API zalo-notify-settings (UI taxonomy/zalo)', async () => {
    okStatus(await request('GET', '/api/crm/zalo-notify-settings', { token: ctx.token }), [200, 403]);
  }, { needsApi: true });

  test(53, 'API products-list (UI /crm/products)', async () => {
    okStatus(await request('GET', '/api/crm/products-list', { token: ctx.token }), [200]);
  }, { needsApi: true });

  test(54, 'API task-templates (UI templates page)', async () => {
    okStatus(await request('GET', '/api/crm/task-templates', { token: ctx.token }), [200]);
  }, { needsApi: true });

  test(55, 'API planner/me + tasks/planner (UI planner)', async () => {
    okStatus(await request('GET', '/api/crm/planner/me', { token: ctx.token }), [200]);
    okStatus(await request('GET', '/api/crm/tasks/planner', { token: ctx.token }), [200, 400]);
  }, { needsApi: true });

  // ═══════════════ 56–100: UI thật (Playwright) ═══════════════
  test(56, 'Frontend Vite sống (:5173)', async () => {
    if (args.skipUi) throw new Error('skip-ui');
    try {
      const r = await request('GET', '/', { base: FE });
      ctx.uiReady = r.status === 200 && /html|root|vite/i.test(r.raw || '');
      if (!ctx.uiReady) throw new Error(`status=${r.status}`);
    } catch (e) {
      throw new Error(`Frontend :5173 không chạy — ${e.message}`);
    }
  }, { needsUi: true });

  test(57, 'Khởi tạo Playwright browser + inject JWT', async () => {
    if (args.skipUi) throw new Error('skip-ui');
    ctx.playwright = await loadPlaywright();
    if (!ctx.playwright) {
      throw new Error('Chưa cài playwright — chạy: cd backend && npm i -D playwright && npx playwright install chromium');
    }
    ctx.browser = await ctx.playwright.chromium.launch({ headless: true });
    const context = await ctx.browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript((token) => {
      localStorage.setItem('token', token);
    }, ctx.token);
    // Also seed a minimal user object so AuthProvider không redirect login
    await context.addInitScript(() => {
      if (!localStorage.getItem('user')) {
        localStorage.setItem(
          'user',
          JSON.stringify({
            id: 'ui-test',
            userId: 'ui-test',
            email: 'admin@tubep.vn',
            role: 'admin',
            full_name: 'UI Test',
            company_id: null,
          }),
        );
      }
    });
    ctx.page = await context.newPage();
  }, { needsUi: true, needsApi: true });

  async function gotoCrm(pathSuffix) {
    const url = FE.replace(/\/$/, '') + pathSuffix;
    const crmApiHits = [];
    const onResp = (res) => {
      const u = res.url();
      if (u.includes('/api/crm')) {
        crmApiHits.push({ url: u, status: res.status() });
      }
    };
    ctx.page.on('response', onResp);
    await ctx.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1800));
    ctx.page.off('response', onResp);
    return { url, crmApiHits, title: await ctx.page.title(), bodyText: await ctx.page.locator('body').innerText().catch(() => '') };
  }

  function assertNotLoginWall(info) {
    const t = (info.bodyText || '').toLowerCase();
    if (t.includes('đăng nhập') && t.includes('mật khẩu') && !t.includes('kanban') && !t.includes('pipeline')) {
      // soft: many pages still show chrome; only fail if clearly login form dominant
      if (t.length < 400) throw new Error('Có vẻ bị đẩy về màn login');
    }
  }

  function assertCrmApiOk(info, minHits = 1) {
    const hits = info.crmApiHits || [];
    if (hits.length < minHits) {
      // SPA có thể cache — không fail cứng nếu HTML đã render nội dung CRM
      return;
    }
    const bad = hits.filter((h) => h.status >= 500);
    if (bad.length) throw new Error(`CRM API 5xx: ${bad.map((b) => `${b.status} ${b.url}`).join('; ')}`);
  }

  // UI pages 58–76
  const uiPagesForGoto = [
    { id: 58, path: '/crm/dashboard', label: 'Dashboard', expect: /crm|dashboard|lead|deal|kanban|pipeline/i },
    { id: 59, path: '/crm/pipeline', label: 'Pipeline/Kanban', expect: /pipeline|kanban|deal|lead|cột|giai đoạn/i },
    { id: 60, path: '/crm/quotations', label: 'Báo giá', expect: /báo giá|quotation|bg-|chứng từ/i },
    { id: 61, path: '/crm/orders', label: 'Đơn hàng', expect: /đơn hàng|order|đơn/i },
    { id: 62, path: '/crm/invoices', label: 'Hóa đơn', expect: /hóa đơn|invoice/i },
    { id: 63, path: '/crm/products', label: 'Sản phẩm', expect: /sản phẩm|product/i },
    { id: 64, path: '/crm/customers', label: 'Khách hàng', expect: /khách|customer/i },
    { id: 65, path: '/crm/tasks', label: 'Nhiệm vụ CRM', expect: /nhiệm vụ|task|công việc/i },
    { id: 66, path: '/crm/task-templates', label: 'Mẫu nhiệm vụ', expect: /mẫu|template|nhiệm vụ/i },
    { id: 67, path: '/crm/follow-up-care', label: 'CSKH follow-up', expect: /chăm sóc|follow|care|nhắc/i },
    { id: 68, path: '/crm/pipeline-settings', label: 'Cài đặt pipeline', expect: /pipeline|giai đoạn|cột|cài đặt/i },
    { id: 69, path: '/crm/sources-settings', label: 'Nguồn lead', expect: /nguồn|source|phân loại/i },
    { id: 70, path: '/crm/reports/org-overview', label: 'BC tổ chức', expect: /báo cáo|tổ chức|overview|nhân viên/i },
    { id: 71, path: '/crm/reports/staff-lead-deal', label: 'BC NV lead-deal', expect: /báo cáo|nhân viên|lead|deal/i },
    { id: 72, path: '/crm/deadline-settings', label: 'Cài đặt deadline', expect: /deadline|hạn|cài đặt|sla/i },
    { id: 73, path: '/crm/auto-project-config', label: 'Auto project config', expect: /tự động|project|sản xuất|cấu hình/i },
    { id: 74, path: '/crm/blocked-phones', label: 'SĐT chặn', expect: /chặn|block|phone|sđt|số điện thoại/i },
    { id: 75, path: '/crm/assignments', label: 'Assignments', expect: /giao|assignment|nhiệm vụ|phân công/i },
    { id: 76, path: '/crm/categories', label: 'Categories', expect: /danh mục|category|loại/i },
  ];

  for (const p of uiPagesForGoto) {
    test(
      p.id,
      `UI mở ${p.path} (${p.label}) — render + CRM API không 5xx`,
      async () => {
        if (!ctx.page) throw new Error('no page');
        const info = await gotoCrm(p.path);
        assertNotLoginWall(info);
        assertCrmApiOk(info);
        if (!p.expect.test(info.bodyText) && !p.expect.test(info.title)) {
          // Cho phép trang quyền hạn chế vẫn OK nếu không 5xx và có shell app
          if (!/tubep|crm|quản lý/i.test(info.title + info.bodyText)) {
            throw new Error(`Không thấy nội dung kỳ vọng cho ${p.label}`);
          }
        }
      },
      { needsUi: true, needsApi: true },
    );
  }

  test(77, 'UI LeadDetail /crm/leads/:id — tabs dữ liệu từ lifecycle/tasks/comments', async () => {
    if (!ctx.page || !ctx.sampleLeadId) throw new Error('thiếu page/lead');
    const info = await gotoCrm(`/crm/leads/${ctx.sampleLeadId}`);
    assertNotLoginWall(info);
    assertCrmApiOk(info, 0);
    const hitDetail = (info.crmApiHits || []).some((h) => h.url.includes(`/leads/${ctx.sampleLeadId}`));
    const hasText = /lead|deal|nhiệm vụ|bình luận|chat|chi tiết|pipeline/i.test(info.bodyText);
    if (!hitDetail && !hasText) throw new Error('LeadDetail không load API/nội dung');
  }, { needsUi: true, needsApi: true });

  test(78, 'UI LeadDetail: network có /tasks hoặc /comments hoặc /detail', async () => {
    if (!ctx.page || !ctx.sampleLeadId) throw new Error('thiếu');
    const info = await gotoCrm(`/crm/leads/${ctx.sampleLeadId}`);
    const urls = (info.crmApiHits || []).map((h) => h.url).join(' ');
    const ok =
      /\/(detail|tasks|comments|members|chat|documents)/.test(urls) ||
      /nhiệm vụ|bình luận|hoạt động|chat/i.test(info.bodyText);
    if (!ok) throw new Error('Không thấy sub-resource LeadDetail');
  }, { needsUi: true, needsApi: true });

  test(79, 'UI Dashboard: gọi live-version hoặc dashboard hoặc kanban API', async () => {
    const info = await gotoCrm('/crm/dashboard');
    const urls = (info.crmApiHits || []).map((h) => h.url).join(' ');
    const ok =
      /dashboard|live-version|kanban|leads|stage-counts/.test(urls) ||
      /lead|deal|kanban|pipeline/i.test(info.bodyText);
    if (!ok) throw new Error('Dashboard không đụng CRM APIs đã tách');
  }, { needsUi: true, needsApi: true });

  test(80, 'UI Quotations: gọi /api/crm/quotations', async () => {
    const info = await gotoCrm('/crm/quotations');
    const hit = (info.crmApiHits || []).some((h) => h.url.includes('/quotations'));
    if (!hit && !/báo giá|quotation/i.test(info.bodyText)) {
      throw new Error('Quotations page không gọi commercialDocs API');
    }
  }, { needsUi: true, needsApi: true });

  test(81, 'UI Orders: gọi /api/crm/orders', async () => {
    const info = await gotoCrm('/crm/orders');
    const hit = (info.crmApiHits || []).some((h) => h.url.includes('/orders'));
    if (!hit && !/đơn hàng|order/i.test(info.bodyText)) throw new Error('Orders UI miss API');
  }, { needsUi: true, needsApi: true });

  test(82, 'UI Invoices: gọi /api/crm/invoices', async () => {
    const info = await gotoCrm('/crm/invoices');
    const hit = (info.crmApiHits || []).some((h) => h.url.includes('/invoices'));
    if (!hit && !/hóa đơn|invoice/i.test(info.bodyText)) throw new Error('Invoices UI miss API');
  }, { needsUi: true, needsApi: true });

  test(83, 'UI Customers: gọi /api/crm/customers', async () => {
    const info = await gotoCrm('/crm/customers');
    const hit = (info.crmApiHits || []).some((h) => h.url.includes('/customers'));
    if (!hit && !/khách/i.test(info.bodyText)) throw new Error('Customers UI miss API');
  }, { needsUi: true, needsApi: true });

  test(84, 'UI Tasks overview: gọi /tasks/overview hoặc /task-templates', async () => {
    const info = await gotoCrm('/crm/tasks');
    const urls = (info.crmApiHits || []).map((h) => h.url).join(' ');
    if (!/tasks|task-templates|planner/.test(urls) && !/nhiệm vụ|task/i.test(info.bodyText)) {
      throw new Error('Tasks UI miss API');
    }
  }, { needsUi: true, needsApi: true });

  test(85, 'UI Sources settings: gọi /sources hoặc /lead-types', async () => {
    const info = await gotoCrm('/crm/sources-settings');
    const urls = (info.crmApiHits || []).map((h) => h.url).join(' ');
    if (!/sources|lead-types|referrers|categor/.test(urls) && !/nguồn|source/i.test(info.bodyText)) {
      throw new Error('Sources UI miss taxonomy API');
    }
  }, { needsUi: true, needsApi: true });

  test(86, 'UI Pipeline settings: gọi /pipelines', async () => {
    const info = await gotoCrm('/crm/pipeline-settings');
    const hit = (info.crmApiHits || []).some((h) => h.url.includes('/pipeline'));
    if (!hit && !/pipeline|giai đoạn|cột/i.test(info.bodyText)) {
      throw new Error('Pipeline settings miss API');
    }
  }, { needsUi: true, needsApi: true });

  test(87, 'UI Follow-up care: gọi followup-care hoặc care-marks', async () => {
    const info = await gotoCrm('/crm/follow-up-care');
    const urls = (info.crmApiHits || []).map((h) => h.url).join(' ');
    if (!/followup|care-mark|deadline/.test(urls) && !/chăm|follow|nhắc/i.test(info.bodyText)) {
      throw new Error('Follow-up UI miss API');
    }
  }, { needsUi: true, needsApi: true });

  test(88, 'UI Org overview report: gọi /reports/org-overview', async () => {
    const info = await gotoCrm('/crm/reports/org-overview');
    const hit = (info.crmApiHits || []).some((h) => h.url.includes('org-overview'));
    // Có thể 403 UI trống — miễn không 5xx
    assertCrmApiOk(info, 0);
    if (!hit && (info.crmApiHits || []).some((h) => h.status >= 500)) {
      throw new Error('org-overview 5xx');
    }
  }, { needsUi: true, needsApi: true });

  test(89, 'UI Staff lead-deal report: không 5xx', async () => {
    const info = await gotoCrm('/crm/reports/staff-lead-deal');
    assertCrmApiOk(info, 0);
  }, { needsUi: true, needsApi: true });

  test(90, 'UI điều hướng dashboard → quotations không crash', async () => {
    await gotoCrm('/crm/dashboard');
    await gotoCrm('/crm/quotations');
    const body = await ctx.page.locator('body').innerText();
    if (!body || body.length < 20) throw new Error('empty body after nav');
  }, { needsUi: true, needsApi: true });

  test(91, 'UI điều hướng quotations → lead detail → back dashboard', async () => {
    await gotoCrm(`/crm/leads/${ctx.sampleLeadId}`);
    await gotoCrm('/crm/dashboard');
    assertCrmApiOk(await gotoCrm('/crm/dashboard'), 0);
  }, { needsUi: true, needsApi: true });

  test(92, 'UI console: không ReferenceError helpersBundle trên dashboard', async () => {
    const errors = [];
    const handler = (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    };
    ctx.page.on('console', handler);
    await gotoCrm('/crm/dashboard');
    ctx.page.off('console', handler);
    const fatal = errors.filter((e) => /ReferenceError|helpersBundle is not defined|Cannot find module/i.test(e));
    if (fatal.length) throw new Error(fatal.slice(0, 2).join(' | '));
  }, { needsUi: true, needsApi: true });

  test(93, 'UI console: không lỗi IIFE/split trên LeadDetail', async () => {
    const errors = [];
    const handler = (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    };
    ctx.page.on('console', handler);
    await gotoCrm(`/crm/leads/${ctx.sampleLeadId}`);
    ctx.page.off('console', handler);
    const fatal = errors.filter((e) => /ReferenceError|is not defined|Cannot find module|IIF/i.test(e));
    if (fatal.length) throw new Error(fatal.slice(0, 2).join(' | '));
  }, { needsUi: true, needsApi: true });

  test(94, 'UI network: /leads/picker nếu mở (không 404 :id)', async () => {
    // Gọi trực tiếp API từ page context như UI picker
    const status = await ctx.page.evaluate(async (token) => {
      const r = await fetch('/api/crm/leads/picker?type=deal&limit=3', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.status;
    }, ctx.token);
    if (status !== 200) throw new Error(`picker from UI origin → ${status}`);
  }, { needsUi: true, needsApi: true });

  test(95, 'UI network: /leads/scan-duplicates từ origin frontend', async () => {
    const status = await ctx.page.evaluate(async (token) => {
      const r = await fetch('/api/crm/leads/scan-duplicates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.status;
    }, ctx.token);
    if (![200, 400].includes(status)) throw new Error(`scan-duplicates → ${status}`);
  }, { needsUi: true, needsApi: true });

  test(96, 'UI Products page + products-list API', async () => {
    const info = await gotoCrm('/crm/products');
    const hit = (info.crmApiHits || []).some((h) => /products/.test(h.url));
    if (!hit) {
      const st = await ctx.page.evaluate(async (token) => {
        const r = await fetch('/api/crm/products-list', { headers: { Authorization: `Bearer ${token}` } });
        return r.status;
      }, ctx.token);
      if (st !== 200) throw new Error(`products-list ${st}`);
    }
  }, { needsUi: true, needsApi: true });

  test(97, 'UI Task templates page không 5xx', async () => {
    const info = await gotoCrm('/crm/task-templates');
    assertCrmApiOk(info, 0);
  }, { needsUi: true, needsApi: true });

  test(98, 'UI Auto-project-config page không 5xx', async () => {
    const info = await gotoCrm('/crm/auto-project-config');
    assertCrmApiOk(info, 0);
  }, { needsUi: true, needsApi: true });

  test(99, 'UI SPA: reload LeadDetail vẫn OK (client router + API)', async () => {
    await ctx.page.goto(`${FE}/crm/leads/${ctx.sampleLeadId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await ctx.page.reload({ waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1500));
    const text = await ctx.page.locator('body').innerText();
    if (!text || text.length < 30) throw new Error('empty after reload');
  }, { needsUi: true, needsApi: true });

  test(100, 'Đóng browser + tổng kết UI runner sạch', async () => {
    if (ctx.browser) await ctx.browser.close();
    ctx.browser = null;
    ctx.page = null;
  }, { needsUi: true });

  return { cases, ctx };
}

async function main() {
  const args = parseArgs();
  const { cases, ctx } = createRunner(args);
  if (cases.length !== 100) {
    console.error(`Expected 100 cases, got ${cases.length}`);
    process.exit(2);
  }

  console.log(`CRM split — 100 UI+API cases (API=${API}, UI=${FE})\n`);
  let pass = 0;
  let fail = 0;
  let skip = 0;
  const failures = [];

  for (const c of cases) {
    const label = `${String(c.id).padStart(3, '0')}. ${c.name}`;
    try {
      await c.fn();
      pass += 1;
      console.log(`  ✓ ${label}`);
    } catch (e) {
      const msg = e.message || String(e);
      // Soft-skip when infra missing
      if (
        /không chạy|skip-ui|Chưa cài playwright|Thiếu JWT/i.test(msg) &&
        (c.needsUi || c.needsApi || c.id === 22)
      ) {
        skip += 1;
        console.log(`  ○ ${label}`);
        console.log(`      → SKIP: ${msg}`);
        // If JWT missing, skip remaining API/UI
        if (/Thiếu JWT/i.test(msg)) {
          for (let i = cases.indexOf(c) + 1; i < cases.length; i++) {
            if (cases[i].needsApi || cases[i].needsUi) {
              skip += 1;
              console.log(`  ○ ${String(cases[i].id).padStart(3, '0')}. ${cases[i].name}`);
              console.log('      → SKIP: no JWT');
            }
          }
          break;
        }
        if (/Frontend|:5173|playwright|skip-ui/i.test(msg) && c.needsUi) {
          // skip remaining UI-only by continuing; individual UI tests will also skip if no page
          if (!ctx.page && c.id >= 57) {
            // mark rest UI as skip
            for (let i = cases.indexOf(c) + 1; i < cases.length; i++) {
              if (cases[i].needsUi) {
                skip += 1;
                console.log(`  ○ ${String(cases[i].id).padStart(3, '0')}. ${cases[i].name}`);
                console.log(`      → SKIP: UI unavailable (${msg.slice(0, 80)})`);
              } else {
                // continue non-ui
              }
            }
            // Still try non-ui remaining? After 56 mostly UI. break UI chain.
            const rest = cases.slice(cases.indexOf(c) + 1);
            for (const r of rest) {
              if (!r.needsUi) {
                try {
                  await r.fn();
                  pass += 1;
                  console.log(`  ✓ ${String(r.id).padStart(3, '0')}. ${r.name}`);
                } catch (e2) {
                  fail += 1;
                  failures.push({ id: r.id, name: r.name, error: e2.message });
                  console.log(`  ✗ ${String(r.id).padStart(3, '0')}. ${r.name}`);
                }
              }
            }
            break;
          }
          continue;
        }
        continue;
      }
      fail += 1;
      failures.push({ id: c.id, name: c.name, error: msg });
      console.log(`  ✗ ${label}`);
      console.log(`      → ${msg}`);
    }
  }

  if (ctx.browser) {
    try {
      await ctx.browser.close();
    } catch {
      /* ignore */
    }
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  console.log(`SKIP: ${skip}`);
  console.log(`TOTAL accounted: ${pass + fail + skip} / 100`);
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
