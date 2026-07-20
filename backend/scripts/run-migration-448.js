/**
 * Chạy migration 448 (xóa deadline lead chưa có SĐT) trên Primary + Backup.
 * Usage: node scripts/run-migration-448.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '448_clear_deadlines_leads_without_phone.sql'),
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
WITH no_phone AS (
  SELECT l.id
  FROM crm_leads l
  LEFT JOIN customers c ON c.id = l.customer_id
  WHERE (l.phone IS NULL OR btrim(l.phone) = '')
    AND (c.phone IS NULL OR btrim(c.phone) = '')
)
SELECT
  (SELECT COUNT(*) FROM no_phone) AS no_phone_leads,
  (SELECT COUNT(*) FROM crm_leads l JOIN no_phone n ON n.id = l.id WHERE l.kanban_deadline_at IS NOT NULL) AS remain_kanban_deadline,
  (SELECT COUNT(*) FROM crm_tasks t JOIN no_phone n ON n.id = t.lead_id
    WHERE t.deadline IS NOT NULL
      AND COALESCE(t.status,'') NOT IN ('completed','done','cancelled','canceled')) AS remain_open_task_deadlines;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, SQL, `${target.label}/448`);
      console.log('Migration 448 applied:', JSON.stringify(result).slice(0, 600));
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log('Verify:', JSON.stringify(verify));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
