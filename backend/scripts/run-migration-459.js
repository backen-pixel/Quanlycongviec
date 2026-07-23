/**
 * Migration 459: VPT — bỏ cột Gặp SHOW ROOM, chuyển lead → CHUẨN BỊ XÂY.
 * Usage: node scripts/run-migration-459.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '459_vpt_remove_showroom_stage_to_chuan_bi_xay.sql'),
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
SELECT p.name AS pipeline,
       s.name AS stage_name,
       s.order_index,
       (SELECT COUNT(*) FROM crm_leads l WHERE l.stage_id = s.id) AS cnt
FROM crm_pipeline_stages s
JOIN crm_pipelines p ON p.id = s.pipeline_id
WHERE s.pipeline_id IN (
  '78e6251c-aea1-46bc-a19f-a401f1de7f34',
  '98af561c-133f-4431-a95c-48d747afb4b2',
  'f4bf40c1-f673-459a-a735-09ec88b2e872'
)
AND s.pipeline_type = 'lead'
AND (
  s.name ILIKE '%SHOW%'
  OR s.name ILIKE 'CHUẨN BỊ XÂY'
)
ORDER BY p.name, s.order_index;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      await runQuery(target.ref, SQL, `${target.label}/459`);
      console.log('Migration 459 applied.');
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log(JSON.stringify(verify, null, 2));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
