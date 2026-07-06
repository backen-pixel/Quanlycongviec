/**
 * Chạy migration 397 + 398 SaaS trên BACKUP (bỏ FK users nếu backup thiếu PK).
 * Usage: node scripts/run-migration-398-backup.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL_397_BACKUP = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '397_saas_store.sql'), 'utf8')
  .replace(
    'user_id UUID REFERENCES users(id) ON DELETE SET NULL,',
    'user_id UUID,',
  );

const SQL_398 = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '398_saas_plans.sql'), 'utf8');

async function runQuery(label, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${BACKUP_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    throw new Error(`[${label}] HTTP ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }
  console.log(`=== BACKUP (${BACKUP_REF}) — 397_saas_store ===`);
  await runQuery('397', SQL_397_BACKUP);
  console.log('OK 397');

  console.log(`=== BACKUP (${BACKUP_REF}) — 398_saas_plans ===`);
  await runQuery('398', SQL_398);
  console.log('OK 398');

  const verify = await runQuery('verify', `
    SELECT
      (SELECT count(*) FROM saas_plans) AS plans,
      (SELECT count(*) FROM saas_modules) AS modules,
      (SELECT count(*) FROM information_schema.columns WHERE table_name='saas_purchases' AND column_name='plan_id') AS has_plan_id;
  `);
  console.log('Verify:', verify);
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
