/**
 * 598: HCB bộ mẫu 5 cột + ghi hạn Kanban từ ngày lắp.
 * Usage: node scripts/run-migration-598.js
 *        node scripts/run-migration-598.js --deadlines-only
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const HCB = '18c2563f-3495-498d-8199-23200c9f420e';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '598_hcb_sx_column_templates.sql'),
  'utf8',
);
const { computeSxInstallPlanDeadline, isAutoInstallPlanDeadlineReason } = require('../src/helpers/sxInstallPlanKanbanDeadline');

const deadlinesOnly = process.argv.includes('--deadlines-only');

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
SELECT wpt.name AS loai, t.name, t.is_default, t.is_active, pps.name AS cot,
  (SELECT COUNT(*) FROM workshop_task_template_items i WHERE i.template_id = t.id) AS items
FROM workshop_task_templates t
JOIN workshop_project_types wpt ON wpt.id = t.workshop_type_id
LEFT JOIN production_pipeline_stages pps ON pps.id = t.production_stage_id
WHERE t.company_id = '${HCB}'
  AND t.workshop_area = 'production'
  AND lower(trim(wpt.name)) IN ('tủ bếp', 'cánh kính', 'cửa')
ORDER BY wpt.name, t.order_index, t.name;
`;

const LOAD_DEADLINE_SQL = `
SELECT p.id, p.company_id, p.install_date, p.delivery_date,
  p.sx_reception_date, p.created_at, p.sx_schedule_slip_days,
  p.sx_kanban_deadline_at, p.sx_kanban_deadline_reason,
  pps.deadline_group, pps.name AS stage_name
FROM projects p
JOIN production_pipeline_stages pps ON pps.id = p.sx_kanban_column_id
JOIN workshop_project_types wpt ON wpt.id = pps.workshop_type_id
WHERE p.company_id = '${HCB}'
  AND lower(trim(wpt.name)) IN ('tủ bếp', 'cánh kính', 'cửa')
  AND pps.deadline_group IS NOT NULL
  AND COALESCE(p.status::text, '') NOT IN ('cancelled', 'canceled');
`;

function sqlLit(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function backfillDeadlines(ref, label) {
  const rows = await runQuery(ref, LOAD_DEADLINE_SQL, `${label}-load-dl`);
  const list = Array.isArray(rows) ? rows : [];
  const updates = [];
  for (const p of list) {
    if (!isAutoInstallPlanDeadlineReason(p.sx_kanban_deadline_reason) && p.sx_kanban_deadline_at) {
      continue;
    }
    const computed = computeSxInstallPlanDeadline(p, { deadline_group: p.deadline_group });
    if (!computed?.iso) continue;
    const nextIso = new Date(computed.iso).toISOString();
    if (String(p.sx_kanban_deadline_at || '') === nextIso) continue;
    updates.push({ id: p.id, iso: nextIso, reason: computed.reason });
  }
  let applied = 0;
  const chunk = 40;
  for (let i = 0; i < updates.length; i += chunk) {
    const part = updates.slice(i, i + chunk);
    const values = part.map((u) => `(${sqlLit(u.id)}::uuid, ${sqlLit(u.iso)}::timestamptz, ${sqlLit(u.reason)})`).join(',\n');
    const q = `
      UPDATE projects p
      SET sx_kanban_deadline_at = v.iso,
          sx_kanban_deadline_reason = v.reason,
          updated_at = NOW()
      FROM (VALUES ${values}) AS v(id, iso, reason)
      WHERE p.id = v.id;
    `;
    await runQuery(ref, q, `${label}-dl-${i}`);
    applied += part.length;
  }
  return { scanned: list.length, applied };
}

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} ===`);
    if (!deadlinesOnly) {
      await runQuery(ref, SQL, label);
      const rows = await runQuery(ref, VERIFY_SQL, `${label}-verify`);
      console.log(JSON.stringify(rows, null, 2));
    }
    const dl = await backfillDeadlines(ref, label);
    console.log('deadlines', dl);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
