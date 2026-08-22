/**
 * Apply database/545_sx_post_delivery_ignore_overdue.sql via Management API.
 * Usage: node scripts/apply-migration-545.js
 *        node scripts/apply-migration-545.js --backup
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
    path.join(__dirname, '../../database/545_sx_post_delivery_ignore_overdue.sql'),
    'utf8',
  );
  const target = useBackup ? 'BACKUP' : 'PRIMARY';
  const ok = await runQuery(ref, token, query, `${target} ${ref} apply`);
  if (!ok) process.exit(1);

  const verify = `
SELECT s.name, c.name AS company, s.sla_days
FROM production_pipeline_stages s
LEFT JOIN companies c ON c.id = s.company_id
WHERE COALESCE(s.is_active, true) = true
  AND (
    lower(s.name) ~ '(đã giao|da giao|khấu trừ|khau tru|chốt công nợ|kiem tra cong no|đang đôi chiếu)'
  )
ORDER BY c.name, s.order_index;
`;
  await runQuery(ref, token, verify, `${target} verify`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
