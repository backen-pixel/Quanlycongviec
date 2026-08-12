/**
 * Migration 505: user_module_roles + backfill + user_has_permission union
 * Usage: node scripts/run-migration-505.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '505_user_module_roles.sql'),
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

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} ===`);
    const result = await runQuery(ref, SQL, label);
    console.log(JSON.stringify(result, null, 2));
  }

  const check = await runQuery(
    PRIMARY_REF,
    `SELECT module_key, count(*)::int AS n
     FROM user_module_roles
     GROUP BY module_key
     ORDER BY module_key`,
    'CHECK',
  );
  console.log('\n=== VERIFY PRIMARY ===');
  console.log(JSON.stringify(check, null, 2));
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
