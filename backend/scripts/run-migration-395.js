/**
 * Chạy migration 511 (lịch nhắc việc) trên Primary và Backup.
 * Usage: node scripts/run-migration-511.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL_FILE = path.join(__dirname, '..', '..', 'database', '395_ai_bot_reminder_schedules.sql');

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

async function verify(projectRef, label) {
  const checks = await runQuery(projectRef, label, `
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'schedule_kind'
      ) AS has_schedule_kind,
      (SELECT COUNT(*)::int FROM ai_chat_bot_playbooks WHERE code = 'reminder_notify') AS reminder_playbook;
  `);
  return checks;
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  const targets = [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ];

  for (const t of targets) {
    console.log(`\n=== ${t.label} (${t.ref}) ===`);
    console.log('Applying 395_ai_bot_reminder_schedules.sql...');
    await runQuery(t.ref, t.label, sql);
    const v = await verify(t.ref, t.label);
    console.log('Verify:', JSON.stringify(v, null, 2));
  }
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
