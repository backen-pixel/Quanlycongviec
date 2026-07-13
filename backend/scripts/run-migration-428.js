/**
 * Chạy migration 428 (tách CRM pipeline theo khu vực cho VPT) trên Primary +
 * Backup và verify số lead/deal đã chuyển đúng pipeline khu vực.
 * Usage: node scripts/run-migration-428.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '428_crm_pipelines_region_split_vpt.sql'),
  'utf8',
);

const VERIFY_SQL = `
WITH vpt AS (
  SELECT id FROM companies
  WHERE name ILIKE '%Vạn Phú Thành%' OR name ILIKE '%Van Phu Thanh%'
  ORDER BY name LIMIT 1
)
SELECT
  p.id AS pipeline_id,
  p.name AS pipeline_name,
  p.is_default,
  r.code AS region_code,
  r.name AS region_name,
  (SELECT COUNT(*)::int FROM crm_pipeline_stages s WHERE s.pipeline_id = p.id) AS stage_count,
  (SELECT COUNT(*)::int FROM crm_leads l WHERE l.pipeline_id = p.id) AS lead_count
FROM crm_pipelines p
LEFT JOIN company_regions r ON r.id = p.region_id
WHERE p.company_id = (SELECT id FROM vpt)
ORDER BY r.order_index NULLS LAST, p.name;
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

  let allOk = true;
  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    await runQuery(target.ref, SQL, `${target.label}/428`);
    console.log('Migration 428 applied');

    const rows = await runQuery(target.ref, VERIFY_SQL, `${target.label}/verify`);
    console.log(JSON.stringify(rows, null, 2));

    const byRegion = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      byRegion[row.region_code || 'NONE'] = row;
    }
    const hcm = byRegion.HCM;
    const q2 = byRegion.Q2;
    const ct = byRegion.CT;

    if (!hcm || !q2 || !ct) {
      console.error(`FAIL ${target.label}: thiếu pipeline theo khu vực (hcm=${!!hcm}, q2=${!!q2}, ct=${!!ct})`);
      allOk = false;
      continue;
    }
    if (hcm.stage_count !== q2.stage_count || hcm.stage_count !== ct.stage_count) {
      console.error(`FAIL ${target.label}: số stage lệch giữa các pipeline (hcm=${hcm.stage_count}, q2=${q2.stage_count}, ct=${ct.stage_count})`);
      allOk = false;
    } else {
      console.log(`PASS ${target.label}: 3 pipeline khu vực, mỗi pipeline ${hcm.stage_count} stage`);
      console.log(`  HCM: ${hcm.lead_count} lead/deal | Q2: ${q2.lead_count} lead/deal | Cần Thơ: ${ct.lead_count} lead/deal`);
    }
  }

  if (!allOk) process.exit(1);
  console.log('\n✅ Migration 428 PRIMARY + BACKUP — verify OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
