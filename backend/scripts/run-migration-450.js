/**
 * Migration 450: Phúc Đạt — gộp 3 cột deal → Đã Khảo sát. rồi xóa cột.
 * Usage: node scripts/run-migration-450.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '450_phuc_dat_merge_deal_stages_to_surveyed.sql'),
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
SELECT name FROM crm_pipeline_stages
WHERE id IN (
  'bd08a266-a4fd-47ff-857e-65a54508fba1',
  'c49f4a64-1634-4c1a-8459-61b8060f8c7d',
  '24378e04-5197-4709-b520-d8e47fa02888'
);
SELECT COUNT(*)::int AS remain_on_removed
FROM crm_leads
WHERE stage_id IN (
  'bd08a266-a4fd-47ff-857e-65a54508fba1',
  'c49f4a64-1634-4c1a-8459-61b8060f8c7d',
  '24378e04-5197-4709-b520-d8e47fa02888'
);
SELECT COUNT(*)::int AS on_surveyed
FROM crm_leads WHERE stage_id = 'a6e13a64-121f-4f04-a12f-f6f96cca1516';
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/450`);
      console.log('Migration 450 applied:', JSON.stringify(result).slice(0, 400));
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log('Verify:', JSON.stringify(verify));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
