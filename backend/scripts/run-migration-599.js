/**
 * 599: HCB Tủ bếp gom 5 cột (588 đã no-op vì tên KCS).
 * Sau đó chạy 598 (bộ mẫu + backfill hạn).
 * Usage: node scripts/run-migration-599.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '599_hcb_tubep_kanban_retry.sql'),
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
  (SELECT COUNT(*) FROM projects p WHERE p.sx_kanban_column_id = pps.id) AS projects
FROM production_pipeline_stages pps
JOIN workshop_project_types wpt ON wpt.id = pps.workshop_type_id
WHERE pps.company_id = '18c2563f-3495-498d-8199-23200c9f420e'
  AND lower(trim(wpt.name)) IN ('tủ bếp', 'công nợ')
  AND pps.is_active IS DISTINCT FROM false
ORDER BY wpt.name, pps.order_index;
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} 599 ===`);
    await runQuery(ref, SQL, label);
    const rows = await runQuery(ref, VERIFY_SQL, `${label}-verify`);
    console.log(JSON.stringify(rows, null, 2));
  }
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'run-migration-598.js')], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status) process.exit(r.status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
