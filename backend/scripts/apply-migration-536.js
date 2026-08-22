/**
 * Apply database/536_metalla_thach_all_projects.sql via Management API.
 * Usage: node scripts/apply-migration-536.js
 *        node scripts/apply-migration-536.js --backup
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
    path.join(__dirname, '../../database/536_metalla_thach_all_projects.sql'),
    'utf8',
  );
  const target = useBackup ? 'BACKUP' : 'PRIMARY';
  const ok = await runQuery(ref, token, query, `${target} ${ref} apply`);
  if (!ok) process.exit(1);

  const verify = `
SELECT u.email, u.full_name, u.role, u.is_active, c.name AS company,
  (SELECT COUNT(*) FROM projects p WHERE p.company_id = u.company_id) AS metalla_projects,
  (SELECT COUNT(*) FROM project_production_staff s
     JOIN projects p ON p.id = s.project_id
    WHERE s.user_id = u.id AND p.company_id = u.company_id) AS projects_staff,
  (SELECT COUNT(*) FROM lead_members lm WHERE lm.user_id = u.id) AS deal_members,
  (SELECT COUNT(*) FROM production_workshop_type_default_staff d WHERE d.user_id = u.id) AS default_types
FROM users u
LEFT JOIN companies c ON c.id = u.company_id
WHERE lower(trim(u.email)) = 'thach@metalla.com';
`;
  await runQuery(ref, token, verify, `${target} verify`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
