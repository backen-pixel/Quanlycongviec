/**
 * Migration 480: allow assignment_module = logistics.
 * Usage: node scripts/run-migration-480.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '480_crm_assignments_assignment_module_logistics.sql'),
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
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }
  for (const [ref, label] of [[PRIMARY_REF, 'primary'], [BACKUP_REF, 'backup']]) {
    console.log(`Applying 480 on ${label} (${ref})…`);
    await runQuery(ref, SQL, label);
    const check = await runQuery(
      ref,
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'crm_assignments_assignment_module_check';`,
      `${label}-verify`,
    );
    console.log(label, check);
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
