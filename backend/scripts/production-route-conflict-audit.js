/**
 * Soi xung đột route của module Sản xuất / Vận chuyển.
 *
 * Chạy: node scripts/production-route-conflict-audit.js
 *
 * Phát hiện:
 *  1. Trùng exact method+path trong cùng router → handler khai báo sau KHÔNG BAO GIỜ chạy.
 *  2. Route static bị route param khai báo TRƯỚC nuốt (vd. /projects/summary sau /projects/:id).
 *  3. Trùng path giữa các router mount cùng prefix.
 * Chỉ đọc, không gọi API.
 */

const ROUTERS = [
  ['/api/projects', '../src/routes/projects'],
  ['/api/tasks', '../src/routes/tasks'],
  ['/api/stages', '../src/routes/stages'],
  ['/api/vc-handover', '../src/routes/vcHandover'],
  ['/api/production', '../src/routes/production'],
  ['/api/logistics', '../src/routes/logistics'],
  ['/api/workshop', '../src/routes/workshopTypes'],
  ['/api/workshop-teams', '../src/routes/workshopTeams'],
];

const c = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
const head = (m) => console.log(`\n${c.b}${m}${c.x}`);

/** Thu route theo đúng thứ tự khai báo, đi sâu vào router lồng. */
function collectRoutes(layerStack, prefix = '', out = []) {
  for (const layer of layerStack || []) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods || {}).filter((m) => m !== '_all');
      for (const m of methods) {
        out.push({ method: m.toUpperCase(), path: prefix + layer.route.path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      collectRoutes(layer.handle.stack, prefix, out);
    }
  }
  return out;
}

/** Pattern route → regex để xem nó có nuốt path khác không. */
function pathToRegex(p) {
  const src = String(p)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/:([A-Za-z0-9_]+)\\?\?/g, '[^/]*')
    .replace(/:([A-Za-z0-9_]+)/g, '[^/]+')
    .replace(/\*/g, '.*');
  return new RegExp(`^${src}$`);
}
const isStatic = (p) => !p.includes(':') && !p.includes('*');

let problems = 0;
const allByPrefix = new Map();

for (const [prefix, mod] of ROUTERS) {
  let router;
  try {
    router = require(mod);
  } catch (e) {
    console.log(`${c.r}LOAD FAIL${c.x} ${mod}: ${e.message.split('\n')[0]}`);
    problems += 1;
    continue;
  }
  const routes = collectRoutes(router.stack);
  allByPrefix.set(prefix, routes);

  head(`${prefix}  (${mod.replace('../src/routes/', '')}) — ${routes.length} route`);

  // 1. Trùng exact
  const seen = new Map();
  const dupes = [];
  routes.forEach((r, i) => {
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) dupes.push({ key, first: seen.get(key), second: i });
    else seen.set(key, i);
  });
  if (dupes.length) {
    problems += dupes.length;
    for (const d of dupes) {
      console.log(`  ${c.r}TRÙNG${c.x} ${d.key} — khai báo #${d.first + 1} chạy, #${d.second + 1} là code chết`);
    }
  } else {
    console.log(`  ${c.g}OK${c.x} không có method+path trùng`);
  }

  // 2. Static bị param khai báo trước nuốt
  const shadowed = [];
  routes.forEach((r, i) => {
    if (!isStatic(r.path)) return;
    for (let j = 0; j < i; j += 1) {
      const earlier = routes[j];
      if (earlier.method !== r.method || isStatic(earlier.path)) continue;
      if (pathToRegex(earlier.path).test(r.path)) {
        shadowed.push({ dead: r, by: earlier, deadIdx: i, byIdx: j });
        break;
      }
    }
  });
  if (shadowed.length) {
    problems += shadowed.length;
    for (const s of shadowed) {
      console.log(`  ${c.r}BỊ NUỐT${c.x} ${s.dead.method} ${s.dead.path} (#${s.deadIdx + 1}) — bị ${s.by.method} ${s.by.path} (#${s.byIdx + 1}) khớp trước`);
    }
  } else {
    console.log(`  ${c.g}OK${c.x} không có route static bị :param nuốt`);
  }
}

head('TRÙNG PATH GIỮA CÁC ROUTER CÙNG PREFIX');
const byFullPath = new Map();
for (const [prefix, routes] of allByPrefix) {
  for (const r of routes) {
    const key = `${r.method} ${prefix}${r.path}`;
    if (!byFullPath.has(key)) byFullPath.set(key, []);
    byFullPath.get(key).push(prefix);
  }
}
const crossDupes = [...byFullPath.entries()].filter(([, v]) => v.length > 1);
if (crossDupes.length) {
  problems += crossDupes.length;
  crossDupes.forEach(([k, v]) => console.log(`  ${c.r}TRÙNG${c.x} ${k} × ${v.length}`));
} else {
  console.log(`  ${c.g}OK${c.x} không có full path trùng giữa các router`);
}

head('TỔNG KẾT');
const total = [...allByPrefix.values()].reduce((s, v) => s + v.length, 0);
console.log(`  ${total} route · ${problems ? `${c.r}${problems} vấn đề${c.x}` : `${c.g}0 vấn đề${c.x}`}`);
process.exit(0);
