/**
 * Migration 588: HCB Tủ bếp — Kanban tới Hoàn thiện + nhánh Công nợ.
 * Usage: node scripts/run-migration-588.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '588_hcb_tubep_kanban_to_hoan_thien.sql'),
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
SELECT wpt.name AS loai, pps.order_index, pps.name, pps.deadline_group, pps.is_handover_to_logistics,
  (SELECT COUNT(*) FROM projects p WHERE p.sx_kanban_column_id = pps.id) AS projects,
  (SELECT COUNT(*) FROM workshop_task_template_items i
   JOIN workshop_task_templates t ON t.id = i.template_id
   WHERE t.production_stage_id = pps.id) AS template_items
FROM production_pipeline_stages pps
JOIN companies c ON c.id = pps.company_id
JOIN workshop_project_types wpt ON wpt.id = pps.workshop_type_id
WHERE (c.short_name ILIKE 'HCB' OR c.name ILIKE '%Hucabi%')
  AND lower(trim(wpt.name)) IN ('tủ bếp', 'công nợ')
ORDER BY wpt.order_index, pps.order_index;
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\\n=== ${label} ===`);
    await runQuery(ref, SQL, label);
    const rows = await runQuery(ref, VERIFY_SQL, `${label}-verify`);
    console.log(JSON.stringify(rows, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
