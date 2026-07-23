/**
 * Migration 457: NextGo — loại sản phẩm + bộ nhiệm vụ SX.
 * Usage: node scripts/run-migration-457.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '457_nextgo_product_types_task_templates.sql'),
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
SELECT t.name AS template, wt.name AS product_type, t.is_default,
       (SELECT COUNT(*) FROM workshop_task_template_items i WHERE i.template_id = t.id) AS items
FROM workshop_task_templates t
LEFT JOIN workshop_project_types wt ON wt.id = t.workshop_type_id
WHERE t.company_id = (
  SELECT id FROM companies WHERE name ILIKE '%NextGo%' OR short_name ILIKE '%NextGo%' LIMIT 1
)
  AND t.workshop_area = 'production'
  AND t.is_active IS DISTINCT FROM false
ORDER BY t.order_index, t.name;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      await runQuery(target.ref, SQL, `${target.label}/457`);
      console.log('Migration 457 applied.');
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log(JSON.stringify(verify, null, 2));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
