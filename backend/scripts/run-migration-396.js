/**
 * Chạy migration 396 (time_scope day_cycle) trên Primary và Backup.
 * Usage: node scripts/run-migration-396.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL_FILE = path.join(__dirname, '..', '..', 'database', '396_ai_bot_time_scope_day_cycle.sql');

async function runQuery(projectRef, label, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`[${label}] HTTP ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  for (const t of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n=== ${t.label} (${t.ref}) ===`);
    await runQuery(t.ref, t.label, sql);
    console.log('OK');
  }
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
