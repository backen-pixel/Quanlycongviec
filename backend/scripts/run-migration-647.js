/**
 * Migration 647: gỡ Trương Trọng Thành khỏi đội SX/VC và thành viên deal.
 * Usage: node scripts/run-migration-647.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '647_remove_truong_trong_thanh_assignments.sql'),
  'utf8',
);

async function runQuery(ref, query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text.slice(0, 800)}`);
  try { return JSON.parse(text); } catch { return text; }
}

const VERIFY_SQL = `
SELECT u.email, u.is_active,
  (SELECT COUNT(*) FROM project_production_staff s WHERE s.user_id = u.id) AS staff,
  (SELECT COUNT(*) FROM lead_members lm WHERE lm.user_id = u.id) AS members,
  (SELECT COUNT(*) FROM production_workshop_type_default_staff d WHERE d.user_id = u.id) AS defaults,
  (SELECT COUNT(*) FROM projects p WHERE p.production_person_id = u.id OR p.logistics_person_id = u.id OR p.installer_person_id = u.id) AS person_fields
FROM users u
WHERE u.id = '646e364e-504d-4362-af1a-4f4694b0d05d'
   OR lower(trim(u.email)) = 'trongthanh0800@gmail.com';
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
