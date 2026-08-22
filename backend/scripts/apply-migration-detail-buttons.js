/**
 * Apply 554 + 555 + 556 (khoá từng nút chi tiết CRM / SX / VC) via Management API.
 * Usage (từ thư mục backend):
 *   node scripts/apply-migration-detail-buttons.js
 *   node scripts/apply-migration-detail-buttons.js --backup
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const fs = require('fs');

const FILES = [
  '554_knowledge_seed_crm_detail_buttons.sql',
  '555_knowledge_seed_sx_detail_buttons.sql',
  '556_knowledge_seed_vc_detail_buttons.sql',
];

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
  console.log(label, res.status, text.slice(0, 500));
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
  const dbDir = path.join(__dirname, '../../database');
  for (const file of FILES) {
    const query = fs.readFileSync(path.join(dbDir, file), 'utf8');
    const ok = await runQuery(ref, token, query, `${target} ${ref} ${file}`);
    if (!ok) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});