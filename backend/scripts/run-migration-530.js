/**
 * Migration 530: HCB deadlines → 17:30 VN.
 * Usage: node scripts/run-migration-530.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '530_hcb_deadlines_1730.sql'),
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
SELECT 'projects.sx_kanban' AS src, COUNT(*) FILTER (WHERE sx_kanban_deadline_at IS NOT NULL) AS n,
  COUNT(*) FILTER (WHERE to_char(sx_kanban_deadline_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') = '17:30') AS at_1730
FROM projects WHERE company_id = '18c2563f-3495-498d-8199-23200c9f420e'
UNION ALL
SELECT 'crm_leads.kanban HCB co', COUNT(*) FILTER (WHERE kanban_deadline_at IS NOT NULL),
  COUNT(*) FILTER (WHERE to_char(kanban_deadline_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') = '17:30')
FROM crm_leads WHERE company_id = '18c2563f-3495-498d-8199-23200c9f420e';
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
  console.log('Applying 530 on primary…');
  const primary = await runQuery(PRIMARY_REF, SQL, 'primary');
  console.log('primary:', primary);
  console.log('Applying 530 on backup…');
  const backup = await runQuery(BACKUP_REF, SQL, 'backup');
  console.log('backup:', backup);
  const rows = await runQuery(PRIMARY_REF, VERIFY_SQL, 'verify');
  console.log('OK:', rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
