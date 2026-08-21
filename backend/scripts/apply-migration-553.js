/**
 * Apply database/553_project_deadline_dispatches.sql via Management API.
 * Usage: node scripts/apply-migration-553.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function runQuery(ref, token, query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  console.log(label, res.status, text.slice(0, 2000));
  return res.ok;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const url = process.env.SUPABASE_URL || '';
  const ref = process.env.PRIMARY_PROJECT_REF || (url.match(/https:\/\/([^.]+)/) || [])[1];
  if (!token || !ref) {
    console.error('Missing SUPABASE_ACCESS_TOKEN or project ref');
    process.exit(1);
  }

  const query = fs.readFileSync(
    path.join(__dirname, '../../database/553_project_deadline_dispatches.sql'),
    'utf8',
  );
  const ok = await runQuery(ref, token, query, `PRIMARY ${ref} apply`);
  if (!ok) process.exit(1);

  const verify = `
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'project_deadline_dispatches';
`;
  await runQuery(ref, token, verify, 'PRIMARY verify');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
