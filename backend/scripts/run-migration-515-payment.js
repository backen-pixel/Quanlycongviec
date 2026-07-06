/**
 * Chạy migration 515 (payment) trên Primary + Backup.
 * Usage: node scripts/run-migration-515-payment.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '515_saas_payment.sql'), 'utf8');

async function runQuery(ref, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query: SQL }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN');
    process.exit(1);
  }
  for (const t of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`=== ${t.label} (${t.ref}) — 515_saas_payment ===`);
    await runQuery(t.ref, t.label);
    console.log('OK');
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
