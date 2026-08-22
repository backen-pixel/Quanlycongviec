/**
 * Apply database/549_shared_workspace_error_types.sql via Management API.
 * Usage: node scripts/apply-migration-549.js
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
  console.log(label, res.status, text.slice(0, 4000));
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
    path.join(__dirname, '../../database/549_shared_workspace_error_types.sql'),
    'utf8',
  );
  const ok = await runQuery(ref, token, query, `PRIMARY ${ref} apply`);
  if (!ok) process.exit(1);

  const verify = `
SELECT id, name, slug, source_kind, company_id IS NULL AS is_global
FROM shared_workspace_error_types
ORDER BY sort_order;
`;
  await runQuery(ref, token, verify, 'PRIMARY verify');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
