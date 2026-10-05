/**
 * Migration 580: lắp xong → tắt deadline toàn dự án.
 * Chạy trên primary và backup, sau đó xác minh trigger + dữ liệu backfill.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '580_clear_all_project_deadlines_after_install_done.sql'),
  'utf8',
);

const VERIFY_SQL = `
SELECT
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'clear_all_project_deadlines_after_install_done'
  ) AS function_ok,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_clear_all_project_deadlines_after_install_done'
      AND NOT tgisinternal
  ) AS trigger_ok,
  (
    SELECT count(*) FROM projects
    WHERE status::text = 'completed' AND completed_date IS NULL
  ) AS completed_without_date,
  (
    SELECT count(*) FROM projects
    WHERE status::text = 'completed'
      AND (
        deadline IS NOT NULL
        OR production_deadline IS NOT NULL
        OR design_deadline IS NOT NULL
        OR sx_kanban_deadline_at IS NOT NULL
      )
  ) AS completed_project_deadlines,
  (
    SELECT count(*)
    FROM crm_tasks t
    JOIN crm_leads l ON l.id = t.lead_id
    JOIN projects p ON p.id = l.project_id
    WHERE p.status::text = 'completed' AND t.deadline IS NOT NULL
  ) AS completed_crm_task_deadlines,
  (
    SELECT count(*)
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE p.status::text = 'completed' AND t.due_date IS NOT NULL
  ) AS completed_workshop_task_deadlines;
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

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`Applying ${label}...`);
    await runQuery(ref, SQL, label);
    const result = await runQuery(ref, VERIFY_SQL, `${label}-VERIFY`);
    console.log(`${label} verify:`, JSON.stringify(result));
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
