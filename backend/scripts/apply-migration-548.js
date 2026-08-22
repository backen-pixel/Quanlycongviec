/**
 * Apply database/548_vpt_remap_global_vc_columns.sql via Management API.
 * Usage: node scripts/apply-migration-548.js
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
    path.join(__dirname, '../../database/548_vpt_remap_global_vc_columns.sql'),
    'utf8',
  );
  const ok = await runQuery(ref, token, query, `PRIMARY ${ref} apply`);
  if (!ok) process.exit(1);

  const verify = `
SELECT p.code, p.vc_temp_staged, p.vc_handover_status, s.name AS col_name, s.company_id IS NULL AS is_global
FROM projects p
LEFT JOIN logistics_pipeline_stages s ON s.id = p.vc_kanban_column_id
WHERE p.logistics_company_id = '991dc79d-cbf5-49f9-a364-35227cb47635'
ORDER BY p.code;
`;
  await runQuery(ref, token, verify, 'PRIMARY verify');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
