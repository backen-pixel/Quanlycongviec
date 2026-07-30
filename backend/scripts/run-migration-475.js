/**
 * Migration 475: RPC phân trang nhiều cột CRM Kanban.
 * Usage: node scripts/run-migration-475.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '475_crm_kanban_stage_pages_rpc.sql'),
  'utf8',
);

async function runQuery(ref, query, label) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`[${label}] ${response.status}: ${text}`);
  return text;
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }
  const verifySql = `
SELECT to_regprocedure(
  'public.crm_kanban_stage_page_ids(text,jsonb,uuid,uuid,uuid,text,text,text,text,boolean,uuid[],text,boolean)'
) IS NOT NULL AS rpc_installed;
`;
  for (const [label, ref] of [['PRIMARY', PRIMARY_REF], ['BACKUP', BACKUP_REF]]) {
    console.log(`\n=== ${label} (${ref}) ===`);
    await runQuery(ref, SQL, label);
    console.log(await runQuery(ref, verifySql, `${label}-verify`));
  }
  console.log('\nDone.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
