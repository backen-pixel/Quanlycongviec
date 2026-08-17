/**
 * Migration 527: Phan Quang Hùng → production_admin HCB + thêm mọi dự án SX hiện tại.
 * Usage: node scripts/run-migration-527.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '527_hcb_phan_quang_hung_admin_all_projects.sql'),
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
SELECT u.email, u.full_name, u.role, c.name AS company,
  umr.role AS module_role,
  (SELECT COUNT(*) FROM project_production_staff s WHERE s.user_id = u.id) AS projects_staff,
  (SELECT COUNT(*) FROM lead_members lm WHERE lm.user_id = u.id) AS deal_members,
  (SELECT COUNT(*) FROM production_workshop_type_default_staff d WHERE d.user_id = u.id) AS default_types
FROM users u
LEFT JOIN companies c ON c.id = u.company_id
LEFT JOIN user_module_roles umr ON umr.user_id = u.id AND umr.module_key = 'production'
WHERE lower(trim(u.email)) = 'phanquanghung@gmail.com';
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
