/**
 * Apply database/567_knowledge_seed_dat_xuong_khac.sql via Management API.
 * Usage (từ thư mục backend):
 *   node scripts/apply-migration-567.js
 *   node scripts/apply-migration-567.js --backup
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const fs = require('fs');

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
  console.log(label, res.status, text.slice(0, 800));
  return res.ok;
}

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
  const target = useBackup ? 'BACKUP' : 'PRIMARY';
  const file = path.join(__dirname, '../../database/567_knowledge_seed_dat_xuong_khac.sql');
  const query = fs.readFileSync(file, 'utf8');
  const ok = await runQuery(ref, token, query, `${target} ${ref} 567_knowledge_seed_dat_xuong_khac.sql`);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
