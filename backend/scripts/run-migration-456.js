/**
 * Migration 456: NextGo — pipeline SX xưởng giấy / bao bì.
 * Usage: node scripts/run-migration-456.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '456_nextgo_paper_packaging_sx_pipeline.sql'),
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
SELECT p.name, p.order_index, p.bucket_slug, p.crm_sync_type,
       p.counts_as_completed_revenue, crm.name AS crm_target
FROM production_pipeline_stages p
LEFT JOIN crm_pipeline_stages crm ON crm.id = p.crm_target_stage_id
WHERE p.company_id = (
  SELECT id FROM companies WHERE name ILIKE '%NextGo%' OR short_name ILIKE '%NextGo%' LIMIT 1
)
  AND p.workshop_type_id IS NULL
  AND p.is_active IS DISTINCT FROM false
ORDER BY p.order_index;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/456`);
      console.log('Migration 456 applied:', JSON.stringify(result).slice(0, 300));
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log('Verify stages:', JSON.stringify(verify, null, 2));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
