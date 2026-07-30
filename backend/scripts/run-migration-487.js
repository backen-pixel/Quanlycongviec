/**
 * Migration 487: Phúc Đạt — nhiệm vụ cột SX «Chuẩn bị vật tư».
 * Usage: node scripts/run-migration-487.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '487_phuc_dat_material_preparation_tasks.sql'),
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
    SELECT s.name AS stage_name, t.name AS template_name,
           array_agg(i.title ORDER BY i.order_index) AS tasks
    FROM companies c
    JOIN production_pipeline_stages s
      ON s.company_id = c.id
     AND lower(trim(s.name)) = lower('Chuẩn bị vật tư')
    JOIN workshop_task_templates t
      ON t.company_id = c.id
     AND t.workshop_area = 'production'
     AND t.production_stage_id = s.id
    JOIN workshop_task_template_items i ON i.template_id = t.id
    WHERE c.id = '29677f68-967e-4256-92fd-492bb580e888'
       OR c.name ILIKE '%Phúc Đạt%'
       OR c.name ILIKE '%Phuc Dat%'
    GROUP BY s.name, t.name;
  `;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    await runQuery(target.ref, SQL, `${target.label}/487`);
    const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
    console.log('Verify:', JSON.stringify(verify));
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
