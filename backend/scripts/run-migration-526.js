/**
 * Migration 526: VPT vào module VC/LĐ + gán lapdat3.vpt@gmail.com.
 * Usage: node scripts/run-migration-526.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '526_vpt_logistics_lapdat3.sql'),
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
SELECT c.name AS company,
  eu.name AS khoi,
  u.email, u.full_name, u.role, u.company_id IS NOT NULL AS has_company,
  d.name AS department,
  umr.module_key, umr.role AS module_role
FROM companies c
JOIN company_division_units cdu ON cdu.company_id = c.id
JOIN ecosystem_units eu ON eu.id = cdu.division_unit_id
LEFT JOIN users u ON lower(trim(u.email)) = 'lapdat3.vpt@gmail.com'
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN user_module_roles umr ON umr.user_id = u.id AND umr.module_key = 'logistics'
WHERE (c.id = '991dc79d-cbf5-49f9-a364-35227cb47635' OR c.name ILIKE '%Vạn Phú Thành%')
  AND eu.name ILIKE '%lắp đặt%'
LIMIT 5;
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
