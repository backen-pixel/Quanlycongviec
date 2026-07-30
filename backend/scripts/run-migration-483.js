/**
 * Migration 483: VPT — tắt toàn bộ deadline nhiệm vụ Lead.
 * Usage: node scripts/run-migration-483.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '483_vpt_disable_all_lead_task_deadlines.sql'),
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
WITH vpt AS (
  SELECT id FROM companies
  WHERE id = '991dc79d-cbf5-49f9-a364-35227cb47635'
     OR name ILIKE '%Vạn Phú Thành%'
), lead_stages AS (
  SELECT ps.id
  FROM crm_pipeline_stages ps
  JOIN crm_pipelines p ON p.id = ps.pipeline_id
  WHERE p.company_id IN (SELECT id FROM vpt)
    AND COALESCE(ps.pipeline_type, 'lead') = 'lead'
)
SELECT
  (SELECT COUNT(*)
   FROM crm_task_template_items i
   JOIN crm_task_templates t ON t.id = i.template_id
   WHERE t.pipeline_stage_id IN (SELECT id FROM lead_stages)
     AND COALESCE(i.deadline_days, 0)
       + COALESCE(i.deadline_hours, 0)
       + COALESCE(i.deadline_minutes, 0) > 0) AS template_items_with_deadline,
  (SELECT COUNT(*)
   FROM crm_tasks t
   JOIN crm_leads l ON l.id = t.lead_id
   WHERE l.company_id IN (SELECT id FROM vpt)
     AND l.type = 'lead'
     AND COALESCE(t.status, '') NOT IN ('completed', 'done', 'cancelled', 'canceled')
     AND (
       t.deadline IS NOT NULL
       OR COALESCE(t.deadline_days, 0) <> 0
       OR COALESCE(t.deadline_hours, 0) <> 0
       OR COALESCE(t.deadline_minutes, 0) <> 0
     )) AS open_lead_tasks_with_deadline;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      await runQuery(target.ref, SQL, `${target.label}/483`);
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
