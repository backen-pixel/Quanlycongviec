/**
 * Chạy migration 442 (Metalla — bỏ hết hạn cột SX) trên Primary + Backup.
 * Usage: node scripts/run-migration-442.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '442_metalla_disable_sx_column_deadlines.sql'),
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

  const verifySql = `
SELECT
  COUNT(*) FILTER (WHERE sla_days = 0 AND COALESCE(requires_deadline, false) = false) AS disabled,
  COUNT(*) FILTER (WHERE sla_days IS DISTINCT FROM 0 OR COALESCE(requires_deadline, false) = true) AS still_active,
  COUNT(*) AS total
FROM production_pipeline_stages
WHERE company_id = 'b78baba2-2486-434c-a72d-9c937fac2164';
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/442`);
      console.log('Migration 442 applied:', JSON.stringify(result).slice(0, 300));
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log('Verify:', JSON.stringify(verify));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
