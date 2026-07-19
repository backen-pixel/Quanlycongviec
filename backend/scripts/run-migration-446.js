/**
 * Chạy migration 446 (assignee thấy lead dù region lệch) trên Primary + Backup.
 * Usage: node scripts/run-migration-446.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '446_crm_leads_assignee_region_visibility.sql'),
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
  (public.crm_leads_page_ids(
    'lead', NULL,
    '2a4f2392-a286-441f-b726-1954a0888253'::uuid,
    NULL, NULL, NULL, NULL, NULL, NULL,
    5000, 0, true,
    ARRAY['7d7a001a-bf2e-4915-8128-b2166901ec4f'::uuid]
  )->>'total')::int AS total_with_q2_scope;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/446`);
      console.log('Migration 446 applied:', JSON.stringify(result).slice(0, 400));
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log('Verify RPC total (Hương + Q2 scope):', JSON.stringify(verify));
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
