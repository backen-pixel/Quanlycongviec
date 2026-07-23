/**
 * Regenerable CRM route inventory + pre/post-split parity report.
 *
 * Usage:
 *   node scripts/crm-route-inventory.js
 *   node scripts/crm-route-inventory.js --write
 *
 * Writes (with --write):
 *   src/routes/crm/route-manifest.presplit.json
 *   src/routes/crm/route-manifest.runtime.json
 *   src/routes/crm/route-manifest.json          (runtime, canonical)
 *   src/routes/crm/route-parity-report.json
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CRM = path.join(ROOT, 'src/routes/crm');
const PRE_SPLIT_COMMIT = '13840874571d12ea5d7c2eb100f28bb5419bf638';
const SPLIT_COMMIT = '3290fc613ce81b278991352a2d947ccaae933587';

const INTENTIONAL_POST_SPLIT = [
  { method: 'GET', path: '/production-companies', reason: 'visibleProduction — CRM SX allowlist', file: 'routes/visibleProduction.js' },
  { method: 'GET', path: '/companies/:companyId/visible-production-companies', reason: 'visibleProduction', file: 'routes/visibleProduction.js' },
  { method: 'PUT', path: '/companies/:companyId/visible-production-companies', reason: 'visibleProduction', file: 'routes/visibleProduction.js' },
  { method: 'PATCH', path: '/leads/:id/vc-booking', reason: 'vcBooking — logistics booking on deal', file: 'routes/vcBooking.js' },
  { method: 'POST', path: '/leads/:id/transfer-region', reason: 'Post-split product: chuyển khu vực lead/deal', file: 'routes/leadLifecycle.js' },
  { method: 'POST', path: '/deals/:id/reassign-sx', reason: 'Post-split product: gán lại công ty SX', file: 'routes/leadLifecycle.js' },
];

function extractRoutesFromSource(text, fileLabel) {
  const re = /\br\.(get|post|put|patch|delete)\(\s*(['"])([^'"]+)\2/g;
  const routes = [];
  let m;
  while ((m = re.exec(text))) {
    const method = m[1].toUpperCase();
    const routePath = m[3];
    const before = text.slice(Math.max(0, m.index - 200), m.index);
    const markers = [];
    if (/requirePermission\s*\(/.test(before) || /requirePermission\(/.test(text.slice(m.index, m.index + 120))) {
      markers.push('requirePermission');
    }
    if (/excelUpload|multer|Upload\.single|Upload\.array/.test(text.slice(m.index, m.index + 180))) {
      markers.push('upload');
    }
    if (/auth\b/.test(before)) markers.push('auth_inline');
    routes.push({ method, path: routePath, file: fileLabel, middleware: markers });
  }
  return routes;
}

function routeKey(r) {
  return `${r.method} ${r.path}`;
}

function checksum(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

function buildManifest(routes, meta = {}) {
  const sorted = [...routes].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method) || String(a.file).localeCompare(String(b.file)),
  );
  const by_file = {};
  for (const r of sorted) {
    const f = r.file || 'unknown';
    by_file[f] = (by_file[f] || 0) + 1;
  }
  const body = {
    generated_at: new Date().toISOString(),
    total_routes: sorted.length,
    by_file,
    routes: sorted,
    ...meta,
  };
  body.checksum = checksum({ total_routes: body.total_routes, routes: body.routes.map((r) => ({ method: r.method, path: r.path, file: r.file })) });
  return body;
}

function collectLiveRoutes(router, fileHint = 'runtime') {
  const out = [];
  for (const layer of router.stack || []) {
    if (layer.route) {
      const markers = (layer.route.stack || [])
        .map((l) => l.name || l.handle?.name || '')
        .filter((n) => n && n !== '<anonymous>' && n !== 'bound dispatch');
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        out.push({
          method: method.toUpperCase(),
          path: layer.route.path,
          file: fileHint,
          middleware: markers,
        });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      out.push(...collectLiveRoutes(layer.handle, fileHint));
    }
  }
  return out;
}

function collectRuntimeWithFiles() {
  const routesDir = path.join(CRM, 'routes');
  const files = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'));
  const fromSource = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(routesDir, f), 'utf8');
    fromSource.push(...extractRoutesFromSource(src, `routes/${f}`));
  }

  // Live Express stack for ground truth count + middleware names
  const crmPath = require.resolve('../src/routes/crm');
  delete require.cache[crmPath];
  // clear nested caches lightly
  for (const k of Object.keys(require.cache)) {
    if (k.includes(`${path.sep}routes${path.sep}crm${path.sep}`)) delete require.cache[k];
  }
  const crm = require('../src/routes/crm');
  const live = collectLiveRoutes(crm, 'runtime');

  // Merge: prefer source file attribution; keep live middleware when paths match
  const liveByKey = new Map();
  for (const r of live) {
    const k = routeKey(r);
    if (!liveByKey.has(k)) liveByKey.set(k, r);
  }
  const merged = fromSource.map((r) => {
    const liveR = liveByKey.get(routeKey(r));
    return {
      ...r,
      middleware: [...new Set([...(r.middleware || []), ...((liveR && liveR.middleware) || [])])],
    };
  });

  // Live-only routes (shouldn't happen if source scan complete)
  for (const [k, r] of liveByKey) {
    if (!merged.some((m) => routeKey(m) === k)) {
      merged.push({ ...r, file: r.file || 'runtime-only', note: 'present in Express stack but missing source scan' });
    }
  }

  const parentMw = (crm.stack || [])
    .filter((l) => !l.route && l.name !== 'router')
    .map((l) => l.name || l.handle?.name || 'anonymous');
  const nested = (crm.stack || []).filter((l) => l.name === 'router').length;

  return { merged, liveCount: new Set(live.map(routeKey)).size, parentMw, nestedRouters: nested };
}

function loadPresplitFromGit() {
  const src = execSync(`git show ${PRE_SPLIT_COMMIT}:backend/src/routes/crm.js`, {
    encoding: 'utf8',
    maxBuffer: 80 * 1024 * 1024,
    cwd: path.join(ROOT, '..'),
  });
  return extractRoutesFromSource(src, 'crm.js@presplit');
}

function reconcile(presplit, runtime) {
  const preSet = new Map(presplit.map((r) => [routeKey(r), r]));
  const runSet = new Map(runtime.map((r) => [routeKey(r), r]));
  const intentionalKeys = new Set(INTENTIONAL_POST_SPLIT.map(routeKey));

  const missing = [];
  const extra = [];
  const same = [];

  for (const [k, r] of preSet) {
    if (runSet.has(k)) same.push({ ...r, decision: 'keep' });
    else {
      missing.push({
        method: r.method,
        path: r.path,
        file: r.file,
        existed_before_split: true,
        duplicate_mount: false,
        decision: 'investigate_missing — endpoint thiếu ngoài chủ ý',
      });
    }
  }

  for (const [k, r] of runSet) {
    if (preSet.has(k)) continue;
    const intentional = INTENTIONAL_POST_SPLIT.find((x) => routeKey(x) === k);
    const dups = runtime.filter((x) => routeKey(x) === k);
    extra.push({
      method: r.method,
      path: r.path,
      file: intentional?.file || r.file,
      existed_before_split: false,
      duplicate_mount: dups.length > 1,
      intentional: !!intentional,
      reason: intentional?.reason || null,
      decision: intentional
        ? 'accept_intentional_post_split'
        : 'investigate_extra — endpoint thêm ngoài chủ ý',
    });
  }

  // Stale manifest diagnostics (224/225/229)
  let stale = null;
  const stalePath = path.join(CRM, 'route-manifest.json');
  if (fs.existsSync(stalePath)) {
    try {
      const old = JSON.parse(fs.readFileSync(stalePath, 'utf8'));
      const arrLen = Array.isArray(old.routes) ? old.routes.length : 0;
      const bySum = old.by_file ? Object.values(old.by_file).reduce((a, b) => a + b, 0) : 0;
      stale = {
        note: 'Previous route-manifest.json internals (before this regeneration)',
        total_routes_field: old.total_routes,
        routes_array_length: arrLen,
        by_file_sum: bySum,
        explanation: [
          `total_routes=${old.total_routes} matched pre-split Git baseline (${presplit.length}) but was not regenerated after post-split routers.`,
          `routes[] length ${arrLen} vs by_file sum ${bySum}: leadLifecycle under-counted in by_file (off-by-one bookkeeping).`,
          `runtime=${runtime.length}: pre-split ${presplit.length} + intentional extras ${INTENTIONAL_POST_SPLIT.length} (+ any other drift listed in extra).`,
        ],
      };
    } catch (_) { /* ignore */ }
  }

  return {
    presplit_commit: PRE_SPLIT_COMMIT,
    split_commit: SPLIT_COMMIT,
    counts: {
      presplit: preSet.size,
      runtime: runSet.size,
      missing: missing.length,
      extra: extra.length,
      intentional_extra: extra.filter((e) => e.intentional).length,
      unexpected_extra: extra.filter((e) => !e.intentional).length,
    },
    missing,
    extra,
    intentional_allowlist: INTENTIONAL_POST_SPLIT,
    stale_manifest_reconciliation: stale,
    visibleProduction: {
      conclusion: 'Intentional post-split feature router (3 endpoints). Not a duplicate of pre-split routes. Must appear in runtime manifest; parity tests should allowlist these keys.',
      routes: INTENTIONAL_POST_SPLIT.filter((r) => r.file.includes('visibleProduction')),
    },
  };
}

