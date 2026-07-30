/**
 * Migration 481: Phúc Đạt — tắt deadline NV lead từ cột đầu → Warm.
 * Usage: node scripts/run-migration-481.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '481_phuc_dat_disable_lead_task_deadlines_to_warm.sql'),
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
SELECT t.name AS tpl, i.title, i.deadline_days, i.deadline_hours, i.deadline_minutes
FROM crm_task_template_items i
JOIN crm_task_templates t ON t.id = i.template_id
WHERE t.pipeline_stage_id IN (
  '2907475f-6289-495e-8aea-5ba0ae0cd2b8', -- Mới
  'dff6549d-3c98-40bd-90fb-9b2fe8e72313', -- Cold
  '4670b106-f007-4e07-8216-0e3b1cf7e6de', -- Warm
  '2ed1fd4e-cb9f-4d7b-9af0-9785c9d63700'  -- Hot (giữ)
)
ORDER BY t.name, i.order_index;

WITH lead_stages AS (
  SELECT unnest(ARRAY[
    '2907475f-6289-495e-8aea-5ba0ae0cd2b8'::uuid,
    '45346c31-2c4c-4eda-afc5-2c7ea98e545a'::uuid,
    'dff6549d-3c98-40bd-90fb-9b2fe8e72313'::uuid,
    '4670b106-f007-4e07-8216-0e3b1cf7e6de'::uuid
  ]) AS stage_id
)
SELECT
  s.name AS stage_name,
  COUNT(*) FILTER (WHERE t.deadline IS NOT NULL) AS open_with_deadline,
  COUNT(*) FILTER (
    WHERE COALESCE(t.deadline_days,0)+COALESCE(t.deadline_hours,0)+COALESCE(t.deadline_minutes,0) > 0
  ) AS open_with_offset
FROM lead_stages ls
JOIN crm_pipeline_stages s ON s.id = ls.stage_id
JOIN crm_leads l ON l.stage_id = ls.stage_id AND l.company_id = '29677f68-967e-4256-92fd-492bb580e888'
LEFT JOIN crm_tasks t ON t.lead_id = l.id
  AND COALESCE(t.status,'') NOT IN ('completed','done','cancelled','canceled')
GROUP BY s.name, s.order_index
ORDER BY s.order_index;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/481`);
      console.log('Migration 481 applied:', JSON.stringify(result).slice(0, 600));
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log('Verify:', JSON.stringify(verify, null, 2));
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
