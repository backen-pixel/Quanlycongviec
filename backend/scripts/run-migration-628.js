/**
 * 628: Deadline CRM không ẩn vì thiếu SĐT.
 * Usage: node scripts/run-migration-628.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '628_crm_deadline_always_show.sql'),
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
SELECT p.proname,
  (pg_get_functiondef(p.oid) LIKE '%NOT s.has_display_phone%') AS still_hides_on_no_phone
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('crm_deadline_bucket_counts', 'crm_deadline_bucket_page_ids', 'crm_effective_deadline_at');
`;

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\\n=== ${label} ===`);
    await runQuery(ref, SQL, label);
    const verify = await runQuery(ref, VERIFY_SQL, `${label} verify`);
    console.log(JSON.stringify(verify, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
