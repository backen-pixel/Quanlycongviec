/**
 * Chạy migration 441 (Phúc Đạt — nhiệm vụ SX «Báo giá») trên Primary + Backup.
 * Usage: node scripts/run-migration-441.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '441_phuc_dat_sx_bao_gia_task.sql'),
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
  (SELECT COUNT(*) FROM workshop_task_template_items i
   JOIN workshop_task_templates t ON t.id = i.template_id
   WHERE t.company_id = '29677f68-967e-4256-92fd-492bb580e888'
     AND lower(trim(i.title)) = lower('Báo giá')) AS template_items,
  (SELECT COUNT(*) FROM crm_tasks t
   JOIN crm_leads l ON l.id = t.lead_id
   JOIN projects p ON p.id = l.project_id
   WHERE p.company_id = '29677f68-967e-4256-92fd-492bb580e888'
     AND l.type = 'deal'
     AND t.stage_slug LIKE 'sx_%'
     AND lower(trim(t.title)) = lower('Báo giá')) AS deal_tasks;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/441`);
      console.log('Migration 441 applied:', JSON.stringify(result).slice(0, 300));
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
