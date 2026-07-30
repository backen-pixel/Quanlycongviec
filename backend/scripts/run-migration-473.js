/**
 * Migration 473: RPC đếm bucket Deadline CRM trong một truy vấn DB.
 * Usage: node scripts/run-migration-473.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '473_crm_deadline_bucket_counts_rpc.sql'),
  'utf8',
);

async function runQuery(ref, query, label) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`[${label}] ${response.status}: ${text}`);
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
  to_regprocedure(
    'public.crm_deadline_bucket_counts(uuid[],uuid[],uuid,boolean,integer,integer,integer,integer)'
  ) IS NOT NULL AS rpc_installed,
  to_regclass('public.idx_crm_tasks_open_deadline_by_lead') IS NOT NULL AS index_installed;
`;

  for (const [label, ref] of [['PRIMARY', PRIMARY_REF], ['BACKUP', BACKUP_REF]]) {
    console.log(`\n=== ${label} (${ref}) ===`);
    await runQuery(ref, SQL, label);
    console.log(await runQuery(ref, verifySql, `${label}-verify`));
  }
  console.log('\nDone.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
