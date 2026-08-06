/**
 * Migration 502: crm_deal_projects — 1 deal ↔ nhiều dự án SX
 * Usage: node scripts/run-migration-502.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '502_crm_deal_projects.sql'),
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
    try {
      await runQuery(ref, SQL, label);
      const rows = await runQuery(ref, `
        SELECT COUNT(*)::int AS links,
               COUNT(*) FILTER (WHERE is_primary)::int AS primary_links
        FROM crm_deal_projects
      `, `${label}-verify`);
      console.log(rows);
    } catch (e) {
      console.error(e.message);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
