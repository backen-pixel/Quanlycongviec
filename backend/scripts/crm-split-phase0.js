/**
 * Phase 0: move crm.js → crm/core.js (fix requires), create index + thin wrapper + manifest.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROUTES = path.join(ROOT, 'src', 'routes');
const CRM_DIR = path.join(ROUTES, 'crm');
const SRC = path.join(ROUTES, 'crm.js');

const src = fs.readFileSync(SRC, 'utf8');

// Fix relative requires: ../X → ../../X (one level deeper under routes/crm/)
function fixRequires(code) {
  return code
    .replace(/require\((['"])\.\.\/(middleware|config|helpers|services|utils|lib)\//g, 'require($1../../$2/')
    .replace(/require\((['"])\.\.\/(middleware|config|helpers|services|utils|lib)(['"])\)/g, 'require($1../../$2$3)');
}

const coreCode = fixRequires(src);

// Remove stale split artifacts (will be regenerated in later phases)
const staleDirs = [
  path.join(CRM_DIR, 'routes'),
  path.join(CRM_DIR, 'shared'),
];
for (const d of staleDirs) {
  if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
}

fs.mkdirSync(CRM_DIR, { recursive: true });
fs.mkdirSync(path.join(CRM_DIR, 'routes'), { recursive: true });
fs.mkdirSync(path.join(CRM_DIR, 'shared'), { recursive: true });

fs.writeFileSync(path.join(CRM_DIR, 'core.js'), coreCode);

const indexCode = `/**
 * CRM composition root.
 * Parent middleware + sub-routers live here; Phase 0 mounts core monolith.
 */
module.exports = require('./core');
`;
fs.writeFileSync(path.join(CRM_DIR, 'index.js'), indexCode);

// Thin wrapper — Node resolves require('./routes/crm') to crm.js first
fs.writeFileSync(SRC, `/** Thin re-export — CRM routes live in ./crm/ */
module.exports = require('./crm');
`);

// Manifest
const re = /r\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
const routes = [];
let m;
while ((m = re.exec(coreCode))) {
  routes.push({ method: m[1].toUpperCase(), path: m[2], file: 'core.js' });
}
routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const byFile = {};
for (const r of routes) byFile[r.file] = (byFile[r.file] || 0) + 1;
const manifest = {
  generated_at: new Date().toISOString(),
  total_routes: routes.length,
  by_file: byFile,
  routes,
};
fs.writeFileSync(path.join(CRM_DIR, 'route-manifest.json'), JSON.stringify(manifest, null, 2));

console.log('Phase 0 done:', {
  routes: routes.length,
  coreBytes: coreCode.length,
  wrapper: fs.readFileSync(SRC, 'utf8').trim(),
});
