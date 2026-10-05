/**
 * Migration 590: gom cột Công nợ HCB trùng tên.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '590_hcb_congno_dedupe.sql'),
  'utf8',
);

async function runQuery(ref, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${ref} ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

const VERIFY = `
SELECT pps.order_index, pps.name,
  (SELECT COUNT(*) FROM projects p WHERE p.sx_kanban_column_id = pps.id) AS projects
FROM production_pipeline_stages pps
JOIN companies c ON c.id = pps.company_id
JOIN workshop_project_types wpt ON wpt.id = pps.workshop_type_id
WHERE (c.short_name ILIKE 'HCB' OR c.name ILIKE '%Hucabi%')
  AND lower(trim(wpt.name)) = 'công nợ'
ORDER BY pps.order_index;
`;

async function main() {
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log('\n===', label, '===');
    await runQuery(ref, SQL);
    console.log(JSON.stringify(await runQuery(ref, VERIFY), null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
