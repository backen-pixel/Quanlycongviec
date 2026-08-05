/**
 * Migration 497: Phúc Đạt — CRM «Sản xuất.» chỉ còn 4 nhiệm vụ + áp dụng mọi deal.
 * Usage: node scripts/run-migration-497.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '497_phuc_dat_crm_sx_four_tasks.sql'),
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
sx_stage AS (
  SELECT s.id
  FROM crm_pipeline_stages s
  JOIN crm_pipelines p ON p.id = s.pipeline_id
  JOIN pd ON p.company_id = pd.id
  WHERE s.sync_role = 'sx_production'
     OR lower(trim(s.name)) IN (lower('Sản xuất.'), lower('Sản xuất'))
  ORDER BY CASE WHEN s.sync_role = 'sx_production' THEN 0 ELSE 1 END, s.order_index
  LIMIT 1
),
tpl_items AS (
  SELECT i.title, i.order_index
  FROM crm_task_templates t
  JOIN crm_task_template_items i ON i.template_id = t.id
  JOIN sx_stage st ON t.pipeline_stage_id = st.id
  WHERE t.is_active = true
  ORDER BY i.order_index
),
needed AS (
  SELECT * FROM (VALUES
    ('Đặt kính ốp'),
    ('Đặt Đá'),
    ('Đặt phụ kiện'),
    ('Mô tả công trình')
  ) AS x(title)
),
target_deals AS (
  SELECT l.id
  FROM crm_leads l
  JOIN pd ON l.company_id = pd.id
  LEFT JOIN crm_pipeline_stages s ON s.id = l.stage_id
  WHERE l.type = 'deal'
    AND COALESCE(s.is_lost, false) = false
),
removed_left AS (
  SELECT COUNT(*) AS cnt
  FROM crm_tasks t
  JOIN crm_leads l ON l.id = t.lead_id
  JOIN pd ON l.company_id = pd.id
  WHERE l.type = 'deal'
    AND lower(trim(t.title)) IN (
      lower('Bản vẽ sản xuất'),
      lower('Lịch lắp đặt'),
      lower('Bảng danh mục chuẩn bị vật tư'),
      lower('Bản danh mục chuẩn bị vật tư')
    )
)
SELECT
  (SELECT json_agg(json_build_object('title', title, 'order_index', order_index) ORDER BY order_index)
     FROM tpl_items) AS template_items,
  (SELECT cnt FROM removed_left) AS removed_tasks_still_present,
  (
    SELECT json_agg(row_to_json(x) ORDER BY x.title)
    FROM (
      SELECT
        n.title,
        COUNT(d.id) AS target_deals,
        COUNT(t.id) AS deals_having_on_sx
      FROM needed n
      CROSS JOIN target_deals d
      LEFT JOIN crm_tasks t
        ON t.lead_id = d.id
       AND lower(trim(t.title)) = lower(trim(n.title))
       AND (
         t.pipeline_stage_id = (SELECT id FROM sx_stage)
         OR lower(trim(COALESCE(t.stage_slug, ''))) LIKE 'pl_san_xuat_%'
         OR lower(trim(COALESCE(t.stage_slug, ''))) IN (lower('Sản xuất.'), lower('Sản xuất'))
       )
      GROUP BY n.title
    ) x
  ) AS coverage;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    await runQuery(target.ref, SQL, `${target.label}/497`);
    const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
    console.log('Verify:', JSON.stringify(verify, null, 2));
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
