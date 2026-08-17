/**
 * Migration 528: project_workshop_placements (xưởng đặt xưởng).
 * Usage: node scripts/run-migration-528.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '528_project_workshop_placements.sql'),
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

const VERIFY_SQL = `
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'project_workshop_placements';
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
  console.log('Applying 528 on primary…');
  await runQuery(PRIMARY_REF, SQL, 'primary');
  console.log('Applying 528 on backup…');
  await runQuery(BACKUP_REF, SQL, 'backup');
  const rows = await runQuery(PRIMARY_REF, VERIFY_SQL, 'verify');
  console.log('OK:', rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
