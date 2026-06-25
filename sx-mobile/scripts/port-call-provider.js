const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'crm-mobile-v2', 'src', 'calling', 'CallProvider.tsx');
const dest = path.join(__dirname, '..', 'src', 'calling', 'CallProvider.tsx');
let t = fs.readFileSync(src, 'utf8');
fs.writeFileSync(dest, t, 'utf8');
console.log('Copied CallProvider.tsx');
