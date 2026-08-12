/**
 * Migration 495: Phúc Đạt — 4 nhiệm vụ «Chuẩn bị vật tư» + backfill deal đã SX.
 * Usage: node scripts/run-migration-495.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '495_phuc_dat_vat_tu_four_tasks.sql'),
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
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');

  const verifySql = `
WITH pd AS (
  SELECT id FROM companies
  WHERE id = '29677f68-967e-4256-92fd-492bb580e888'
     OR name ILIKE '%Phúc Đạt%' OR name ILIKE '%Phuc Dat%'
  ORDER BY CASE WHEN id = '29677f68-967e-4256-92fd-492bb580e888' THEN 0 ELSE 1 END
  LIMIT 1
),
needed AS (
  SELECT unnest(ARRAY[
    'Đặt phụ kiện',
    'Mô tả công trình',
    'Đặt kính ốp',
    'Báo giá mét cho xưởng'
  ]) AS title
),
deals AS (
  SELECT l.id
  FROM crm_leads l
  JOIN projects p ON p.id = l.project_id
  JOIN pd ON p.company_id = pd.id
  WHERE l.type = 'deal'
)
SELECT
  n.title,
  (SELECT COUNT(*) FROM workshop_task_template_items i
   JOIN workshop_task_templates t ON t.id = i.template_id
   JOIN pd ON t.company_id = pd.id
   JOIN production_pipeline_stages s ON s.id = t.production_stage_id
   WHERE lower(trim(s.name)) = lower('Chuẩn bị vật tư')
     AND lower(trim(i.title)) = lower(trim(n.title))
  ) AS in_template,
  COUNT(d.id) AS deals_with_project,
  COUNT(t.id) AS deals_having_task,
  COUNT(d.id) - COUNT(t.id) AS deals_missing
FROM needed n
CROSS JOIN deals d
LEFT JOIN crm_tasks t
  ON t.lead_id = d.id
 AND t.stage_slug LIKE 'sx_%'
 AND lower(trim(t.title)) = lower(trim(n.title))
GROUP BY n.title
ORDER BY n.title;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    await runQuery(target.ref, SQL, `${target.label}/495`);
    const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
    console.log('Verify:', JSON.stringify(verify, null, 2));
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
