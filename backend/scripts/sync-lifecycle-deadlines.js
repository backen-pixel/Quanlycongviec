/**
 * Dọn hạn chồng theo vòng đời CRM → SX → lắp.
 * Mặc định dry-run. Áp: node scripts/sync-lifecycle-deadlines.js --apply
 *
 * Giữ install_date / delivery_date / production_finish_date.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const APPLY = process.argv.includes('--apply');
const SQL_PATH = path.join(__dirname, '..', '..', 'database', '619_sync_lifecycle_deadlines.sql');

const PREVIEW_SQL = `
SELECT 'crm_kanban_lost_won' AS bucket, COUNT(*)::int AS n
FROM crm_leads l
JOIN crm_pipeline_stages st ON st.id = l.stage_id
WHERE l.kanban_deadline_at IS NOT NULL
  AND (
    COALESCE(st.is_lost,false) OR COALESCE(st.is_won,false)
    OR COALESCE(st.counts_as_completed_revenue,false)
    OR COALESCE(st.canonical_slug,'') IN ('won','lost','completed','done')
  )
UNION ALL
SELECT 'crm_kanban_after_sx', COUNT(*)::int
FROM crm_leads WHERE project_id IS NOT NULL AND kanban_deadline_at IS NOT NULL
UNION ALL
SELECT 'crm_task_lost_won', COUNT(*)::int
FROM crm_tasks t
JOIN crm_leads l ON l.id = t.lead_id
JOIN crm_pipeline_stages st ON st.id = l.stage_id
WHERE t.deadline IS NOT NULL AND t.status IN ('pending','in_progress')
  AND (COALESCE(st.is_lost,false) OR COALESCE(st.is_won,false) OR COALESCE(st.counts_as_completed_revenue,false))
UNION ALL
SELECT 'crm_task_after_sx', COUNT(*)::int
FROM crm_tasks t
JOIN crm_leads l ON l.id = t.lead_id
WHERE l.project_id IS NOT NULL AND t.deadline IS NOT NULL
  AND t.status IN ('pending','in_progress')
  AND COALESCE(t.stage_slug,'') NOT LIKE 'sx_%'
  AND COALESCE(t.stage_slug,'') NOT LIKE 'vc_%'
  AND COALESCE(t.stage_slug,'') NOT LIKE 'ld_%'
UNION ALL
SELECT 'assignment_overlap', COUNT(*)::int
FROM crm_assignments a
JOIN crm_leads l ON l.id = a.lead_id
LEFT JOIN crm_pipeline_stages st ON st.id = l.stage_id
WHERE a.deadline IS NOT NULL AND a.status IN ('pending','in_progress')
  AND (COALESCE(st.is_lost,false) OR COALESCE(st.is_won,false) OR l.project_id IS NOT NULL)
UNION ALL
SELECT 'sx_deadline_after_giao', COUNT(*)::int
FROM projects p
LEFT JOIN production_pipeline_stages pps ON pps.id = p.sx_kanban_column_id
WHERE (p.sx_kanban_deadline_at IS NOT NULL OR p.production_deadline IS NOT NULL)
  AND (
    p.logistics_company_id IS NOT NULL OR p.vc_kanban_column_id IS NOT NULL
    OR p.status IN ('shipping','installing','warranty','completed')
    OR COALESCE(pps.counts_as_completed_revenue,false)
    OR COALESCE(pps.counts_as_collected_revenue,false)
    OR COALESCE(pps.is_handover_to_logistics,false)
    OR pps.name ILIKE '%đã giao%' OR pps.name ILIKE '%bàn giao%'
  );
`;

async function runQuery(ref, query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
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

function printPreview(label, rows) {
  console.log(`\n${label}`);
  for (const row of rows || []) {
    console.log(`  ${row.bucket}: ${row.n}`);
  }
}

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  const targets = [
    [PRIMARY_REF, 'PRIMARY'],
    [BACKUP_REF, 'BACKUP'],
  ];

  for (const [ref, label] of targets) {
    const before = await runQuery(ref, PREVIEW_SQL, `${label}-preview`);
    printPreview(`${label} trước`, before);
    if (!APPLY) continue;

    const snap = {
      at: new Date().toISOString(),
      label,
      before,
    };
    const snapPath = path.join(
      __dirname,
      '..',
      'uploads',
      `_lifecycle_deadline_sync_${label.toLowerCase()}_${Date.now()}.json`,
    );
    fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2));
    console.log(`  snapshot ${snapPath}`);
    await runQuery(ref, sql, `${label}-apply`);
    const after = await runQuery(ref, PREVIEW_SQL, `${label}-after`);
    printPreview(`${label} sau`, after);
  }

  if (!APPLY) {
    console.log('\nDry-run. Chạy thêm --apply để ghi primary + backup.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
