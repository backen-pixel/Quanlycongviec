/**
 * Chạy migration 444 (null-region visibility + backfill LEAD-4299) trên Primary + Backup.
 * Usage: node scripts/run-migration-444.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '444_crm_leads_null_region_visibility.sql'),
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
SELECT l.code, l.region_id, cr.name AS region_name
FROM crm_leads l
LEFT JOIN company_regions cr ON cr.id = l.region_id
WHERE l.id = '4c4a9e05-c394-4f27-b062-407d5efc46fc';

SELECT public.crm_leads_page_ids(
  'deal', NULL,
  'a339b498-a4c5-40c5-ab6a-5e6d061ed186'::uuid,
  NULL,
  '29677f68-967e-4256-92fd-492bb580e888'::uuid,
  NULL, NULL, 'LEAD-4299', NULL, 10, 0, true,
  ARRAY['6e45a2aa-4664-4822-b5e9-1b2f85b424d1']::uuid[]
) AS rpc_nhien_region;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/444`);
      console.log('Migration 444 applied:', JSON.stringify(result).slice(0, 400));
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
