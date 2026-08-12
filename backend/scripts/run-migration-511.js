/**
 * Migration 511: extra daily report metrics (events, interactions, stage moves)
 * Usage: node scripts/run-migration-511.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '511_crm_daily_report_extra_metrics.sql'),
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
    `SELECT t.role_key, i.label, i.metric_key, i.order_index
     FROM crm_daily_report_template_items i
     JOIN crm_daily_report_templates t ON t.id = i.template_id
     WHERE i.metric_key IN ('events_count','interactions','stage_moves')
     ORDER BY t.role_key, i.order_index`,
    'CHECK',
  );
  console.log(JSON.stringify(check, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
