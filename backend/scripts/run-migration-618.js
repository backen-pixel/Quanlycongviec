/**
 * 618: CRM — tự thêm thành viên khi deal vào cột pipeline.
 * Usage: node scripts/run-migration-618.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '618_crm_pipeline_stage_default_members.sql'),
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
SELECT s.name, s.auto_add_members_on_enter, COUNT(m.user_id) AS members
FROM crm_pipeline_stages s
JOIN crm_pipelines p ON p.id = s.pipeline_id
LEFT JOIN crm_pipeline_stage_default_members m ON m.stage_id = s.id
WHERE p.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND s.pipeline_type = 'deal'
  AND s.is_won = true
GROUP BY s.id, s.name, s.auto_add_members_on_enter;
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} ===`);
    const out = await runQuery(ref, SQL, label);
    console.log(JSON.stringify(out, null, 2).slice(0, 1500));
    const rows = await runQuery(ref, VERIFY_SQL, `${label}-verify`);
    console.log(JSON.stringify(rows, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
