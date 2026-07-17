const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'src', 'routes', 'crm', 'shared', 'helpersBundle.js');
let s = fs.readFileSync(p, 'utf8');
// shared/ is one level deeper than crm/ — ../../X → ../../../X
s = s.replace(/require\((['"])\.\.\/\.\.\//g, 'require($1../../../');
fs.writeFileSync(p, s);
console.log('fixed', p);
console.log(s.match(/require\(['"][^'"]+['"]\)/g).slice(0, 8));
