/**
 * 620: enum ecosystem_admin + gán Admin Hệ Thống.
 * ALTER TYPE phải COMMIT trước UPDATE dùng giá trị mới.
 * Usage: node scripts/run-migration-620.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const ENUM_SQL = `
DO $enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
      AND e.enumlabel = 'ecosystem_admin'
  ) THEN
    EXECUTE 'ALTER TYPE user_role ADD VALUE ''ecosystem_admin''';
  END IF;
END $enum$;
`;

const ASSIGN_SQL = `
INSERT INTO roles (name, description, is_system)
SELECT
  'ecosystem_admin',
  'Quản trị toàn hệ sinh thái — mọi công ty trong HST, không vượt tenant',
  true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ecosystem_admin');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r_new.id, rp.permission_id
FROM roles r_new
JOIN roles r_admin ON r_admin.name = 'admin'
JOIN role_permissions rp ON rp.role_id = r_admin.id
WHERE r_new.name = 'ecosystem_admin'
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions x
    WHERE x.role_id = r_new.id
      AND x.permission_id = rp.permission_id
  );

UPDATE users
SET role = 'ecosystem_admin'
WHERE id = '0db73a17-8ac2-4aaa-b2a8-c8f90360d77e'
   OR lower(email) = 'admin@tubep.vn';
`;

const VERIFY_SQL = `
SELECT u.id, u.email, u.full_name, u.role::text AS role, u.company_id, u.tenant_id
FROM users u
WHERE u.id = '0db73a17-8ac2-4aaa-b2a8-c8f90360d77e'
   OR lower(u.email) = 'admin@tubep.vn';
`;

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

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} enum ===`);
    await runQuery(ref, ENUM_SQL, `${label}-enum`);
    console.log(`=== ${label} assign ===`);
    await runQuery(ref, ASSIGN_SQL, `${label}-assign`);
    const rows = await runQuery(ref, VERIFY_SQL, `${label}-verify`);
    console.log(JSON.stringify(rows, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
