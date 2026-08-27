/** Migration 582: Company-scoped Business Blueprint installations. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const sql = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '582_company_blueprint_installations.sql'),
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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${body}`);
  try { return JSON.parse(body); } catch { return body; }
}

async function main() {
  const projectRef = process.env.PRIMARY_PROJECT_REF || projectRefFromUrl(supabaseUrl);
  if (!token) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
  if (!projectRef) throw new Error('Không xác định được Supabase project ref từ SUPABASE_URL.');
  console.log(`Applying migration 582 to project ${projectRef}…`);
  await runQuery(projectRef, sql);
  const verification = await runQuery(projectRef, `
    select
      to_regclass('public.company_blueprint_installations') is not null as has_company_installations,
      to_regprocedure('public.enforce_company_blueprint_tenant_scope()') is not null as has_scope_function,
      exists (select 1 from pg_indexes where schemaname='public' and tablename='company_blueprint_installations' and indexname='idx_company_blueprint_installations_company') as has_company_index;
  `);
  const row = Array.isArray(verification) ? verification[0] : verification;
  if (!row || Object.values(row).some((value) => value !== true)) {
    throw new Error(`Kiểm tra schema chưa đạt: ${JSON.stringify(verification)}`);
  }
  console.log('Migration 582 verified:', row);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
