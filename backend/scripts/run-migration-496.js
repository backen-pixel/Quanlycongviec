/**
 * Migration 496: Phúc Đạt — backfill 4 nhiệm vụ vật tư cho deal chưa có dự án SX.
 * Usage: node scripts/run-migration-496.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '496_phuc_dat_vat_tu_tasks_no_project.sql'),
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
target_deals AS (
  SELECT l.id, (l.project_id IS NOT NULL) AS has_project
  FROM crm_leads l
  JOIN pd ON l.company_id = pd.id
  LEFT JOIN crm_pipeline_stages s ON s.id = l.stage_id
  WHERE l.type = 'deal'
    AND COALESCE(s.is_lost, false) = false
    AND (
      l.project_id IS NOT NULL
      OR COALESCE(s.is_won, false) = true
      OR lower(trim(COALESCE(s.name, ''))) LIKE '%sản xuất%'
      OR lower(trim(COALESCE(s.name, ''))) LIKE '%vận chuyển%'
      OR lower(trim(COALESCE(s.name, ''))) LIKE '%hoàn thành%'
      OR lower(trim(COALESCE(s.name, ''))) LIKE '%hoá đơn%'
      OR lower(trim(COALESCE(s.name, ''))) LIKE '%hóa đơn%'
      OR lower(trim(COALESCE(s.name, ''))) LIKE '%ký hợp đồng%'
      OR lower(trim(COALESCE(s.name, ''))) = lower('Thắng')
    )
)
SELECT
  n.title,
  COUNT(d.id) FILTER (WHERE NOT d.has_project) AS no_project_deals,
  COUNT(t.id) FILTER (WHERE NOT d.has_project) AS no_project_having,
  COUNT(d.id) FILTER (WHERE d.has_project) AS with_project_deals,
  COUNT(t.id) FILTER (WHERE d.has_project) AS with_project_having
FROM needed n
CROSS JOIN target_deals d
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
    await runQuery(target.ref, SQL, `${target.label}/496`);
    const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
    console.log('Verify:', JSON.stringify(verify, null, 2));
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