function main() {
  const write = process.argv.includes('--write');
  const presplitRoutes = loadPresplitFromGit();
  const { merged, liveCount, parentMw, nestedRouters } = collectRuntimeWithFiles();

  const preManifest = buildManifest(presplitRoutes, {
    source: 'git',
    git_commit: PRE_SPLIT_COMMIT,
    label: 'presplit',
  });
  const runManifest = buildManifest(merged, {
    source: 'runtime+source',
    label: 'postsplit_runtime',
    live_unique_count: liveCount,
    parent_middleware: parentMw,
    nested_routers: nestedRouters,
  });
  const report = reconcile(presplitRoutes, merged);
  report.runtime_meta = { liveCount, parentMw, nestedRouters };
  report.checksums = { presplit: preManifest.checksum, runtime: runManifest.checksum };

  console.log(JSON.stringify({
    presplit: preManifest.total_routes,
    runtime: runManifest.total_routes,
    live_unique: liveCount,
    nested_routers: nestedRouters,
    missing: report.counts.missing,
    unexpected_extra: report.counts.unexpected_extra,
    intentional_extra: report.counts.intentional_extra,
    checksums: report.checksums,
  }, null, 2));

  if (write) {
    fs.writeFileSync(path.join(CRM, 'route-manifest.presplit.json'), JSON.stringify(preManifest, null, 2));
    fs.writeFileSync(path.join(CRM, 'route-manifest.runtime.json'), JSON.stringify(runManifest, null, 2));
    fs.writeFileSync(path.join(CRM, 'route-manifest.json'), JSON.stringify(runManifest, null, 2));
    fs.writeFileSync(path.join(CRM, 'route-parity-report.json'), JSON.stringify(report, null, 2));
    console.log('wrote manifests + route-parity-report.json');
  }

  if (report.counts.missing > 0 || report.counts.unexpected_extra > 0) {
    process.exitCode = 2;
  }
}

main();
