/**
 * Huy Metalla + Lê Huy Tiến Toại → role admin, company_id = Metalla (admin công ty).
 * Usage: node scripts/set-metalla-company-admins.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const METALLA = 'b78baba2-2486-434c-a72d-9c937fac2164';

const SQL = `
UPDATE users
SET role = 'admin', company_id = '${METALLA}'
WHERE id IN (
  'defa39da-c514-4cd8-bfe5-68fcbb8eb09b',
  '717cee7b-dedc-4226-8979-9829cf110cb0'
)
RETURNING id, full_name, email, role, company_id;
`;

async function run(ref, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: SQL }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
  console.log(`\n========== ${label} ==========`);
  console.log(text);
}

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  await run(PRIMARY_REF, 'PRIMARY');
  await run(BACKUP_REF, 'BACKUP');
  console.log('\n✅ Huy + Toại = admin công ty Metalla (cần đăng nhập lại)');
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
