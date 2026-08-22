/**
 * Apply database/540_phuc_dat_admin_hong_phuong_company_scope.sql via Management API.
 * Usage: node scripts/apply-migration-540.js
 *        node scripts/apply-migration-540.js --backup
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
    path.join(__dirname, '../../database/540_phuc_dat_admin_hong_phuong_company_scope.sql'),
    'utf8',
  );
  const target = useBackup ? 'BACKUP' : 'PRIMARY';
  const ok = await runQuery(ref, token, query, `${target} ${ref} apply`);
  if (!ok) process.exit(1);

  const verify = `
SELECT u.email, u.full_name, u.role, u.company_id, u.department_id, u.is_active,
       c.name AS company_name, d.name AS department_name,
       uc.is_primary
FROM users u
LEFT JOIN companies c ON c.id = u.company_id
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = u.company_id
WHERE u.id = '3420259c-40b7-40c2-ae00-eb78c54f8732'
   OR lower(trim(u.email)) = 'kinhdoanh@phucdatdoor.vn';
`;
  await runQuery(ref, token, verify, `${target} verify`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
