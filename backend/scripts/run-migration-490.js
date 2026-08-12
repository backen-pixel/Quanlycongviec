/**
 * Migration 490: Phúc Đạt — NV Hot gắn nhầm cột Cold.
 * Usage: node scripts/run-migration-490.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '490_phuc_dat_hot_tasks_wrong_cold_stage.sql'),
  'utf8',
);

const VERIFY = `
SELECT l.code, t.title, pst.name AS task_stage, st.name AS lead_stage
FROM crm_tasks t
JOIN crm_leads l ON l.id = t.lead_id
JOIN crm_pipeline_stages st ON st.id = l.stage_id
LEFT JOIN crm_pipeline_stages pst ON pst.id = t.pipeline_stage_id
WHERE l.id IN (
  '8467d6ef-13e6-49ce-bec3-5870a61aa87c',
  '701a57d3-919b-4875-8734-a42261c69e86'
)
  AND t.status IN ('pending', 'in_progress');
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
  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    await runQuery(target.ref, SQL, `${target.label}-490`);
    console.log('verify', await runQuery(target.ref, VERIFY, `${target.label}-verify`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
