const fs = require('fs');
const path = require('path');

const one = JSON.stringify(
  JSON.parse(fs.readFileSync(path.join(__dirname, '../secrets/firebase-sa.json'), 'utf8')),
);

const envPath = path.join(__dirname, '../.env');
let env = fs.readFileSync(envPath, 'utf8');
env = env.replace(/# Firebase Cloud Messaging[\s\S]*/m, '').trimEnd();
env += '\n\n# Firebase Cloud Messaging (Cach A — copy FCM_SA_JSON len Render Secret)\n';
env += `FCM_SA_JSON=${one}\n`;
fs.writeFileSync(envPath, env);
console.log('OK .env updated');
