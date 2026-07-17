const fs = require('fs');
const path = require('path');
const CRM = path.join(__dirname, '../src/routes/crm');

const bak = fs.readFileSync(path.join(CRM, 'core.js.bak'), 'utf8');
const re = /\br\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
function extract(text) {
  const s = new Set();
  let m;
  while ((m = re.exec(text))) s.add(m[1].toUpperCase() + ' ' + m[2]);
  return s;
}
const bakSet = extract(bak);
const crm = require('../src/routes/crm');
function collect(r, out = new Set()) {
  for (const l of r.stack || []) {
    if (l.route) {
      for (const method of Object.keys(l.route.methods)) {
        if (method !== '_all') out.add(method.toUpperCase() + ' ' + l.route.path);
      }
    } else if (l.name === 'router' && l.handle) collect(l.handle, out);
  }
  return out;
}
const live = collect(crm);
const missing = [...bakSet].filter((k) => !live.has(k));
const extra = [...live].filter((k) => !bakSet.has(k));
const h = require('../src/routes/crm/shared/helpersBundle');
const undef = Object.keys(h).filter((n) => h[n] === undefined);
console.log(
  JSON.stringify(
    {
      bak: bakSet.size,
      live: live.size,
      missingCount: missing.length,
      missing: missing.slice(0, 15),
      extraCount: extra.length,
      extra: extra.slice(0, 15),
      helpers: Object.keys(h).length,
      undefCount: undef.length,
      undef: undef.slice(0, 20),
      computeOrg: typeof crm.computeOrgOverviewReportData,
      handle: typeof crm.handle,
      nested: (crm.stack || []).filter((l) => l.name === 'router').length,
    },
    null,
    2,
  ),
);
// check mutable flags in helpersBundle
const src = fs.readFileSync(path.join(CRM, 'shared/helpersBundle.js'), 'utf8');
for (const name of ['_vcPipelineStageAvailable', '_crmLeadSelectMigrationChecked', '_crmLeadTypeColorAvailable']) {
  const decl = (src.match(new RegExp('(?:let|var)\\s+' + name + '\\s*=\\s*[^;\\n]+')) || [])[0];
  console.log('decl', decl || name + ' not found as let/var');
}
