/**
 * Migration 589: HCB Cánh kính + Cửa — cùng mẫu 5 cột tới Hoàn thiện.
 * Usage: node scripts/run-migration-589.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '589_hcb_canh_kinh_cua_kanban.sql'),
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
  try { return JSON.parse(text); } catch { return text; }
}

const VERIFY_SQL = `
SELECT wpt.name AS loai, pps.order_index, pps.name, pps.is_active, pps.deadline_group,
  (SELECT COUNT(*) FROM projects p WHERE p.sx_kanban_column_id = pps.id) AS projects
FROM production_pipeline_stages pps
JOIN companies c ON c.id = pps.company_id
JOIN workshop_project_types wpt ON wpt.id = pps.workshop_type_id
WHERE (c.short_name ILIKE 'HCB' OR c.name ILIKE '%Hucabi%')
ORDER BY wpt.order_index, wpt.name, pps.order_index;
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} ===`);
    await runQuery(ref, SQL, label);
    const rows = await runQuery(ref, VERIFY_SQL, `${label}-verify`);
    console.log(JSON.stringify(rows, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
