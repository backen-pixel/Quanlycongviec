/**
 * Migration 567: Business Blueprint control plane.
 * Usage: npm run db:migrate:567
 * Requires SUPABASE_ACCESS_TOKEN and SUPABASE_URL in backend/.env.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const sql = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '567_business_blueprint_control_plane.sql'),
  'utf8',
);

function projectRefFromUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host.endsWith('.supabase.co') ? host.split('.')[0] : '';
  } catch {
    return '';
  }
}

async function runQuery(projectRef, query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${body}`);
  try { return JSON.parse(body); } catch { return body; }
}

const verifySql = `
select
  to_regclass('public.business_blueprints') is not null as has_blueprints,
  to_regclass('public.business_blueprint_versions') is not null as has_versions,
  to_regclass('public.tenant_blueprint_installations') is not null as has_installations,
  to_regprocedure('public.publish_business_blueprint_version(uuid,uuid)') is not null as has_publish_rpc;
`;

async function main() {
  const projectRef = process.env.PRIMARY_PROJECT_REF || projectRefFromUrl(supabaseUrl);
  if (!token) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
  if (!projectRef) throw new Error('Không xác định được Supabase project ref từ SUPABASE_URL.');

  console.log(`Applying migration 567 to project ${projectRef}…`);
  await runQuery(projectRef, sql);
  const verification = await runQuery(projectRef, verifySql);
  const row = Array.isArray(verification) ? verification[0] : verification;
  if (!row || Object.values(row).some((value) => value !== true)) {
    throw new Error(`Migration chạy xong nhưng kiểm tra schema chưa đạt: ${JSON.stringify(verification)}`);
  }
  console.log('Migration 567 verified:', row);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
