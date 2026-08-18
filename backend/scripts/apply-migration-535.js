/**
 * Apply database/535_knowledge_sim_exercise_sx_vc.sql via Management API.
 * File chia 2 phần bằng mốc "-- @@SPLIT@@" vì giá trị enum mới không dùng được
 * trong cùng transaction vừa thêm nó.
 *
 * Usage: node scripts/apply-migration-535.js            (DB chính)
 *        node scripts/apply-migration-535.js --backup    (DB dự phòng)
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
  console.log(label, res.status, text.slice(0, 600));
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

  const sql = fs.readFileSync(
    path.join(__dirname, '../../database/535_knowledge_sim_exercise_sx_vc.sql'),
    'utf8',
  );
  const parts = sql.split(/^--\s*@@SPLIT@@\s*$/m).map((s) => s.trim()).filter(Boolean);
  const target = useBackup ? 'BACKUP' : 'PRIMARY';

  for (let i = 0; i < parts.length; i += 1) {
    const ok = await runQuery(ref, token, parts[i], `${target} ${ref} part ${i + 1}/${parts.length}`);
    if (!ok) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
