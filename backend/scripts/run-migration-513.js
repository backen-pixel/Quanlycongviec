/**
 * Migration 513: 4-section daily report + deal metrics
 * Usage: node scripts/run-migration-513.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '513_crm_daily_report_4_sections.sql'),
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
    await runQuery(ref, SQL, label);
    console.log('OK');
  }
  const check = await runQuery(
    PRIMARY_REF,
    `SELECT t.role_key, i.section, count(*)::int AS n
     FROM crm_daily_report_template_items i
     JOIN crm_daily_report_templates t ON t.id = i.template_id
     WHERE t.id IN ('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002')
     GROUP BY 1,2 ORDER BY 1,2`,
    'CHECK',
  );
  console.log(JSON.stringify(check, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
