/**
 * Migration 563: Trương Trọng Thành → mọi dự án HCB + mặc định SX/LĐ.
 * Usage: node scripts/run-migration-563.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '563_hcb_truong_trong_thanh_all_projects.sql'),
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
SELECT u.email, u.full_name, u.role,
  (SELECT COUNT(*) FROM project_production_staff s WHERE s.user_id = u.id) AS projects_staff,
  (SELECT COUNT(*) FROM lead_members lm WHERE lm.user_id = u.id) AS deal_members,
  (SELECT COUNT(*) FROM production_workshop_type_default_staff d WHERE d.user_id = u.id) AS default_types,
  (SELECT COUNT(*) FROM projects p WHERE p.company_id = '18c2563f-3495-498d-8199-23200c9f420e' AND p.logistics_person_id = u.id) AS hcb_logistics,
  (SELECT COUNT(*) FROM projects p WHERE p.company_id = '18c2563f-3495-498d-8199-23200c9f420e' AND p.installer_person_id = u.id) AS hcb_installer,
  (SELECT responsible_user_id = u.id AND installer_user_id = u.id
     FROM logistics_handover_settings s
     WHERE s.logistics_company_id = '18c2563f-3495-498d-8199-23200c9f420e') AS hcb_ld_default
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
