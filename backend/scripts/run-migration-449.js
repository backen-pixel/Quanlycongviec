/**
 * Migration 449: tắt SLA 3 cột lead Phúc Đạt + clear deadline lead chưa SĐT.
 * Usage: node scripts/run-migration-449.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '449_phuc_dat_disable_sla_lead_intake_columns.sql'),
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
SELECT s.name, s.sla_days
FROM crm_pipeline_stages s
WHERE s.id IN (
  '2907475f-6289-495e-8aea-5ba0ae0cd2b8',
  '45346c31-2c4c-4eda-afc5-2c7ea98e545a',
  'dff6549d-3c98-40bd-90fb-9b2fe8e72313'
)
ORDER BY s.order_index;

WITH nha AS (SELECT '52027431-8ca6-40d6-9f53-29a438558e37'::uuid AS uid),
no_phone AS (
  SELECT l.id
  FROM crm_leads l
  WHERE l.company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND l.type = 'lead'
    AND (l.assigned_to = (SELECT uid FROM nha) OR l.lead_owner_id = (SELECT uid FROM nha))
    AND (l.phone IS NULL OR btrim(l.phone) = '')
)
SELECT
  (SELECT COUNT(*) FROM no_phone) AS nha_no_phone,
  (SELECT COUNT(*) FROM crm_leads l JOIN no_phone n ON n.id = l.id WHERE l.kanban_deadline_at IS NOT NULL) AS remain_kanban,
  (SELECT COUNT(*) FROM crm_tasks t JOIN no_phone n ON n.id = t.lead_id
    WHERE t.deadline IS NOT NULL
      AND COALESCE(t.status,'') NOT IN ('completed','done','cancelled','canceled')) AS remain_task_dl;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/449`);
      console.log('Migration 449 applied:', JSON.stringify(result).slice(0, 600));
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
