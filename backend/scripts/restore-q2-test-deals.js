/**
 * Restore 3 deals reverted during Admin Q2 test back to prior deal stages.
 * Usage: node scripts/restore-q2-test-deals.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const Q2_PIPE = 'f4bf40c1-f673-459a-a735-09ec88b2e872';
const STAGE_THEO = 'c86de5d5-c3c3-4815-a635-939c098dee63'; // THEO DÕI THÊM
const STAGE_BG = '0061947b-c981-4661-adb1-922e0adbe256'; // ĐÃ GỬI BÁO GIÁ KHÁCH HÀNG
const ADMIN_Q2 = '2a4f2392-a286-441f-b726-1954a0888253';
const REGION_Q2 = '7d7a001a-bf2e-4915-8128-b2166901ec4f';

const SQL = `
UPDATE crm_leads SET
  type = 'deal',
  pipeline_id = '${Q2_PIPE}',
  stage_id = CASE code
    WHEN 'LEAD-2026-712' THEN '${STAGE_THEO}'::uuid
    WHEN 'LEAD-2026-700' THEN '${STAGE_THEO}'::uuid
    WHEN 'LEAD-2026-711' THEN '${STAGE_BG}'::uuid
  END,
  assigned_to = '${ADMIN_Q2}',
  lead_owner_id = '${ADMIN_Q2}',
  region_id = COALESCE(region_id, '${REGION_Q2}'),
  stage_entered_at = NOW(),
  updated_at = NOW()
WHERE code IN ('LEAD-2026-712', 'LEAD-2026-711', 'LEAD-2026-700');

SELECT code, type,
  (SELECT name FROM crm_pipeline_stages WHERE id = stage_id) AS stage,
  (SELECT full_name FROM users WHERE id = assigned_to) AS assignee,
  (SELECT name FROM company_regions WHERE id = region_id) AS region
FROM crm_leads
WHERE code IN ('LEAD-2026-712', 'LEAD-2026-711', 'LEAD-2026-700')
ORDER BY code;
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
    console.error('Thiếu SUPABASE_ACCESS_TOKEN');
    process.exit(1);
  }
  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, target.label);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
