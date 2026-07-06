/**
 * Chạy migration 516 (Google auth columns) trên Primary + Backup.
 * Usage: node scripts/run-migration-516.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '516_users_google_auth.sql'), 'utf8');

const VERIFY_SQL = `
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
  AND column_name IN ('google_id', 'auth_provider')
ORDER BY column_name;
`;

async function runQuery(ref, query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }
  for (const t of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`=== ${t.label} (${t.ref}) — 516_users_google_auth ===`);
    await runQuery(t.ref, SQL, t.label);
    console.log('Migration OK');
    const cols = await runQuery(t.ref, VERIFY_SQL, `${t.label} verify`);
    console.log('Columns:', JSON.stringify(cols, null, 2));
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
