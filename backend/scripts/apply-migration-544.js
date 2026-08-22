/**
 * Apply database/544_project_module_company_sync.sql via Management API.
 * Usage: node scripts/apply-migration-544.js
 *        node scripts/apply-migration-544.js --backup
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
  console.log(label, res.status, text.slice(0, 3000));
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
    path.join(__dirname, '../../database/544_project_module_company_sync.sql'),
    'utf8',
  );
  const target = useBackup ? 'BACKUP' : 'PRIMARY';
  const ok = await runQuery(ref, token, query, `${target} ${ref} apply`);
  if (!ok) process.exit(1);

  const verify = `
SELECT s.module_key,
       count(*) AS rows_total,
       count(pca.company_id) AS with_company,
       count(DISTINCT pca.company_id) AS distinct_companies
FROM project_company_assignments pca
JOIN ecosystem_module_scopes s
  ON s.division_unit_id = pca.division_unit_id
 AND s.module_key IN ('crm','production','logistics')
GROUP BY s.module_key
ORDER BY s.module_key;
`;
  await runQuery(ref, token, verify, `${target} verify`);

  const verifyTemplates = `
SELECT name, company_id FROM company_template_sets ORDER BY name;
`;
  await runQuery(ref, token, verifyTemplates, `${target} verify template sets`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
