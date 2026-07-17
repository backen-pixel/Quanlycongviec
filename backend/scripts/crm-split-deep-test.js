/**
 * Deep regression check: split CRM vs core.js.bak + live HTTP smoke.
 *
 * Usage:
 *   node scripts/crm-split-deep-test.js
 *   node scripts/crm-split-deep-test.js --token <JWT>
 *   node scripts/crm-split-deep-test.js --email x --password y
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const BAK = path.join(ROOT, 'src', 'routes', 'crm', 'core.js.bak');
const BASE = process.env.CRM_TEST_BASE || 'http://localhost:4000';

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

function extractRoutes(text) {
  const re = /\br\.(get|post|put|patch|delete)\(\s*(['"])([^'"]+)\2/g;
  const routes = [];
  let m;
  while ((m = re.exec(text))) {
    routes.push({ method: m[1].toUpperCase(), path: m[3] });
  }
  return routes;
}

function key(r) {
  return `${r.method} ${r.path}`;
}

function collectLiveRoutes(router, prefix = '') {
  const out = [];
  for (const layer of router.stack || []) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        out.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      // nested router — Express mount path is in layer.regexp
      out.push(...collectLiveRoutes(layer.handle, prefix));
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
          resolve({ status: res.statusCode, json, raw: raw.slice(0, 300), headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function assertOrder(liveKeys, earlier, later, label) {
  const iA = liveKeys.indexOf(earlier);
  const iB = liveKeys.indexOf(later);
  if (iA < 0 || iB < 0) return { ok: false, label, detail: `missing ${earlier} or ${later}` };
  return { ok: iA < iB, label, detail: `${earlier} @${iA} vs ${later} @${iB}` };
}

async function main() {
  const args = parseArgs();
  const results = { pass: [], fail: [], warn: [] };
  const ok = (m) => results.pass.push(m);
  const fail = (m) => results.fail.push(m);
  const warn = (m) => results.warn.push(m);

  console.log('=== A. Registry: bak vs live split ===');
  if (!fs.existsSync(BAK)) {
    fail('core.js.bak missing — cannot compare to pre-split');
  } else {
    const bakRoutes = extractRoutes(fs.readFileSync(BAK, 'utf8'));
    const bakSet = new Set(bakRoutes.map(key));

    // Clear require cache for fresh load
    const crmPath = require.resolve('../src/routes/crm');
    delete require.cache[crmPath];
    const crm = require('../src/routes/crm');
    const liveRoutes = collectLiveRoutes(crm);
    const liveSet = new Set(liveRoutes.map(key));

    const missing = [...bakSet].filter((k) => !liveSet.has(k)).sort();
    const extra = [...liveSet].filter((k) => !bakSet.has(k)).sort();

    console.log(`bak=${bakSet.size} live=${liveSet.size}`);
    if (missing.length) {
      fail(`Missing vs bak (${missing.length}): ${missing.slice(0, 15).join(', ')}${missing.length > 15 ? '…' : ''}`);
    } else ok(`All ${bakSet.size} bak routes present in live router`);
    if (extra.length) {
      warn(`Extra vs bak (${extra.length}): ${extra.slice(0, 10).join(', ')}`);
    } else ok('No unexpected extra routes');

    // Export contract
    if (typeof crm.computeOrgOverviewReportData === 'function') {
      ok('computeOrgOverviewReportData export present');
    } else fail('computeOrgOverviewReportData missing');

    // Parent middleware
    const mw = parentMiddlewareNames(crm);
    console.log('parent middleware:', mw.join(' → '));
    if (mw.length >= 3) ok(`Parent has ${mw.length} middleware layers before/with routers`);
    else fail(`Expected ≥3 parent middleware, got ${mw.length}`);

    // Nested router count
    const nested = (crm.stack || []).filter((l) => l.name === 'router').length;
    if (nested === 14) ok('14 feature routers mounted');
    else warn(`Expected 14 feature routers, got ${nested}`);

    // Static before :id — check within flattened order of registration across mounts.
    // Express matches parent stack order: leadsList mounts before leadLifecycle.
    const idxSrc = fs.readFileSync(path.join(ROOT, 'src/routes/crm/index.js'), 'utf8');
    const orderChecks = [
      ['leadsList', 'leadLifecycle'],
      ['leadDuplicates', 'leadLifecycle'],
      ['taxonomy', 'leadLifecycle'],
    ];
    for (const [a, b] of orderChecks) {
      const ia = idxSrc.indexOf(`r.use(${a})`);
      const ib = idxSrc.indexOf(`r.use(${b})`);
      if (ia >= 0 && ib >= 0 && ia < ib) ok(`Mount order: ${a} before ${b}`);
      else fail(`Mount order broken: ${a} before ${b}`);
    }

    // Module-level: picker registered in leadsList, :id in lifecycle
    const leadsList = require('../src/routes/crm/routes/leadsList');
    const lifecycle = require('../src/routes/crm/routes/leadLifecycle');
    const llPaths = collectLiveRoutes(leadsList).map(key);
    const lcPaths = collectLiveRoutes(lifecycle).map(key);
    if (llPaths.includes('GET /leads/picker')) ok('GET /leads/picker in leadsList');
    else fail('GET /leads/picker missing from leadsList');
    if (lcPaths.some((k) => k.startsWith('GET /leads/:id'))) ok('GET /leads/:id* in leadLifecycle');
    else fail('GET /leads/:id missing from leadLifecycle');
    if (llPaths.includes('GET /leads') && !llPaths.includes('POST /leads')) {
      ok('GET /leads in list; POST /leads not in list module');
    }
    if (lcPaths.includes('POST /leads')) ok('POST /leads in leadLifecycle');
  }

  console.log('\n=== B. Helpers / facades ===');
  const helpers = require('../src/routes/crm/shared/helpersBundle');
  const needed = [
    'userIsAdmin',
    'nextCode',
    'supabase',
    'computeOrgOverviewReportData',
    'onLeadWon',
    'createProjectFromLead',
    'emitCrmDashboardChanged',
    'enforceCommercialDocCompanyOnWrite',
    'fetchPipelineWithStagesById',
  ];
  for (const n of needed) {
    if (helpers[n] == null) fail(`helpersBundle.${n} is null/undefined`);
    else ok(`helpersBundle.${n} = ${typeof helpers[n]}`);
  }
  const facades = ['requestScope', 'pipelineHelpers', 'realtimeCache', 'reportHelpers', 'leadsListHelpers'];
  for (const f of facades) {
    const mod = require(`../src/routes/crm/shared/${f}`);
    const keys = Object.keys(mod);
    if (keys.length && keys.every((k) => typeof mod[k] === 'function' || mod[k] != null)) {
      ok(`facade ${f}: ${keys.length} exports`);
    } else fail(`facade ${f} broken`);
  }

  console.log('\n=== C. Live HTTP smoke ===');
  let token = args.token || process.env.CRM_TEST_TOKEN || '';
  if (!token && (args.email || process.env.CRM_TEST_EMAIL)) {
    const email = args.email || process.env.CRM_TEST_EMAIL;
    const password = args.password || process.env.CRM_TEST_PASSWORD;
    const login = await request('POST', '/api/auth/login', { body: { email, password } });
    if (login.status === 200 && login.json?.token) {
      token = login.json.token;
      ok(`Login OK as ${email}`);
    } else {
      fail(`Login failed ${login.status}: ${login.raw}`);
    }
  }

  // Unauth should 401
  const unauth = await request('GET', '/api/crm/_version');
  if (unauth.status === 401 || unauth.status === 403) ok(`Unauth /_version → ${unauth.status}`);
  else warn(`Unauth /_version → ${unauth.status} (expected 401/403)`);

  if (!token) {
    warn('No JWT — skip authenticated HTTP (pass --token or --email/--password)');
  } else {
    const cases = [
      ['GET', '/api/crm/_version', (r) => r.status === 200 && r.json?.ok === true],
      ['GET', '/api/crm/pipelines', (r) => r.status === 200 && (Array.isArray(r.json) || Array.isArray(r.json?.data) || r.json != null)],
      ['GET', '/api/crm/lead-types', (r) => r.status === 200],
      ['GET', '/api/crm/sources', (r) => r.status === 200],
      ['GET', '/api/crm/leads/picker?type=deal&limit=5', (r) => r.status === 200],
      ['GET', '/api/crm/leads?limit=5&type=deal', (r) => r.status === 200],
      ['GET', '/api/crm/dashboard?type=lead&light=1', (r) => r.status === 200],
      ['GET', '/api/crm/live-version', (r) => r.status === 200 || r.status === 304],
      ['GET', '/api/crm/stage-counts', (r) => r.status === 200 || r.status === 400],
      ['GET', '/api/crm/quotations?limit=5', (r) => r.status === 200 || r.status === 400],
      ['GET', '/api/crm/task-templates', (r) => r.status === 200],
      ['GET', '/api/crm/customers?limit=5', (r) => r.status === 200 || r.status === 400],
      // company_id bắt buộc — 400 khi thiếu là đúng contract cũ
      ['GET', '/api/crm/company-regions', (r) => r.status === 400 && /company_id/i.test(r.raw || '')],
      ['GET', '/api/crm/followup-care/notifications', (r) => r.status === 200 || r.status === 400],
      ['GET', '/api/crm/settings/deadline-config', (r) => r.status === 200 || r.status === 403],
      ['GET', '/api/crm/kanban-bootstrap?type=lead', (r) => r.status === 200],
      ['GET', '/api/crm/leads/scan-duplicates', (r) => r.status === 200 || r.status === 400],
      ['GET', '/api/crm/task-templates', (r) => r.status === 200],
      ['GET', '/api/crm/planner/me', (r) => r.status === 200],
      ['GET', '/api/crm/products-list', (r) => r.status === 200],
    ];

    let sampleLeadId = null;
    for (const [method, urlPath, pred] of cases) {
      const r = await request(method, urlPath, { token });
      const good = pred(r);
      const line = `${method} ${urlPath} → ${r.status}`;
      if (good) ok(line);
      else fail(`${line} body=${r.raw}`);
      if (urlPath.startsWith('/api/crm/leads?') && r.status === 200) {
        const rows = Array.isArray(r.json) ? r.json : r.json?.data || r.json?.leads || [];
        if (rows[0]?.id) sampleLeadId = rows[0].id;
      }
    }

    // Resolve a lead id if list shape differs
    if (!sampleLeadId) {
      const r = await request('GET', '/api/crm/leads?limit=1', { token });
      const rows = Array.isArray(r.json)
        ? r.json
        : r.json?.data || r.json?.items || r.json?.leads || r.json?.rows || [];
      if (rows[0]?.id) sampleLeadId = rows[0].id;
      // sometimes returns { leads: [...] }
      if (!sampleLeadId && r.json && typeof r.json === 'object') {
        for (const v of Object.values(r.json)) {
          if (Array.isArray(v) && v[0]?.id) {
            sampleLeadId = v[0].id;
            break;
          }
        }
      }
    }

    if (sampleLeadId) {
      ok(`Sample lead id ${sampleLeadId}`);
      const detailCases = [
        ['GET', `/api/crm/leads/${sampleLeadId}`],
        ['GET', `/api/crm/leads/${sampleLeadId}/detail`],
        ['GET', `/api/crm/leads/${sampleLeadId}/tasks`],
        ['GET', `/api/crm/leads/${sampleLeadId}/comments`],
        ['GET', `/api/crm/leads/${sampleLeadId}/members`],
        ['GET', `/api/crm/leads/${sampleLeadId}/activities`],
      ];
      for (const [method, urlPath] of detailCases) {
        const r = await request(method, urlPath, { token });
        // 200 ok, 403 assignee gate still works, 404 missing
        if ([200, 403, 404].includes(r.status)) ok(`${method} ${urlPath} → ${r.status}`);
        else fail(`${method} ${urlPath} → ${r.status} ${r.raw}`);
      }

      // Critical: /leads/picker must NOT be captured as :id
      const picker = await request('GET', '/api/crm/leads/picker?limit=3', { token });
      if (picker.status === 200) {
        ok('GET /leads/picker not shadowed by :id');
      } else if (picker.status === 400) {
        ok('GET /leads/picker reached handler (400 validation)');
      } else if (picker.status === 404 && /không tìm thấy|not found/i.test(picker.raw || '')) {
        fail('GET /leads/picker shadowed by /leads/:id (got lead-not-found style 404)');
      } else {
        warn(`GET /leads/picker → ${picker.status} ${picker.raw}`);
      }
    } else {
      warn('No sample lead id — skip detail/shadow checks');
    }

    // Reports (heavier)
    const report = await request('GET', '/api/crm/reports/org-overview?date_from=2026-01-01&date_to=2026-07-16', {
      token,
    });
    if ([200, 403, 400].includes(report.status)) ok(`GET org-overview → ${report.status}`);
    else fail(`GET org-overview → ${report.status} ${report.raw}`);

    // computeOrgOverviewReportData callable
    try {
      const crm = require('../src/routes/crm');
      const mockReq = {
        user: { userId: '00000000-0000-0000-0000-000000000001', role: 'admin', company_id: null },
        query: { date_from: '2026-01-01', date_to: '2026-01-02' },
        headers: {},
      };
      let statusCode = 200;
      let body = null;
      const mockRes = {
        status(c) {
          statusCode = c;
          return this;
        },
        json(b) {
          body = b;
          return this;
        },
      };
      const data = await crm.computeOrgOverviewReportData(mockReq, mockRes);
      if (data || statusCode === 403 || statusCode === 400) {
        ok(`computeOrgOverviewReportData callable (status=${statusCode}, hasData=${!!data})`);
      } else {
        warn(`computeOrgOverviewReportData returned empty status=${statusCode}`);
      }
    } catch (e) {
      fail(`computeOrgOverviewReportData threw: ${e.message}`);
    }
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`PASS: ${results.pass.length}`);
  console.log(`FAIL: ${results.fail.length}`);
  console.log(`WARN: ${results.warn.length}`);
  if (results.fail.length) {
    console.log('\nFAILURES:');
    results.fail.forEach((m) => console.log('  ✗', m));
  }
  if (results.warn.length) {
    console.log('\nWARNINGS:');
    results.warn.forEach((m) => console.log('  !', m));
  }
  process.exit(results.fail.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
