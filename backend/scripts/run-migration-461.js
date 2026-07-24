/**
 * Migration 461: VPT HCM — hiện lại cột Gặp SHOW ROOM, đưa lead 459 về lại.
 * Usage: node scripts/run-migration-461.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '461_vpt_hcm_restore_showroom_stage.sql'),
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
SELECT s.id, s.name, s.order_index, s.canonical_slug, s.is_active,
       (SELECT COUNT(*) FROM crm_leads l WHERE l.stage_id = s.id) AS cnt
FROM crm_pipeline_stages s
WHERE s.pipeline_id = '78e6251c-aea1-46bc-a19f-a401f1de7f34'
  AND s.pipeline_type = 'lead'
  AND (s.name ILIKE '%SHOW%' OR s.name ILIKE 'CHUẨN BỊ XÂY' OR s.name ILIKE 'ĐANG HẸN%')
ORDER BY s.order_index;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      await runQuery(target.ref, SQL, `${target.label}/461`);
      console.log('Migration 461 applied.');
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log(JSON.stringify(verify, null, 2));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
