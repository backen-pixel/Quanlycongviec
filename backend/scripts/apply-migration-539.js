/**
 * Apply database/539_workflow_flow_ai_report_node.sql via Management API.
 * Usage: node scripts/apply-migration-539.js
 *        node scripts/apply-migration-539.js --backup
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
  console.log(label, res.status, text.slice(0, 1200));
  return res.ok;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const useBackup = process.argv.includes('--backup');
  const url = process.env.SUPABASE_URL || '';
  const ref = useBackup
    ? process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr'
    : (process.env.PRIMARY_PROJECT_REF || (url.match(/https:\/\/([^.]+)/) || [])[1]);
  if (!token || !ref) {
    console.error('Missing SUPABASE_ACCESS_TOKEN or project ref');
    process.exit(1);
  }

  const query = fs.readFileSync(
    path.join(__dirname, '../../database/539_workflow_flow_ai_report_node.sql'),
    'utf8',
  );
  const target = useBackup ? 'BACKUP' : 'PRIMARY';
  const ok = await runQuery(ref, token, query, `${target} ${ref} apply`);
  if (!ok) process.exit(1);

  const verify = `
SELECT pg_get_constraintdef(oid) AS node_kind_check
FROM pg_constraint WHERE conname = 'chk_wfs_node_kind';
`;
  await runQuery(ref, token, verify, `${target} verify`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
