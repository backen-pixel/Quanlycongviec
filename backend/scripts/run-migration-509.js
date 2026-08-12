/**
 * Migration 509: CRM daily reports (báo cáo ngày chấm công)
 * Usage: node scripts/run-migration-509.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '509_crm_daily_reports.sql'),
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

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} ===`);
    const result = await runQuery(ref, SQL, label);
    console.log(JSON.stringify(result, null, 2).slice(0, 500));
  }

  const check = await runQuery(
    PRIMARY_REF,
    `SELECT t.role_key, t.name, count(i.id)::int AS items
       FROM crm_daily_report_templates t
       LEFT JOIN crm_daily_report_template_items i ON i.template_id = t.id
      GROUP BY t.role_key, t.name
      ORDER BY t.role_key`,
    'CHECK',
  );
  console.log('\n=== VERIFY PRIMARY ===');
  console.log(JSON.stringify(check, null, 2));
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
