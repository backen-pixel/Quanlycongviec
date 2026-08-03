/**
 * Migration 489: push_device_tokens.app_key — tách push theo app SX/VC/CRM.
 * Usage: node scripts/run-migration-489.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '489_push_device_tokens_app_key.sql'),
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

  const verifySql = `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'push_device_tokens'
      AND column_name = 'app_key';
  `;

  for (const [ref, label] of [[PRIMARY_REF, 'primary'], [BACKUP_REF, 'backup']]) {
    if (!ref) continue;
    console.log(`>> ${label} (${ref}) applying…`);
    await runQuery(ref, SQL, label);
    const check = await runQuery(ref, verifySql, `${label}-verify`);
    console.log(`OK ${label}:`, JSON.stringify(check));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
