/**
 * Apply database/534_knowledge_seed_sx_vc_plan_course.sql via Management API.
 * Usage: node scripts/apply-migration-534.js            (DB chính)
 *        node scripts/apply-migration-534.js --backup    (DB dự phòng)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const useBackup = process.argv.includes('--backup');
  const url = process.env.SUPABASE_URL || '';
  const ref = useBackup
    ? process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr'
    : (url.match(/https:\/\/([^.]+)/) || [])[1];
  if (!token || !ref) {
    console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_URL');
    process.exit(1);
  }
  const query = fs.readFileSync(
    path.join(__dirname, '../../database/534_knowledge_seed_sx_vc_plan_course.sql'),
    'utf8',
  );
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  console.log(useBackup ? 'BACKUP' : 'PRIMARY', ref, res.status, text.slice(0, 800));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
