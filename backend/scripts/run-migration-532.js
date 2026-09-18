/**
 * Migration 532: cột «lắp đặt tạm» (logistics_pipeline_stages.is_temp_install_staging)
 * + projects.vc_notes / projects.vc_temp_staged.
 *
 * Bối cảnh: trên project xfqlxilgjudfsrbsyasq (dev) migration này chỉ chạy nửa vời —
 * logistics_pipeline_stages.is_temp_install_staging đã có, nhưng projects.vc_notes và
 * projects.vc_temp_staged thì chưa → GET /api/logistics/projects trả 500 (42703).
 *
 * Usage: node scripts/run-migration-532.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const refFromUrl = (u) => (u ? String(u).replace(/^https?:\/\//, '').split('.')[0] : null);
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || refFromUrl(process.env.SUPABASE_URL);
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || refFromUrl(process.env.SUPABASE_BACKUP_URL);
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '532_vc_temp_install_staging.sql'),
  'utf8',
);

async function runQuery(ref, query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

const VERIFY_SQL = `
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'projects' AND column_name IN ('vc_notes', 'vc_temp_staged'))
    OR (table_name = 'logistics_pipeline_stages' AND column_name = 'is_temp_install_staging')
  )
ORDER BY table_name, column_name;
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
  if (!PRIMARY_REF) throw new Error('Không xác định được PRIMARY_PROJECT_REF / SUPABASE_URL');

  console.log(`Applying 532 on primary (${PRIMARY_REF})…`);
  console.log('primary:', await runQuery(PRIMARY_REF, SQL, 'primary'));

  if (BACKUP_REF && BACKUP_REF !== PRIMARY_REF) {
    console.log(`Applying 532 on backup (${BACKUP_REF})…`);
    console.log('backup:', await runQuery(BACKUP_REF, SQL, 'backup'));
  }

  console.log('Verify primary:', await runQuery(PRIMARY_REF, VERIFY_SQL, 'verify'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
