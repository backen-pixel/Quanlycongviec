/**
 * Migration 498: Chuẩn hóa pipeline VC/LĐ 6 giai đoạn.
 * Usage: node scripts/run-migration-498.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '498_vc_ld_pipeline_six_stages.sql'),
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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');

  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} (${ref}) ===`);
    await runQuery(ref, SQL, label);
    const rows = await runQuery(ref, `
      SELECT COALESCE(c.short_name, '(global)') AS company,
             s.order_index, s.name, s.is_active, s.bucket_slug, s.crm_sync_type
      FROM logistics_pipeline_stages s
      LEFT JOIN companies c ON c.id = s.company_id
      WHERE s.is_active = true
        AND (s.company_id IS NULL OR s.company_id = '29677f68-967e-4256-92fd-492bb580e888')
      ORDER BY s.company_id NULLS FIRST, s.order_index
    `, `${label}-verify`);
    console.table(rows);
  }
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
