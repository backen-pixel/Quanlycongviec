const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'src', 'routes', 'crm', 'routes');
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  // Route files are at crm/routes/ — same depth as shared; handlers may still say ../../
  s = s.replace(/require\((['"])\.\.\/\.\.\//g, 'require($1../../../');
  if (s !== before) {
    fs.writeFileSync(p, s);
    console.log('fixed', f);
  }
}
console.log('done');
