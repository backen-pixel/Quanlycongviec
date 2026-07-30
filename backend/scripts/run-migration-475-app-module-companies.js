/**
 * Migration 475: app_module_companies (multi-company share).
 * Usage: node scripts/run-migration-475.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL_PRIMARY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '475_app_module_companies.sql'),
  'utf8',
);

/** Backup: tránh FK companies nếu schema lệch */
const SQL_BACKUP = `
BEGIN;
CREATE TABLE IF NOT EXISTS app_module_companies (
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (module_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_app_module_companies_company ON app_module_companies(company_id);
ALTER TABLE app_module_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_companies" ON app_module_companies;
CREATE POLICY "service_all_app_module_companies" ON app_module_companies FOR ALL USING (true) WITH CHECK (true);
INSERT INTO app_module_companies (module_id, company_id)
SELECT id, company_id FROM app_modules WHERE company_id IS NOT NULL
ON CONFLICT DO NOTHING;
COMMIT;
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
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN');
    process.exit(1);
  }
  for (const t of [
    { ref: PRIMARY_REF, label: 'PRIMARY', sql: SQL_PRIMARY },
    { ref: BACKUP_REF, label: 'BACKUP', sql: SQL_BACKUP },
  ]) {
    console.log(`\n========== ${t.label} ==========`);
    try {
      await runQuery(t.ref, t.sql, `${t.label}/475`);
      const v = await runQuery(t.ref, `SELECT to_regclass('public.app_module_companies') AS t;`, `${t.label}/v`);
      console.log('OK', JSON.stringify(v));
    } catch (e) {
      console.error('FAIL', e.message);
      process.exitCode = 1;
    }
  }
}

main();
