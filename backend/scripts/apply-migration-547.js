/**
 * Apply database/547_backfill_vc_temp_install_staging.sql via Management API.
 * Usage: node scripts/apply-migration-547.js
 *        node scripts/apply-migration-547.js --backup
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
    path.join(__dirname, '../../database/547_backfill_vc_temp_install_staging.sql'),
    'utf8',
  );
  const target = useBackup ? 'BACKUP' : 'PRIMARY';
  const ok = await runQuery(ref, token, query, `${target} ${ref} apply`);
  if (!ok) process.exit(1);

  const verify = `
SELECT p.code, p.vc_temp_staged, s.name AS col_name, s.is_temp_install_staging,
       p.vc_handover_status, p.install_date::date, p.pickup_at::date
FROM projects p
JOIN logistics_pipeline_stages s ON s.id = p.vc_kanban_column_id
WHERE p.logistics_company_id = '991dc79d-cbf5-49f9-a364-35227cb47635'
ORDER BY p.code;
`;
  await runQuery(ref, token, verify, `${target} verify VPT`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
